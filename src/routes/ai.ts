import { Hono } from 'hono'

type Bindings = { DB: D1Database; AI: any }
const app = new Hono<{ Bindings: Bindings }>()

// ── AI 대회 설정 어시스턴트 ──────────────────────────────────
app.post('/assistant', async (c) => {
    const { message, context } = await c.req.json()

    if (!message) return c.json({ error: 'message 필요' }, 400)

    const systemPrompt = `당신은 배드민턴/테니스 대회 운영 AI 어시스턴트입니다.
사용자가 자연어로 대회 요구사항을 말하면, JSON 형태의 대회 설정으로 변환합니다.

응답 규칙:
1. 반드시 아래 JSON 형식으로 응답하세요
2. 확실하지 않은 값은 null로 설정하세요
3. JSON 응답 후에 "---" 구분자를 넣고, 한국어로 요약 설명을 추가하세요

JSON 형식:
{
  "action": "create_tournament" | "suggest_events" | "answer",
  "tournament": {
    "name": "대회명 (null이면 사용자에게 질문)",
    "sport_type": "badminton" | "tennis",
    "courts": 코트 수 (숫자),
    "start_date": "YYYY-MM-DD (null이면 질문)",
    "end_date": "YYYY-MM-DD"
  },
  "schedule": {
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "match_duration": 분 (숫자),
    "break_start": "HH:MM 또는 빈문자열",
    "break_end": "HH:MM 또는 빈문자열"
  },
  "events": [
    {
      "name": "종목명 (예: 남자복식 A급 40대)",
      "category": "md|wd|xd|ms|ws (복식/단식 코드)",
      "level": "급수",
      "age_group": "연령대"
    }
  ]
}

배드민턴 가능한 카테고리: md(남자복식), wd(여자복식), xd(혼합복식), ms(남자단식), ws(여자단식)
테니스 카테고리: md(남자복식), wd(여자복식), xd(혼합복식), ms(남자단식), ws(여자단식)
급수: a, b, c, d, e (배드민턴) / 1~7 (테니스 NTRP)
연령대: 자유, 20~30대, 40대, 50대, 55대, 60대 등

예시 입력: "배드민턴 대회, 80명, 복식 C~D급, 연령대별, 코트 6면"
예시 출력:
{
  "action": "create_tournament",
  "tournament": { "name": null, "sport_type": "badminton", "courts": 6 },
  "schedule": { "start_time": "09:00", "end_time": "18:00", "match_duration": 15, "break_start": "12:00", "break_end": "13:00" },
  "events": [
    { "name": "남자복식 C급 40대", "category": "md", "level": "c", "age_group": "40대" },
    { "name": "남자복식 D급 40대", "category": "md", "level": "d", "age_group": "40대" }
  ]
}`

    try {
        // Cloudflare Workers AI 호출
        const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            max_tokens: 2048,
            temperature: 0.3
        })

        const responseText = aiResponse.response || ''

        // JSON 파싱 시도
        let parsed = null
        let explanation = responseText
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/m)
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0])
                const separatorIdx = responseText.indexOf('---')
                if (separatorIdx > 0) {
                    explanation = responseText.substring(separatorIdx + 3).trim()
                } else {
                    explanation = ''
                }
            }
        } catch (e) { /* JSON 파싱 실패 시 텍스트 응답 */ }

        return c.json({
            success: true,
            parsed,
            explanation: explanation || responseText,
            raw: responseText
        })
    } catch (err: any) {
        // AI 바인딩이 없는 경우 폴백
        return c.json({
            success: false,
            explanation: 'AI 서비스를 사용할 수 없습니다. Cloudflare Workers AI 바인딩을 확인해주세요.',
            error: err.message || String(err)
        })
    }
})

// ── AI 참가자 챗봇 ───────────────────────────────────────────
app.post('/:tid/chat', async (c) => {
    const tid = c.req.param('tid')
    const { message, player_id } = await c.req.json()

    if (!message) return c.json({ error: 'message 필요' }, 400)

    // 대회 정보 조회
    const tournament = await c.env.DB.prepare(
        'SELECT name, sport_type, courts, start_date FROM tournaments WHERE id = ? AND deleted = 0'
    ).bind(tid).first() as any
    if (!tournament) return c.json({ error: '대회 없음' }, 404)

    // 참가자별 경기 정보 조회
    let playerInfo = ''
    if (player_id) {
        const { results: playerMatches } = await c.env.DB.prepare(
            `SELECT m.scheduled_time, m.court_number, m.status,
                    m.team1_set1, m.team2_set1, m.team1_set2, m.team2_set2, m.team1_set3, m.team2_set3,
                    t1.team_name as team1_name, t2.team_name as team2_name,
                    e.name as event_name,
                    CASE WHEN t1.player1_id = ? OR t1.player2_id = ? THEN 'team1' ELSE 'team2' END as my_team
             FROM matches m
             LEFT JOIN teams t1 ON m.team1_id = t1.id
             LEFT JOIN teams t2 ON m.team2_id = t2.id
             LEFT JOIN events e ON m.event_id = e.id
             WHERE m.tournament_id = ? AND (t1.player1_id = ? OR t1.player2_id = ? OR t2.player1_id = ? OR t2.player2_id = ?)
             ORDER BY m.scheduled_time ASC`
        ).bind(player_id, player_id, tid, player_id, player_id, player_id, player_id).all()

        if (playerMatches && playerMatches.length > 0) {
            const participant = await c.env.DB.prepare(
                'SELECT name FROM participants WHERE id = ?'
            ).bind(player_id).first() as any
            const name = participant?.name || '선수'

            playerInfo = `\n참가자 "${name}"의 경기 정보:\n`
            for (const m of playerMatches as any[]) {
                const opp = m.my_team === 'team1' ? m.team2_name : m.team1_name
                const score = m.status === 'completed'
                    ? `${m.team1_set1 || 0}-${m.team2_set1 || 0}`
                    : m.status === 'playing' ? '진행중' : '대기'
                const result = m.status === 'completed'
                    ? ((m.my_team === 'team1' && (m.team1_set1 || 0) > (m.team2_set1 || 0)) ||
                        (m.my_team === 'team2' && (m.team2_set1 || 0) > (m.team1_set1 || 0)) ? '승' : '패')
                    : ''
                playerInfo += `- ${m.scheduled_time || '미정'} | ${m.court_number || '?'}코트 | ${m.event_name} | vs ${opp} | ${score} ${result} | 상태:${m.status}\n`
            }
        }
    }

    // 전체 대회 현황
    const overview = await c.env.DB.prepare(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status='playing' THEN 1 ELSE 0 END) as playing,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
         FROM matches WHERE tournament_id = ?`
    ).bind(tid).first() as any

    const contextStr = `대회: ${tournament.name} (${tournament.sport_type === 'tennis' ? '테니스' : '배드민턴'})
코트: ${tournament.courts}면
전체: ${overview?.total || 0}경기, 완료: ${overview?.completed || 0}, 진행: ${overview?.playing || 0}, 대기: ${overview?.pending || 0}
${playerInfo}`

    try {
        const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                {
                    role: 'system',
                    content: `당신은 "${tournament.name}" 대회의 안내 AI입니다.
참가자의 질문에 친절하고 간결하게 한국어로 답변합니다.
이모지를 적절히 사용하세요. 답변은 3~5줄 이내로 간결하게.
아래는 현재 대회 데이터입니다:

${contextStr}`
                },
                { role: 'user', content: message }
            ],
            max_tokens: 512,
            temperature: 0.5
        })

        return c.json({
            success: true,
            response: aiResponse.response || '답변을 생성하지 못했습니다.'
        })
    } catch (err: any) {
        // AI 비활성 시 규칙 기반 폴백
        let fallback = ''
        const msg = message.toLowerCase()
        if (msg.includes('다음') && (msg.includes('경기') || msg.includes('언제'))) {
            fallback = playerInfo ? `📋 당신의 경기 정보:\n${playerInfo}` : '선수 정보를 확인할 수 없습니다. QR 인증 후 다시 시도해주세요.'
        } else if (msg.includes('전적') || msg.includes('결과')) {
            fallback = playerInfo || '경기 기록이 없습니다.'
        } else if (msg.includes('현황') || msg.includes('진행')) {
            fallback = `📊 대회 현황: 전체 ${overview?.total || 0}경기 중 ${overview?.completed || 0}경기 완료, ${overview?.playing || 0}경기 진행 중`
        } else {
            fallback = `안녕하세요! 대회 관련 질문을 해주세요.\n예시: "내 다음 경기 언제야?", "현재 대회 현황", "내 전적 알려줘"`
        }
        return c.json({ success: true, response: fallback, fallback: true })
    }
})

// ── AI 대회 리포트 자동 생성 ─────────────────────────────────
app.get('/:tid/report', async (c) => {
    const tid = c.req.param('tid')

    const tournament = await c.env.DB.prepare(
        'SELECT * FROM tournaments WHERE id = ? AND deleted = 0'
    ).bind(tid).first() as any
    if (!tournament) return c.json({ error: 'Not found' }, 404)

    // 경기 통계
    const stats = await c.env.DB.prepare(
        `SELECT 
            COUNT(*) as total_matches,
            SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status='playing' THEN 1 ELSE 0 END) as playing,
            MIN(scheduled_time) as first_match_time,
            MAX(scheduled_time) as last_match_time
         FROM matches WHERE tournament_id = ?`
    ).bind(tid).first() as any

    // 종목별 통계
    const { results: eventStats } = await c.env.DB.prepare(
        `SELECT e.name, 
            COUNT(m.id) as total,
            SUM(CASE WHEN m.status='completed' THEN 1 ELSE 0 END) as completed
         FROM events e
         LEFT JOIN matches m ON e.id = m.event_id
         WHERE e.tournament_id = ?
         GROUP BY e.id, e.name`
    ).bind(tid).all()

    // 참가자 수
    const pCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM participants WHERE tournament_id = ?'
    ).bind(tid).first() as any

    // 코트별 경기 수
    const { results: courtStats } = await c.env.DB.prepare(
        `SELECT court_number, COUNT(*) as cnt 
         FROM matches WHERE tournament_id = ? AND court_number IS NOT NULL 
         GROUP BY court_number ORDER BY court_number`
    ).bind(tid).all()

    const report = {
        tournament: {
            name: tournament.name,
            sport_type: tournament.sport_type,
            courts: tournament.courts,
            date: tournament.start_date
        },
        summary: {
            total_participants: pCount?.cnt || 0,
            total_matches: stats?.total_matches || 0,
            completed_matches: stats?.completed || 0,
            completion_rate: stats?.total_matches > 0 ? Math.round((stats.completed / stats.total_matches) * 100) : 0,
            first_match: stats?.first_match_time || '-',
            last_match: stats?.last_match_time || '-'
        },
        events: eventStats || [],
        courts: courtStats || [],
        generated_at: new Date().toISOString()
    }

    // AI 인사이트 생성 시도
    try {
        const dataStr = JSON.stringify(report, null, 2)
        const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                {
                    role: 'system',
                    content: `대회 데이터를 분석하고 3~5개의 핵심 인사이트를 한국어로 생성하세요.
각 인사이트는 이모지로 시작하고 한 줄로 작성합니다.
예: "🏆 남자복식 A급이 가장 많은 경기(24경기)가 진행되었습니다"
예: "⚡ 평균 경기 시간은 18분으로 예상(15분)보다 20% 길었습니다"
예: "📊 3코트의 활용률이 가장 높습니다 (전체의 28%)"
인사이트만 출력하세요. 다른 텍스트 없이.`
                },
                { role: 'user', content: dataStr }
            ],
            max_tokens: 512,
            temperature: 0.3
        })

        const insights = (aiResponse.response || '').split('\n').filter((l: string) => l.trim())
        return c.json({ ...report, ai_insights: insights })
    } catch {
        // AI 없이 기본 인사이트
        const insights = []
        if (stats?.completed > 0) insights.push(`✅ ${stats.completed}/${stats.total_matches}경기 완료 (${report.summary.completion_rate}%)`)
        const maxCourt = (courtStats as any[] || []).reduce((mx: any, c: any) => c.cnt > (mx?.cnt || 0) ? c : mx, null)
        if (maxCourt) insights.push(`🏟️ ${maxCourt.court_number}코트가 가장 많은 경기(${maxCourt.cnt}경기) 진행`)
        return c.json({ ...report, ai_insights: insights })
    }
})

// ── 실시간 자동 재스케줄링 ───────────────────────────────────
app.post('/:tid/reschedule', async (c) => {
    const tid = c.req.param('tid')
    const { completed_match_id } = await c.req.json()

    // 대회 정보
    const tournament = await c.env.DB.prepare(
        'SELECT courts, schedule_config FROM tournaments WHERE id = ? AND deleted = 0'
    ).bind(tid).first() as any
    if (!tournament) return c.json({ error: 'Not found' }, 404)

    let config: any = { changeover_time: 5, rest_between: 10 }
    if (tournament.schedule_config) {
        try { config = JSON.parse(tournament.schedule_config) } catch (e) { }
    }

    // 완료된 경기 정보
    const completedMatch = completed_match_id ? await c.env.DB.prepare(
        'SELECT * FROM matches WHERE id = ? AND tournament_id = ?'
    ).bind(completed_match_id, tid).first() as any : null

    // 아직 대기 중인 경기들
    const { results: pendingMatches } = await c.env.DB.prepare(
        `SELECT m.id, m.event_id, m.round, m.court_number, m.scheduled_time,
                m.team1_id, m.team2_id,
                t1.player1_id as t1p1, t1.player2_id as t1p2,
                t2.player1_id as t2p1, t2.player2_id as t2p2
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         WHERE m.tournament_id = ? AND m.status = 'pending' AND m.scheduled_time IS NOT NULL
         ORDER BY m.scheduled_time ASC, m.court_number ASC`
    ).bind(tid).all()

    if (!pendingMatches || pendingMatches.length === 0) {
        return c.json({ success: true, adjustments: 0, message: '조정할 대기 경기가 없습니다.' })
    }

    // 현재 코트별 진행 경기 종료 예상 시간
    const numCourts = tournament.courts || 6
    const now = new Date()
    const currentMin = now.getHours() * 60 + now.getMinutes()

    // 각 코트의 현재 상태 (진행 중 경기 확인)
    const courtAvailable: number[] = Array(numCourts).fill(currentMin)
    const { results: playingMatches } = await c.env.DB.prepare(
        `SELECT court_number, scheduled_time FROM matches 
         WHERE tournament_id = ? AND status = 'playing' AND court_number IS NOT NULL`
    ).bind(tid).all()

    for (const pm of (playingMatches || []) as any[]) {
        const ci = pm.court_number - 1
        if (ci >= 0 && ci < numCourts && pm.scheduled_time) {
            const [h, m] = pm.scheduled_time.split(':').map(Number)
            const estimatedEnd = h * 60 + m + (config.match_duration || 20) + (config.changeover_time || 5)
            courtAvailable[ci] = Math.max(courtAvailable[ci], estimatedEnd)
        }
    }

    // 완료된 경기의 코트가 비었으면 반영
    if (completedMatch && completedMatch.court_number) {
        const ci = completedMatch.court_number - 1
        if (ci >= 0 && ci < numCourts) {
            courtAvailable[ci] = currentMin + (config.changeover_time || 5)
        }
    }

    // 선수별 마지막 경기 시간
    const playerLastEnd: Record<number, number> = {}
    const { results: recentCompleted } = await c.env.DB.prepare(
        `SELECT m.scheduled_time, t1.player1_id as t1p1, t1.player2_id as t1p2,
                t2.player1_id as t2p1, t2.player2_id as t2p2
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         WHERE m.tournament_id = ? AND m.status IN ('completed', 'playing') AND m.scheduled_time IS NOT NULL`
    ).bind(tid).all()

    for (const rm of (recentCompleted || []) as any[]) {
        if (!rm.scheduled_time) continue
        const [h, m] = rm.scheduled_time.split(':').map(Number)
        const endMin = h * 60 + m + (config.match_duration || 20)
        const pids = [rm.t1p1, rm.t1p2, rm.t2p1, rm.t2p2].filter(Boolean) as number[]
        for (const pid of pids) {
            playerLastEnd[pid] = Math.max(playerLastEnd[pid] || 0, endMin)
        }
    }

    // 재조정
    function minToTime(m: number): string {
        const h = Math.floor(m / 60)
        const mm = m % 60
        return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    }

    const adjustments: any[] = []
    const changeover = config.changeover_time || 5
    const restBetween = config.rest_between || 10
    const matchDuration = config.match_duration || 20

    for (const pm of pendingMatches as any[]) {
        if (!pm.court_number || !pm.scheduled_time) continue

        const ci = pm.court_number - 1
        if (ci < 0 || ci >= numCourts) continue

        const pids = [pm.t1p1, pm.t1p2, pm.t2p1, pm.t2p2].filter(Boolean) as number[]

        // 선수 휴식 고려한 최소 시작 시간
        let playerReady = courtAvailable[ci]
        for (const pid of pids) {
            if (playerLastEnd[pid]) {
                playerReady = Math.max(playerReady, playerLastEnd[pid] + restBetween)
            }
        }

        const newStart = Math.max(courtAvailable[ci], playerReady)
        const newTimeStr = minToTime(newStart)
        const [oh, om] = pm.scheduled_time.split(':').map(Number)
        const oldMin = oh * 60 + om
        const diffMin = newStart - oldMin

        // 5분 이상 차이나면 조정
        if (Math.abs(diffMin) >= 5) {
            adjustments.push({
                match_id: pm.id,
                court: pm.court_number,
                old_time: pm.scheduled_time,
                new_time: newTimeStr,
                diff_minutes: diffMin
            })
        }

        // 코트 시간/선수 시간 갱신
        const endMin = newStart + matchDuration + changeover
        courtAvailable[ci] = endMin
        for (const pid of pids) {
            playerLastEnd[pid] = endMin
        }
    }

    // 조정 적용
    if (adjustments.length > 0) {
        const stmts = adjustments.map(a =>
            c.env.DB.prepare(
                'UPDATE matches SET scheduled_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
            ).bind(a.new_time, a.match_id, tid)
        )

        for (let i = 0; i < stmts.length; i += 50) {
            await c.env.DB.batch(stmts.slice(i, i + 50))
        }
    }

    const delayed = adjustments.filter(a => a.diff_minutes > 0)
    const advanced = adjustments.filter(a => a.diff_minutes < 0)

    return c.json({
        success: true,
        adjustments: adjustments.length,
        details: adjustments,
        summary: {
            delayed: delayed.length,
            advanced: advanced.length,
            avg_delay: delayed.length > 0 ? Math.round(delayed.reduce((s, a) => s + a.diff_minutes, 0) / delayed.length) : 0,
            avg_advance: advanced.length > 0 ? Math.round(advanced.reduce((s, a) => s + Math.abs(a.diff_minutes), 0) / advanced.length) : 0
        }
    })
})

// ── AI 자동 사이트 빌더 ──────────────────────────────────────
app.post('/build-site', async (c) => {
    const { prompt } = await c.req.json()
    if (!prompt) return c.json({ error: 'prompt 필요' }, 400)

    const systemPrompt = `당신은 프로페셔널한 스포츠 클럽(배드민턴/테니스 등) 웹사이트 기획자 겸 카피라이터입니다.
사용자의 짧은 설명을 듣고, 가장 매력적이고 세련된 홈페이지 설정 JSON을 생성하세요.

응답 규칙:
1. 반드시 아래 JSON 형식으로만 응답하세요. 마크다운이나 다른 설명 텍스트를 절대 붙이지 마세요.
2. 테마 컬러(theme_color)는 클럽 분위기에 맞는 세련된 HEX 코드(예: #FF3B30, #007AFF, #34C759 등)를 추천해주세요.
3. 홍보 문구(hero_title, hero_subtitle, about_text)는 사용자의 설명을 바탕으로 매우 트렌디하고 감성적인 카피를 작성하세요. (줄바꿈은 \\n 사용)

응답할 JSON 구조:
{
  "theme_color": "#HEX코드",
  "hero_title": "메인 타이틀 (짧고 강렬하게)",
  "hero_subtitle": "서브 타이틀 (클럽의 성격이 잘 드러나는 문장)",
  "hero_cta_primary": "기본 제공값: 가입 전 둘러보기",
  "hero_cta_secondary": "기본 제공값: 이번 달 일정보기",
  "show_schedule": true,
  "show_notice": true,
  "show_join_form": true,
  "show_about": true,
  "about_title": "소개 영역 제목",
  "about_text": "소개글 내용 (3~4문장으로 신뢰감 있게 포장, 단체의 역사나 열정을 상상해서 덧붙여도 됨)"
}`

    try {
        const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: 1024,
            temperature: 0.7
        })

        const responseText = aiResponse.response || ''
        let parsed = null

        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/m)
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
        } catch (e) { }

        if (!parsed) {
            return c.json({ success: false, error: 'AI가 올바른 형식을 생성하지 못했습니다.' })
        }

        return c.json({ success: true, config: parsed })
    } catch (err: any) {
        return c.json({ success: false, error: err.message || 'AI 연동 중 오류가 발생했습니다.' })
    }
})

export default app
