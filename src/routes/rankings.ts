// src/routes/rankings.ts
// 개인 랭킹 API
// GET /api/rankings          — 전체 랭킹 (필터: gender/level/sport/limit)
// GET /api/rankings/summary  — 통계 요약
// ─────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { optionalAuth } from '../middleware/auth'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Variables = { adminUser: { id: number; username: string; plan: string } }
const rankings = new Hono<{ Bindings: Bindings; Variables: Variables }>()

rankings.use('*', optionalAuth)

// ── 전체 랭킹 ────────────────────────────────────────────────
rankings.get('/', async (c) => {
    const user = c.get('adminUser') as any
    const gender = c.req.query('gender') || ''
    const level = c.req.query('level') || ''
    const sport = c.req.query('sport') || ''   // badminton / tennis
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500)
    const minGames = parseInt(c.req.query('min_games') || '1')

    // 소유자 필터 (로그인 → 내 회원, 비로그인 → 공개)
    let memberWhere = 'WHERE m.active = 1'
    const params: any[] = []

    if (user?.id) {
        memberWhere += ' AND m.owner_id = ?'
        params.push(user.id)
    } else {
        memberWhere += ' AND m.owner_id IS NULL'
    }
    if (gender) { memberWhere += ' AND m.gender = ?'; params.push(gender) }
    if (level) { memberWhere += ' AND m.level = ?'; params.push(level) }

    // sport 필터는 tournament 조인으로
    const sportJoin = sport
        ? `JOIN tournaments trn ON trn.id = r.tournament_id AND trn.sport_type = '${sport.replace(/'/g, '')}'`
        : ''

    const { results } = await c.env.DB.prepare(`
        SELECT
            m.id, m.name, m.gender, m.level, m.club,
            COALESCE(m.elo_rating, 1500) AS elo_rating,
            COALESCE(m.elo_peak, 1500) AS elo_peak,
            COUNT(r.id)                                                        AS total_games,
            SUM(CASE WHEN r.result = 'win'  THEN 1 ELSE 0 END)               AS wins,
            SUM(CASE WHEN r.result = 'loss' THEN 1 ELSE 0 END)               AS losses,
            ROUND(
                100.0 * SUM(CASE WHEN r.result = 'win' THEN 1 ELSE 0 END)
                / MAX(1, COUNT(r.id)), 1
            )                                                                  AS win_rate,
            COUNT(DISTINCT r.tournament_id)                                   AS tournament_count,
            MAX(r.created_at)                                                  AS last_match_at
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        ${sportJoin}
        ${memberWhere}
        GROUP BY m.id
        HAVING total_games >= ?
        ORDER BY elo_rating DESC, win_rate DESC, total_games DESC
        LIMIT ?
    `).bind(...params, minGames, limit).all()

    // 순위 번호 붙이기
    const ranked = (results as any[]).map((row, i) => ({
        rank: i + 1,
        ...row
    }))

    return c.json({ rankings: ranked, total: ranked.length })
})

// ── 통계 요약 ─────────────────────────────────────────────────
rankings.get('/summary', async (c) => {
    const user = c.get('adminUser') as any
    let where = 'WHERE m.active = 1'
    const params: any[] = []

    if (user?.id) { where += ' AND m.owner_id = ?'; params.push(user.id) }
    else { where += ' AND m.owner_id IS NULL' }

    const summary = await c.env.DB.prepare(`
        SELECT
            COUNT(DISTINCT m.id)                                     AS total_members,
            COUNT(r.id)                                              AS total_matches,
            COUNT(DISTINCT r.tournament_id)                          AS total_tournaments,
            SUM(CASE WHEN r.result = 'win'  THEN 1 ELSE 0 END)     AS total_wins,
            SUM(CASE WHEN m.gender = 'm'    THEN 1 ELSE 0 END)     AS male_count,
            SUM(CASE WHEN m.gender = 'f'    THEN 1 ELSE 0 END)     AS female_count
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        ${where}
    `).bind(...params).first()

    // 레벨별 분포
    const { results: byLevel } = await c.env.DB.prepare(`
        SELECT m.level, COUNT(DISTINCT m.id) AS cnt
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        ${where}
        GROUP BY m.level ORDER BY m.level
    `).bind(...params).all()

    // 클럽별 랭킹 상위 5
    const { results: byClub } = await c.env.DB.prepare(`
        SELECT m.club,
               COUNT(DISTINCT m.id) AS member_count,
               ROUND(100.0 * SUM(CASE WHEN r.result='win' THEN 1 ELSE 0 END)
                     / MAX(1,COUNT(r.id)), 1) AS club_win_rate
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        ${where} AND m.club IS NOT NULL
        GROUP BY m.club
        ORDER BY club_win_rate DESC LIMIT 5
    `).bind(...params).all()

    return c.json({ summary, byLevel: byLevel, top_clubs: byClub })
})

// ── 개인 상세 랭킹 카드 ───────────────────────────────────────
rankings.get('/member/:id', async (c) => {
    const memberId = c.req.param('id')

    const [basic, stat, recent, rivals] = await Promise.all([
        // 기본 정보
        c.env.DB.prepare('SELECT * FROM members WHERE id = ? AND active = 1').bind(memberId).first(),

        // 전체 통계 + Elo
        c.env.DB.prepare(`
            SELECT
                COUNT(*)                                                   AS total_games,
                SUM(CASE WHEN result='win'  THEN 1 ELSE 0 END)           AS wins,
                SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END)           AS losses,
                ROUND(100.0 * SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) / MAX(1,COUNT(*)), 1) AS win_rate,
                SUM(my_score)                                             AS total_pts_for,
                SUM(opp_score)                                            AS total_pts_against,
                COUNT(DISTINCT tournament_id)                             AS tournaments
            FROM member_match_records WHERE member_id = ?
        `).bind(memberId).first(),

        // 최근 5경기
        c.env.DB.prepare(`
            SELECT r.result, r.my_set1, r.my_set2, r.opp_set1, r.opp_set2,
                   r.opp_names, r.event_name, t.name AS tournament_name, r.created_at
            FROM member_match_records r
            LEFT JOIN tournaments t ON t.id = r.tournament_id
            WHERE r.member_id = ?
            ORDER BY r.created_at DESC LIMIT 5
        `).bind(memberId).all(),

        // 많이 만난 상대 (opp_names 기반)
        c.env.DB.prepare(`
            SELECT opp_names,
                   COUNT(*) AS games,
                   SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins
            FROM member_match_records
            WHERE member_id = ? AND opp_names IS NOT NULL
            GROUP BY opp_names ORDER BY games DESC LIMIT 5
        `).bind(memberId).all()
    ])

    if (!basic) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

    // Elo 기반 순위 계산
    const myElo = (basic as any)?.elo_rating || 1500
    const { results: aboveMe } = await c.env.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM members
        WHERE active = 1 AND COALESCE(elo_rating, 1500) > ?
          AND id IN (SELECT DISTINCT member_id FROM member_match_records)
    `).bind(myElo).all()

    const rank = (aboveMe as any[])?.[0]?.cnt + 1 || 1

    // 최근 Elo 변동 (최근 10건)
    const { results: eloHistory } = await c.env.DB.prepare(`
        SELECT old_elo, new_elo, delta, result, event_name, created_at
        FROM elo_history WHERE member_id = ?
        ORDER BY created_at DESC LIMIT 10
    `).bind(memberId).all()

    // 연승/연패 계산
    let streak = 0
    let streakType = ''
    for (const r of recent.results as any[]) {
        if (streakType === '') streakType = r.result
        if (r.result === streakType) streak++
        else break
    }

    return c.json({
        member: basic,
        stat: {
            ...stat as any,
            elo_rating: myElo,
            elo_peak: (basic as any)?.elo_peak || 1500,
            rank
        },
        recent: recent.results,
        rivals: rivals.results,
        elo_history: eloHistory,
        streak: { count: streak, type: streakType }
    })
})

// ── Elo 히스토리 (그래프용) ────────────────────────────────────
rankings.get('/member/:id/elo-history', async (c) => {
    const memberId = c.req.param('id')
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)

    const { results } = await c.env.DB.prepare(`
        SELECT h.old_elo, h.new_elo, h.delta, h.opponent_elo,
               h.result, h.event_name, h.created_at,
               t.name AS tournament_name
        FROM elo_history h
        LEFT JOIN tournaments t ON h.tournament_id = t.id
        WHERE h.member_id = ?
        ORDER BY h.created_at ASC
        LIMIT ?
    `).bind(memberId, limit).all()

    // 현재 Elo도 함께 반환
    const member = await c.env.DB.prepare(
        'SELECT elo_rating, elo_peak FROM members WHERE id = ?'
    ).bind(memberId).first() as any

    return c.json({
        current_elo: member?.elo_rating ?? 1500,
        peak_elo: member?.elo_peak ?? 1500,
        history: results
    })
})

// ── Elo 리더보드 (TOP N) ──────────────────────────────────────
rankings.get('/elo-leaderboard', async (c) => {
    const user = c.get('adminUser') as any
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
    const sport = c.req.query('sport') || ''

    let ownerWhere = 'WHERE m.active = 1'
    const params: any[] = []
    if (user?.id) { ownerWhere += ' AND m.owner_id = ?'; params.push(user.id) }
    else { ownerWhere += ' AND m.owner_id IS NULL' }

    // sport 필터
    const sportFilter = sport
        ? `AND m.id IN (
            SELECT DISTINCT r.member_id FROM member_match_records r
            JOIN tournaments trn ON r.tournament_id = trn.id
            WHERE trn.sport_type = '${sport.replace(/'/g, '')}'
        )`
        : ''

    const { results } = await c.env.DB.prepare(`
        SELECT m.id, m.name, m.gender, m.level, m.club,
               COALESCE(m.elo_rating, 1500) AS elo_rating,
               COALESCE(m.elo_peak, 1500) AS elo_peak,
               (
                   SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id
               ) AS total_games,
               (
                   SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id AND result = 'win'
               ) AS wins,
               (
                   SELECT delta FROM elo_history WHERE member_id = m.id ORDER BY created_at DESC LIMIT 1
               ) AS last_delta
        FROM members m
        ${ownerWhere}
        ${sportFilter}
        AND m.id IN (SELECT DISTINCT member_id FROM member_match_records)
        ORDER BY elo_rating DESC
        LIMIT ?
    `).bind(...params, limit).all()

    const ranked = (results as any[]).map((row, i) => ({
        rank: i + 1,
        ...row,
        win_rate: row.total_games > 0 ? Math.round((row.wins / row.total_games) * 1000) / 10 : 0
    }))

    return c.json({ leaderboard: ranked, total: ranked.length })
})

// ── 🔮 승률 예측 (Elo 기반) ──────────────────────────────────
rankings.get('/predict', async (c) => {
    const player1 = c.req.query('player1')
    const player2 = c.req.query('player2')
    if (!player1 || !player2) return c.json({ error: 'player1, player2 ID 필요' }, 400)

    // 두 선수 정보 조회
    const [p1, p2] = await Promise.all([
        c.env.DB.prepare(`
            SELECT m.id, m.name, m.gender, m.level, m.club,
                   COALESCE(m.elo_rating, 1500) AS elo_rating,
                   COALESCE(m.elo_peak, 1500) AS elo_peak,
                   (SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id) AS total_games,
                   (SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id AND result = 'win') AS wins
            FROM members m WHERE m.id = ?
        `).bind(player1).first() as Promise<any>,
        c.env.DB.prepare(`
            SELECT m.id, m.name, m.gender, m.level, m.club,
                   COALESCE(m.elo_rating, 1500) AS elo_rating,
                   COALESCE(m.elo_peak, 1500) AS elo_peak,
                   (SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id) AS total_games,
                   (SELECT COUNT(*) FROM member_match_records WHERE member_id = m.id AND result = 'win') AS wins
            FROM members m WHERE m.id = ?
        `).bind(player2).first() as Promise<any>
    ])

    if (!p1 || !p2) return c.json({ error: '선수를 찾을 수 없습니다.' }, 404)

    // Elo 기반 예상 승률 (표준 공식: E = 1 / (1 + 10^((R_b - R_a)/400)))
    const eloDiff = p1.elo_rating - p2.elo_rating
    const p1WinProb = 1 / (1 + Math.pow(10, -eloDiff / 400))
    const p2WinProb = 1 - p1WinProb

    // 상대 전적 조회 (직접 대결)
    const { results: headToHead } = await c.env.DB.prepare(`
        SELECT r1.result, r1.my_score, r1.opp_score, r1.event_name, r1.created_at
        FROM member_match_records r1
        WHERE r1.member_id = ? AND r1.match_id IN (
            SELECT r2.match_id FROM member_match_records r2 WHERE r2.member_id = ?
        )
        ORDER BY r1.created_at DESC LIMIT 10
    `).bind(player1, player2).all() as any

    let h2hWins1 = 0, h2hTotal = 0
    for (const h of (headToHead || [])) {
        h2hTotal++
        if (h.result === 'win') h2hWins1++
    }

    // 상대전적 보정 (있을 경우)
    let adjustedP1 = p1WinProb
    if (h2hTotal >= 3) {
        const h2hRate = h2hWins1 / h2hTotal
        adjustedP1 = p1WinProb * 0.6 + h2hRate * 0.4 // Elo 60% + 상대전적 40%
    }
    const adjustedP2 = 1 - adjustedP1

    // 신뢰도 계산 (경기 수 기반)
    const minGames = Math.min(p1.total_games || 0, p2.total_games || 0)
    const confidence = Math.min(95, Math.round(50 + minGames * 3 + h2hTotal * 5))

    // 분석 메시지
    const messages: string[] = []
    if (Math.abs(eloDiff) < 50) messages.push('🤝 실력이 매우 비슷한 대결입니다')
    else if (eloDiff > 200) messages.push(`💪 ${p1.name} 선수가 Elo ${eloDiff}점 차로 크게 앞서 있습니다`)
    else if (eloDiff < -200) messages.push(`💪 ${p2.name} 선수가 Elo ${Math.abs(eloDiff)}점 차로 크게 앞서 있습니다`)
    else if (eloDiff > 0) messages.push(`📊 ${p1.name} 선수가 Elo ${eloDiff}점 앞서 있습니다`)
    else messages.push(`📊 ${p2.name} 선수가 Elo ${Math.abs(eloDiff)}점 앞서 있습니다`)

    if (h2hTotal > 0) messages.push(`⚔️ 상대 전적: ${p1.name} ${h2hWins1}승 ${h2hTotal - h2hWins1}패 (${h2hTotal}전)`)
    if (adjustedP1 >= 0.4 && adjustedP1 <= 0.6) messages.push('🔥 접전이 예상됩니다!')

    return c.json({
        prediction: {
            player1: {
                id: p1.id, name: p1.name, club: p1.club, level: p1.level,
                elo: p1.elo_rating, elo_peak: p1.elo_peak,
                total_games: p1.total_games, wins: p1.wins,
                win_rate: p1.total_games > 0 ? Math.round(p1.wins / p1.total_games * 1000) / 10 : 0,
                predicted_win_prob: Math.round(adjustedP1 * 1000) / 10
            },
            player2: {
                id: p2.id, name: p2.name, club: p2.club, level: p2.level,
                elo: p2.elo_rating, elo_peak: p2.elo_peak,
                total_games: p2.total_games, wins: p2.wins,
                win_rate: p2.total_games > 0 ? Math.round(p2.wins / p2.total_games * 1000) / 10 : 0,
                predicted_win_prob: Math.round(adjustedP2 * 1000) / 10
            }
        },
        elo_diff: eloDiff,
        head_to_head: {
            total: h2hTotal,
            player1_wins: h2hWins1,
            player2_wins: h2hTotal - h2hWins1,
            matches: headToHead
        },
        confidence,
        messages
    })
})

// ── 선수 프로필 성장 분석 ─────────────────────────────────────
rankings.get('/member/:id/growth', async (c) => {
    const memberId = c.req.param('id')

    // 기본 정보
    const member = await c.env.DB.prepare(
        'SELECT * FROM members WHERE id = ? AND active = 1'
    ).bind(memberId).first() as any
    if (!member) return c.json({ error: '회원 없음' }, 404)

    // 월별 승률 추이 (최근 12개월)
    const { results: monthlyStats } = await c.env.DB.prepare(`
        SELECT 
            strftime('%Y-%m', created_at) AS month,
            COUNT(*) AS games,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
            ROUND(100.0 * SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 1) AS win_rate,
            AVG(my_score) AS avg_score,
            AVG(opp_score) AS avg_opp_score
        FROM member_match_records
        WHERE member_id = ?
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
    `).bind(memberId).all() as any

    // Elo 변동 전체 히스토리
    const { results: eloHistory } = await c.env.DB.prepare(`
        SELECT old_elo, new_elo, delta, result, event_name, created_at,
               opponent_elo
        FROM elo_history WHERE member_id = ?
        ORDER BY created_at ASC
    `).bind(memberId).all() as any

    // 상대 전적 (가장 많이 만난 상대 TOP 10)
    const { results: rivals } = await c.env.DB.prepare(`
        SELECT opp_names,
               COUNT(*) AS games,
               SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
               ROUND(100.0 * SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 1) AS win_rate
        FROM member_match_records
        WHERE member_id = ? AND opp_names IS NOT NULL
        GROUP BY opp_names
        ORDER BY games DESC
        LIMIT 10
    `).bind(memberId).all() as any

    // 강점/약점 분석 (급수별 성적)
    const { results: byLevel } = await c.env.DB.prepare(`
        SELECT 
            CASE 
                WHEN opp_names LIKE '%A급%' OR opp_names LIKE '%a급%' THEN 'A'
                WHEN opp_names LIKE '%B급%' OR opp_names LIKE '%b급%' THEN 'B'
                WHEN opp_names LIKE '%C급%' OR opp_names LIKE '%c급%' THEN 'C'
                WHEN opp_names LIKE '%D급%' OR opp_names LIKE '%d급%' THEN 'D'
                ELSE '기타'
            END AS opp_level,
            COUNT(*) AS games,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins,
            ROUND(100.0 * SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 1) AS win_rate
        FROM member_match_records WHERE member_id = ?
        GROUP BY opp_level HAVING games >= 2
        ORDER BY win_rate DESC
    `).bind(memberId).all() as any

    // 성장 분석 생성
    const growthInsights: string[] = []
    const monthlyArr = (monthlyStats || []).reverse()
    if (monthlyArr.length >= 2) {
        const recent = monthlyArr[monthlyArr.length - 1]
        const prev = monthlyArr[monthlyArr.length - 2]
        const diff = recent.win_rate - prev.win_rate
        if (diff > 5) growthInsights.push(`📈 최근 승률이 ${diff.toFixed(1)}%p 상승했습니다 (${prev.win_rate}% → ${recent.win_rate}%)`)
        else if (diff < -5) growthInsights.push(`📉 최근 승률이 ${Math.abs(diff).toFixed(1)}%p 하락했습니다`)
        else growthInsights.push(`📊 승률이 안정적입니다 (${recent.win_rate}%)`)
    }

    if (eloHistory.length > 0) {
        const first = eloHistory[0]
        const last = eloHistory[eloHistory.length - 1]
        const totalChange = last.new_elo - first.old_elo
        if (totalChange > 50) growthInsights.push(`🚀 Elo가 총 ${totalChange}점 상승했습니다 (${first.old_elo} → ${last.new_elo})`)
        else if (totalChange < -50) growthInsights.push(`⚠️ Elo가 ${Math.abs(totalChange)}점 하락했습니다`)
    }

    const strongRivals = (rivals || []).filter((r: any) => r.games >= 3 && r.win_rate >= 70)
    const weakRivals = (rivals || []).filter((r: any) => r.games >= 3 && r.win_rate <= 30)
    if (strongRivals.length > 0) growthInsights.push(`💪 강점: ${strongRivals.map((r: any) => r.opp_names).join(', ')} 상대로 높은 승률`)
    if (weakRivals.length > 0) growthInsights.push(`🎯 개선 필요: ${weakRivals.map((r: any) => r.opp_names).join(', ')} 상대 승률 부진`)

    // 급수 승격 제안
    const myElo = member.elo_rating || 1500
    const myLevel = member.level?.toLowerCase() || ''
    const { results: sameLevel } = await c.env.DB.prepare(`
        SELECT AVG(COALESCE(elo_rating, 1500)) AS avg_elo
        FROM members WHERE level = ? AND active = 1 AND id != ?
        AND id IN (SELECT DISTINCT member_id FROM member_match_records)
    `).bind(member.level, memberId).all() as any
    const avgLevelElo = sameLevel?.[0]?.avg_elo || 1500
    if (myElo > avgLevelElo + 100) {
        growthInsights.push(`🏆 현재 Elo(${myElo})가 같은 급수 평균(${Math.round(avgLevelElo)})보다 ${Math.round(myElo - avgLevelElo)}점 높습니다 — 상급 승격 고려 가능`)
    }

    return c.json({
        member: {
            id: member.id, name: member.name, gender: member.gender,
            level: member.level, club: member.club,
            elo_rating: myElo, elo_peak: member.elo_peak || 1500
        },
        monthly_stats: monthlyArr,
        elo_history: eloHistory,
        rivals,
        by_level: byLevel,
        growth_insights: growthInsights
    })
})

export default rankings
