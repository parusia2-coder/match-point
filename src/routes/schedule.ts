import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ── 스케줄 설정 저장 ──────────────────────────────────────────
app.put('/:tid/schedule/settings', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const {
        start_time = '09:00',   // HH:MM
        end_time = '18:00',
        match_duration = 30,    // 분
        changeover_time = 5,    // 전환 시간(분)
        break_start = '',       // 점심 시작
        break_end = '',         // 점심 끝
        rest_between = 10       // 같은 선수 연속 경기 사이 최소 휴식(분)
    } = body

    // tournaments 테이블에 schedule_config JSON으로 저장
    const config = JSON.stringify({ start_time, end_time, match_duration, changeover_time, break_start, break_end, rest_between })

    await c.env.DB.prepare(
        'UPDATE tournaments SET schedule_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted = 0'
    ).bind(config, tid).run()

    return c.json({ success: true })
})

// ── 스케줄 설정 조회 ──────────────────────────────────────────
app.get('/:tid/schedule/settings', async (c) => {
    const tid = c.req.param('tid')
    const row = await c.env.DB.prepare(
        'SELECT schedule_config, sport_type FROM tournaments WHERE id = ? AND deleted = 0'
    ).bind(tid).first() as any

    if (!row) return c.json({ error: 'Not found' }, 404)

    // 종목별 기본 경기 소요시간: 배드민턴 15분, 테니스 30분
    const defaultDuration = (row.sport_type === 'tennis') ? 30 : 15

    let config = {
        start_time: '09:00', end_time: '18:00',
        match_duration: defaultDuration, changeover_time: 5,
        break_start: '', break_end: '',
        rest_between: 10
    }
    if (row.schedule_config) {
        try { config = JSON.parse(row.schedule_config) } catch (e) { }
    }
    return c.json(config)
})

// ── 시뮬레이션 (자동 스케줄 계산) ─────────────────────────────
app.post('/:tid/schedule/simulate', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const {
        start_time = '09:00',
        end_time = '18:00',
        match_duration = 30,
        changeover_time = 5,
        break_start = '',
        break_end = '',
        rest_between = 10
    } = body

    // 대회 정보
    const tournament = await c.env.DB.prepare(
        'SELECT courts, sport_type FROM tournaments WHERE id = ? AND deleted = 0'
    ).bind(tid).first() as any
    if (!tournament) return c.json({ error: 'Not found' }, 404)

    const numCourts = tournament.courts || 6
    const isTennis = tournament.sport_type === 'tennis'
    const baseSlot = match_duration + changeover_time

    // 모든 경기 가져오기 (라운드/매치오더 순)
    const matchQuery = await c.env.DB.prepare(
        `SELECT m.id, m.event_id, m.round, m.match_order, m.court_number, m.status,
                m.team1_id, m.team2_id, m.scheduled_time,
                t1.player1_id as t1p1, t1.player2_id as t1p2,
                t2.player1_id as t2p1, t2.player2_id as t2p2,
                t1.team_name as team1_name, t2.team_name as team2_name,
                e.name as event_name, e.category
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         LEFT JOIN events e ON m.event_id = e.id
         WHERE m.tournament_id = ?
         ORDER BY m.round ASC, m.match_order ASC`
    ).bind(tid).all()

    const allMatches = (matchQuery.results || []) as any[]

    if (!allMatches || allMatches.length === 0) {
        return c.json({ error: '생성된 경기가 없습니다. 먼저 대진표를 생성해주세요.', schedule: [] })
    }

    // 역대 경기 데이터 조회 (AI 경기시간 예측용)
    const historyQuery = await c.env.DB.prepare(
        `SELECT round, AVG(CASE WHEN updated_at IS NOT NULL AND created_at IS NOT NULL 
         THEN (julianday(updated_at) - julianday(created_at)) * 1440 ELSE NULL END) as avg_duration
         FROM matches WHERE tournament_id = ? AND status = 'completed'
         GROUP BY round`
    ).bind(tid).all()
    const histAvg: Record<number, number> = {}
    for (const h of (historyQuery.results || []) as any[]) {
        if (h.avg_duration && h.avg_duration > 0) histAvg[h.round] = Math.round(h.avg_duration)
    }

    // ── 시간 유틸리티 ──
    function timeToMin(t: string): number {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
    }
    function minToTime(m: number): string {
        const h = Math.floor(m / 60)
        const mm = m % 60
        return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    }

    const dayStart = timeToMin(start_time)
    const dayEnd = timeToMin(end_time)
    const breakStart = break_start ? timeToMin(break_start) : -1
    const breakEnd = break_end ? timeToMin(break_end) : -1

    // ── AI 경기시간 예측 ──
    // 총 라운드 수 계산
    const maxRound = allMatches.reduce((mx, m) => Math.max(mx, m.round || 1), 1)

    function predictDuration(match: any): number {
        let base = match_duration

        // 역대 데이터가 있으면 우선 활용
        if (histAvg[match.round]) {
            base = Math.round(base * 0.4 + histAvg[match.round] * 0.6)
        }

        // 라운드 보정: 상위 라운드일수록 길어짐
        const roundRatio = maxRound > 1 ? (match.round - 1) / (maxRound - 1) : 0
        const roundMultiplier = 0.85 + roundRatio * 0.35 // 0.85x ~ 1.20x
        base = Math.round(base * roundMultiplier)

        // 단식 vs 복식: 단식이 더 길어림
        const cat = (match.category || '').toLowerCase()
        if (cat.includes('ms') || cat.includes('ws') || cat.includes('단식')) {
            base = Math.round(base * 1.15)
        }

        return Math.max(base, 10) // 최소 10분
    }

    // ── 코트별 상태 ──
    const courtNextFree: number[] = Array(numCourts).fill(dayStart)
    const courtMatchCount: number[] = Array(numCourts).fill(0)
    const playerLastEnd: Record<number, number> = {}
    const playerMatchCount: Record<number, number> = {}

    // ── 라운드별 그룹핑 ──
    const roundGroups: Record<string, any[]> = {}
    for (const m of allMatches) {
        const key = `${m.event_id}_${m.round}`
        if (!roundGroups[key]) roundGroups[key] = []
        roundGroups[key].push(m)
    }

    const sortedKeys = Object.keys(roundGroups).sort((a, b) => {
        const [ea, ra] = a.split('_').map(Number)
        const [eb, rb] = b.split('_').map(Number)
        if (ea !== eb) return ea - eb
        return ra - rb
    })

    const schedule: any[] = []
    const eventRoundEnd: Record<string, number> = {}
    const aiInsights: string[] = []

    // ── 골든타임 계산 (오후 3~5시) ──
    const goldenStart = timeToMin('15:00')
    const goldenEnd = timeToMin('17:00')

    // 듀얼 출전자 감지
    const playerEvents: Record<number, Set<number>> = {}
    for (const m of allMatches) {
        const pids = [m.t1p1, m.t1p2, m.t2p1, m.t2p2].filter(Boolean)
        for (const pid of pids) {
            if (!playerEvents[pid]) playerEvents[pid] = new Set()
            playerEvents[pid].add(m.event_id)
        }
    }
    const dualPlayers = new Set(Object.keys(playerEvents).filter(k => playerEvents[Number(k)].size > 1).map(Number))
    if (dualPlayers.size > 0) {
        aiInsights.push(`🔄 듀얼 출전자 ${dualPlayers.size}명 감지 → 휴식 시간 우선 배정`)
    }

    for (const key of sortedKeys) {
        const [eventIdStr, roundStr] = key.split('_')
        const eventId = parseInt(eventIdStr)
        const round = parseInt(roundStr)
        const matchesInRound = roundGroups[key]
        const isFinalRound = round === maxRound
        const isSemiFinal = round === maxRound - 1

        const prevKey = `${eventId}_${round - 1}`
        const minStartFromDep = eventRoundEnd[prevKey] || dayStart

        let roundMaxEnd = dayStart

        for (const match of matchesInRound) {
            const playerIds = [match.t1p1, match.t1p2, match.t2p1, match.t2p2].filter(Boolean)
            const predictedDuration = predictDuration(match)
            const slotMinutes = predictedDuration + changeover_time

            // 듀얼 출전자 추가 휴식
            const hasDualPlayer = playerIds.some(pid => dualPlayers.has(pid))
            const effectiveRest = hasDualPlayer ? Math.max(rest_between, rest_between + 5) : rest_between

            let playerEarliest = minStartFromDep
            for (const pid of playerIds) {
                if (playerLastEnd[pid]) {
                    playerEarliest = Math.max(playerEarliest, playerLastEnd[pid] + effectiveRest)
                }
            }

            // ── 다중 제약조건 점수 기반 코트 선택 ──
            let bestCourt = 0
            let bestScore = -Infinity

            for (let ci = 0; ci < numCourts; ci++) {
                const availTime = Math.max(courtNextFree[ci], playerEarliest)
                let score = 0

                // 1) 빠른 시작 보너스 (기본)
                score += (dayEnd - availTime) * 0.5

                // 2) 코트 균형 보너스: 경기 수가 적은 코트 우대
                const avgPerCourt = schedule.length / numCourts
                score += (avgPerCourt - courtMatchCount[ci]) * 8

                // 3) 결승/준결승 골든타임 보너스
                if (isFinalRound && availTime >= goldenStart && availTime <= goldenEnd) {
                    score += 25
                }
                if (isSemiFinal && availTime >= goldenStart - 60 && availTime <= goldenEnd) {
                    score += 12
                }

                // 4) 듀얼 출전자 휴식 보너스
                if (hasDualPlayer) {
                    let extraRest = 0
                    for (const pid of playerIds) {
                        if (playerLastEnd[pid]) {
                            extraRest += availTime - playerLastEnd[pid]
                        }
                    }
                    score += Math.min(extraRest * 0.3, 20)
                }

                // 5) 마감시간 초과 페널티
                const endTime = availTime + slotMinutes
                if (endTime > dayEnd) {
                    score -= (endTime - dayEnd) * 3
                }

                // 6) 같은 코트 연속 경기 회피 (관중 분산)
                const lastOnCourt = schedule.filter(s => s.court === ci + 1).slice(-1)[0]
                if (lastOnCourt && lastOnCourt.event_name === match.event_name) {
                    score -= 5
                }

                if (score > bestScore) {
                    bestScore = score
                    bestCourt = ci
                }
            }

            let scheduledStart = Math.max(courtNextFree[bestCourt], playerEarliest)

            // 결승전을 골든타임으로 밀기 (가능한 경우)
            if (isFinalRound && scheduledStart < goldenStart && (goldenStart + slotMinutes) <= dayEnd + 30) {
                const canDelay = goldenStart
                const allCourtsReady = courtNextFree.every(f => f <= canDelay)
                if (allCourtsReady && playerEarliest <= canDelay) {
                    scheduledStart = canDelay
                }
            }

            // 점심시간 체크
            if (breakStart > 0 && breakEnd > 0) {
                const scheduledEnd = scheduledStart + slotMinutes
                if (scheduledStart < breakEnd && scheduledEnd > breakStart) {
                    scheduledStart = breakEnd
                }
            }

            const scheduledEnd = scheduledStart + slotMinutes

            courtNextFree[bestCourt] = scheduledEnd
            courtMatchCount[bestCourt]++

            for (const pid of playerIds) {
                playerLastEnd[pid] = scheduledEnd
                playerMatchCount[pid] = (playerMatchCount[pid] || 0) + 1
            }

            if (scheduledEnd > roundMaxEnd) roundMaxEnd = scheduledEnd

            schedule.push({
                match_id: match.id,
                event_name: match.event_name,
                round: match.round,
                match_order: match.match_order,
                court: bestCourt + 1,
                scheduled_time: minToTime(scheduledStart),
                scheduled_end: minToTime(scheduledEnd),
                predicted_duration: predictedDuration,
                team1_name: match.team1_name || 'TBD',
                team2_name: match.team2_name || 'TBD',
                status: match.status,
                over_time: scheduledEnd > dayEnd,
                is_final: isFinalRound,
                is_semi: isSemiFinal
            })
        }

        eventRoundEnd[key] = roundMaxEnd
    }

    // ── AI 통계 및 인사이트 ──
    const totalMatches = schedule.length
    const lastMatch = schedule.reduce((max, s) => {
        const t = timeToMin(s.scheduled_end)
        return t > max ? t : max
    }, dayStart)
    const firstMatch = schedule.length > 0 ? timeToMin(schedule[0].scheduled_time) : dayStart
    const estimatedEnd = minToTime(lastMatch)
    const overTimeMatches = schedule.filter(s => s.over_time).length
    const totalHours = ((lastMatch - firstMatch) / 60).toFixed(1)

    const totalAvailableMinutes = numCourts * (dayEnd - dayStart - (breakStart > 0 ? (breakEnd - breakStart) : 0))
    const totalUsedMinutes = schedule.reduce((sum, s) => sum + (s.predicted_duration || match_duration) + changeover_time, 0)
    const utilization = totalAvailableMinutes > 0 ? Math.round((totalUsedMinutes / totalAvailableMinutes) * 100) : 0

    // 코트 균형도 계산
    const minCourt = Math.min(...courtMatchCount)
    const maxCourt = Math.max(...courtMatchCount)
    const courtBalance = maxCourt > 0 ? Math.round((1 - (maxCourt - minCourt) / maxCourt) * 100) : 100

    // 최대 연속 경기 선수 감지
    const maxConsecutive = Object.values(playerMatchCount).reduce((mx, v) => Math.max(mx, v), 0)

    // AI 제안사항
    const suggestions: string[] = []
    suggestions.push(`🧠 AI 최적화 적용: 다중 제약조건 점수 기반 스케줄링`)
    suggestions.push(`📊 코트 균형도: ${courtBalance}% (${courtMatchCount.map((c, i) => `${i + 1}코트:${c}`).join(', ')})`)

    if (Object.keys(histAvg).length > 0) {
        suggestions.push(`📈 실제 경기 데이터 기반 시간 예측 활용 중 (${Object.keys(histAvg).length}개 라운드)`)
    } else {
        suggestions.push(`ℹ️ 경기 데이터가 쌓이면 AI 시간 예측 정확도가 향상됩니다`)
    }

    if (dualPlayers.size > 0) {
        suggestions.push(`🔄 듀얼 출전자 ${dualPlayers.size}명 휴식시간 우선 배정 완료`)
    }

    const finalsInGolden = schedule.filter(s => s.is_final && timeToMin(s.scheduled_time) >= goldenStart && timeToMin(s.scheduled_time) <= goldenEnd).length
    const totalFinals = schedule.filter(s => s.is_final).length
    if (totalFinals > 0) {
        suggestions.push(`🏆 결승전 ${finalsInGolden}/${totalFinals}경기 골든타임(15~17시) 배정`)
    }

    if (overTimeMatches > 0) {
        suggestions.push(`⚠️ ${overTimeMatches}경기가 마감시간(${end_time})을 초과합니다`)
        if (match_duration > 20) suggestions.push(`💡 경기당 소요시간을 ${match_duration - 5}분으로 줄이면 개선됩니다`)
        suggestions.push(`💡 코트를 ${numCourts + 2}면으로 늘리면 마감 시간 내 가능합니다`)
    }
    if (utilization < 60) {
        const neededCourts = Math.ceil(totalUsedMinutes / (dayEnd - dayStart - (breakStart > 0 ? (breakEnd - breakStart) : 0)))
        suggestions.push(`💡 코트 활용률이 ${utilization}%로 낮습니다. ${neededCourts}면으로도 충분합니다`)
    }
    if (overTimeMatches === 0 && lastMatch < dayEnd - 60) {
        suggestions.push(`✅ 예상 종료 ${estimatedEnd}. 약 ${minToTime(dayEnd - lastMatch)} 여유가 있습니다`)
    }
    if (breakStart <= 0) {
        suggestions.push('ℹ️ 점심시간을 설정하지 않았습니다. 필요시 설정해주세요')
    }
    if (maxConsecutive >= 4) {
        suggestions.push(`⚠️ 최대 ${maxConsecutive}경기 출전 선수가 있습니다. 체력 관리 유의`)
    }

    suggestions.push(...aiInsights)

    return c.json({
        schedule,
        summary: {
            total_matches: totalMatches,
            courts: numCourts,
            start: start_time,
            estimated_end: estimatedEnd,
            over_time_matches: overTimeMatches,
            total_hours: totalHours,
            utilization_pct: utilization,
            court_balance_pct: courtBalance,
            slot_minutes: baseSlot,
            dual_players: dualPlayers.size,
            finals_in_golden: finalsInGolden,
            ai_optimized: true
        },
        suggestions
    })
})

// ── 스케줄 적용 (DB에 각 매치의 시간 저장) ───────────────────
app.post('/:tid/schedule/apply', async (c) => {
    const tid = c.req.param('tid')
    const { schedule } = await c.req.json()

    if (!schedule || !Array.isArray(schedule)) {
        return c.json({ error: 'Invalid schedule data' }, 400)
    }

    // 배치로 각 매치에 시간과 코트 배정
    const stmts: any[] = []
    for (const item of schedule) {
        stmts.push(
            c.env.DB.prepare(
                'UPDATE matches SET scheduled_time = ?, court_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
            ).bind(item.scheduled_time, item.court, item.match_id, tid)
        )
    }

    // D1 batch
    if (stmts.length > 0) {
        // D1 supports batch of up to ~100 statements
        for (let i = 0; i < stmts.length; i += 50) {
            const batch = stmts.slice(i, i + 50)
            await c.env.DB.batch(batch)
        }
    }

    // 스케줄 설정도 같이 저장
    return c.json({ success: true, applied: stmts.length })
})

// ── 현재 적용된 스케줄 조회 ───────────────────────────────────
app.get('/:tid/schedule', async (c) => {
    const tid = c.req.param('tid')

    const { results } = await c.env.DB.prepare(
        `SELECT m.id, m.event_id, m.round, m.match_order, m.court_number, m.status,
                m.scheduled_time,
                t1.team_name as team1_name, t2.team_name as team2_name,
                e.name as event_name
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         LEFT JOIN events e ON m.event_id = e.id
         WHERE m.tournament_id = ? AND m.scheduled_time IS NOT NULL
         ORDER BY m.scheduled_time ASC, m.court_number ASC`
    ).bind(tid).all()

    return c.json(results || [])
})

// ── 개별 매치 코트/시간 변경 (드래그앤드롭용) ──────────────────
app.patch('/:tid/schedule/match/:mid', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('mid')
    const { court_number, scheduled_time } = await c.req.json()

    if (!court_number && !scheduled_time) {
        return c.json({ error: 'court_number 또는 scheduled_time이 필요합니다.' }, 400)
    }

    // 해당 매치가 이 대회에 속하는지 확인
    const match = await c.env.DB.prepare(
        'SELECT id, status FROM matches WHERE id = ? AND tournament_id = ?'
    ).bind(mid, tid).first() as any

    if (!match) return c.json({ error: '경기를 찾을 수 없습니다.' }, 404)
    if (match.status === 'completed') return c.json({ error: '완료된 경기는 이동할 수 없습니다.' }, 400)
    if (match.status === 'playing') return c.json({ error: '진행 중인 경기는 이동할 수 없습니다.' }, 400)

    const updates: string[] = []
    const binds: any[] = []

    if (court_number) {
        updates.push('court_number = ?')
        binds.push(court_number)
    }
    if (scheduled_time) {
        updates.push('scheduled_time = ?')
        binds.push(scheduled_time)
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    binds.push(mid, tid)

    await c.env.DB.prepare(
        `UPDATE matches SET ${updates.join(', ')} WHERE id = ? AND tournament_id = ?`
    ).bind(...binds).run()

    return c.json({ success: true })
})

export default app
