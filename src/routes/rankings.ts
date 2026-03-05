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
            COUNT(r.id)                                                        AS total_games,
            SUM(CASE WHEN r.result = 'win'  THEN 1 ELSE 0 END)               AS wins,
            SUM(CASE WHEN r.result = 'loss' THEN 1 ELSE 0 END)               AS losses,
            ROUND(
                100.0 * SUM(CASE WHEN r.result = 'win' THEN 1 ELSE 0 END)
                / MAX(1, COUNT(r.id)), 1
            )                                                                  AS win_rate,
            -- 레이팅: 승리 10점 + 패배 2점 + 득점 보너스
            CAST(
                SUM(CASE WHEN r.result = 'win' THEN 10 ELSE 2 END)
                + SUM(MAX(0, COALESCE(r.my_score, 0) - COALESCE(r.opp_score, 0))) / 5.0
            AS INTEGER)                                                        AS rating,
            COUNT(DISTINCT r.tournament_id)                                   AS tournament_count,
            MAX(r.created_at)                                                  AS last_match_at
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        ${sportJoin}
        ${memberWhere}
        GROUP BY m.id
        HAVING total_games >= ?
        ORDER BY rating DESC, win_rate DESC, total_games DESC
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

        // 전체 통계
        c.env.DB.prepare(`
            SELECT
                COUNT(*)                                                   AS total_games,
                SUM(CASE WHEN result='win'  THEN 1 ELSE 0 END)           AS wins,
                SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END)           AS losses,
                ROUND(100.0 * SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) / MAX(1,COUNT(*)), 1) AS win_rate,
                CAST(SUM(CASE WHEN result='win' THEN 10 ELSE 2 END)
                     + SUM(MAX(0,COALESCE(my_score,0)-COALESCE(opp_score,0)))/5.0 AS INTEGER) AS rating,
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

    // 현재 랭킹 순위 계산
    const myRating = (stat as any)?.rating || 0
    const { results: aboveMe } = await c.env.DB.prepare(`
        SELECT COUNT(DISTINCT m.id) AS cnt
        FROM members m
        JOIN member_match_records r ON r.member_id = m.id
        WHERE m.active = 1
        GROUP BY m.id
        HAVING CAST(SUM(CASE WHEN r.result='win' THEN 10 ELSE 2 END)
                    + SUM(MAX(0,COALESCE(r.my_score,0)-COALESCE(r.opp_score,0)))/5.0 AS INTEGER) > ?
    `).bind(myRating).all()

    const rank = aboveMe.length + 1

    return c.json({
        member: basic,
        stat: { ...stat as any, rank },
        recent: recent.results,
        rivals: rivals.results
    })
})

export default rankings
