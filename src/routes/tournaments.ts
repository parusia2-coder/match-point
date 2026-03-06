import { Hono } from 'hono'
import { optionalAuth, requireAuth } from '../middleware/auth'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Variables = { adminUser: { id: number; username: string; plan: string; organization: string } }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── 인증 미들웨어 전역 적용 (선택적) ─────────────────────────
app.use('*', optionalAuth)

// ── 대회 목록 ────────────────────────────────────────────────
// 로그인 → 내 대회 우선 + 공개대회
// 비로그인 → 전체 공개 대회
app.get('/', async (c) => {
    const user = c.get('adminUser') as any
    const ownerId = user?.id
    const slug = c.req.query('slug')

    if (slug) {
        const org = await c.env.DB.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first() as any;
        if (!org) return c.json({ my: [], public: [], authenticated: !!ownerId });

        const { results } = await c.env.DB.prepare(
            'SELECT * FROM tournaments WHERE org_id = ? AND deleted = 0 ORDER BY created_at DESC'
        ).bind(org.id).all();

        return c.json({ my: results, public: [], authenticated: !!ownerId });
    }

    if (ownerId) {
        let myTournaments: any[] = [];

        if (user.global_role === 'super_admin') {
            const { results } = await c.env.DB.prepare(
                'SELECT * FROM tournaments WHERE deleted = 0 ORDER BY created_at DESC'
            ).all();
            myTournaments = results;
        } else {
            const orgIds = Object.keys(user.org_roles || {}).map(id => parseInt(id, 10)).filter(id => !isNaN(id));

            // 내 대회 (소유자가 나인 것 또는 내가 관리하는 협회의 것)
            if (orgIds.length > 0) {
                const placeholders = orgIds.map(() => '?').join(',');
                const { results } = await c.env.DB.prepare(`
                    SELECT * FROM tournaments 
                    WHERE (owner_id = ? OR org_id IN (${placeholders})) AND deleted = 0 
                    ORDER BY created_at DESC
                `).bind(ownerId, ...orgIds).all();
                myTournaments = results;
            } else {
                const { results } = await c.env.DB.prepare(
                    'SELECT * FROM tournaments WHERE owner_id = ? AND deleted = 0 ORDER BY created_at DESC'
                ).bind(ownerId).all();
                myTournaments = results;
            }
        }

        // 공개 대회 (owner_id가 NULL인 레거시 대회) - super_admin이면 my에 이미 다 있으니 제외하거나 유지해도 됨
        // 일단 UI에서 my 와 public을 분리해서 보여주고 있으니, 기존 로직 참고.
        let publicTournaments: any[] = [];
        if (user.global_role !== 'super_admin') {
            const { results } = await c.env.DB.prepare(
                'SELECT * FROM tournaments WHERE owner_id IS NULL AND deleted = 0 ORDER BY created_at DESC'
            ).all();
            publicTournaments = results;
        }

        return c.json({ my: myTournaments, public: publicTournaments, authenticated: true })
    }

    // 비로그인: 전체 조회 (legacy + public)
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM tournaments WHERE deleted = 0 ORDER BY created_at DESC'
    ).all()
    return c.json({ my: [], public: results, authenticated: false })
})

// ── 대회 상세 ────────────────────────────────────────────────
app.get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare('SELECT * FROM tournaments WHERE id = ? AND deleted = 0').bind(id).first()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
})

// ── 대회 생성 (로그인 필수) ──────────────────────────────────
app.post('/', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser') as any
        const body = await c.req.json()
        const { name, description, format, games_per_player, courts, merge_threshold, admin_password, sport_type, theme_color, custom_logo, use_payment, participation_fee, score_rule_prelim, score_rule_final, max_sets, org_slug } = body

        let orgId = null;
        if (org_slug) {
            const org = await c.env.DB.prepare('SELECT id FROM organizations WHERE slug = ?').bind(org_slug).first() as any;
            if (org) orgId = org.id;
        }

        const result = await c.env.DB.prepare(
            `INSERT INTO tournaments
             (name, description, format, games_per_player, courts, merge_threshold, admin_password,
              sport_type, theme_color, custom_logo, owner_id, use_payment, participation_fee, score_rule_prelim, score_rule_final, max_sets, org_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            name, description || '', format || 'kdk',
            games_per_player || 4, courts || 2, merge_threshold || 4,
            admin_password || '', sport_type || 'badminton',
            theme_color || '#10b981', custom_logo || '',
            user?.id || null,
            use_payment ? 1 : 0,
            participation_fee || 0,
            score_rule_prelim || 25,
            score_rule_final || 21,
            max_sets || 1,
            orgId
        ).run()

        const tournamentId = result.meta.last_row_id;

        // 대회 생성자를 해당 대회의 관리자로 지정
        if (user?.id) {
            await c.env.DB.prepare(
                `INSERT INTO user_roles (user_id, target_type, target_id, role) VALUES (?, 'tournament', ?, 'admin')`
            ).bind(user.id, tournamentId).run()
        }

        return c.json({ id: tournamentId, success: true }, 201)
    } catch (e: any) {
        return c.json({ error: e.message || 'Create failed', detail: e.stack }, 500)
    }
})

// ── 대회 수정 (소유자 또는 비밀번호) ────────────────────────
app.put('/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    const user = c.get('adminUser') as any
    const { name, description, format, games_per_player, courts, merge_threshold, admin_password, sport_type, theme_color, custom_logo, use_payment, participation_fee, current_password, score_rule_prelim, score_rule_final, max_sets } = body

    const existing = await c.env.DB.prepare('SELECT * FROM tournaments WHERE id = ? AND deleted = 0').bind(id).first() as any
    if (!existing) return c.json({ error: 'Not found' }, 404)

    // 권한 확인: JWT 소유자, 슈퍼관리자, 협회관리자, 또는 비밀번호 일치
    const isOwner = user?.id && existing.owner_id && existing.owner_id === user.id
    const isSuperAdmin = user?.global_role === 'super_admin'
    const isOrgAdmin = user?.org_roles && existing.org_id && user.org_roles[existing.org_id]
    const hasPwAuth = current_password && existing.admin_password && current_password === existing.admin_password
    const isLegacy = !existing.owner_id  // owner_id 없는 레거시 대회는 비밀번호로만

    if (!isOwner && !isSuperAdmin && !isOrgAdmin && !hasPwAuth && !isLegacy) {
        return c.json({ error: '수정 권한이 없습니다.' }, 403)
    }

    await c.env.DB.prepare(
        `UPDATE tournaments SET name=?, description=?, format=?, games_per_player=?, courts=?,
         merge_threshold=?, admin_password=?, sport_type=?, theme_color=?, custom_logo=?, 
         use_payment=?, participation_fee=?, score_rule_prelim=?, score_rule_final=?, max_sets=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(name, description, format, games_per_player, courts, merge_threshold, admin_password, sport_type || 'badminton', theme_color || '#10b981', custom_logo || '', use_payment ? 1 : 0, participation_fee || 0, score_rule_prelim || 25, score_rule_final || 21, max_sets || 1, id).run()

    return c.json({ success: true })
})

// ── 상태 변경 ────────────────────────────────────────────────
app.patch('/:id/status', async (c) => {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    const validStatuses = ['draft', 'open', 'in_progress', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400)
    await c.env.DB.prepare('UPDATE tournaments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, id).run()
    return c.json({ success: true })
})

// ── 설정 부분 업데이트 ──────────────────────────────────────
app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    if (body.merge_threshold !== undefined) {
        await c.env.DB.prepare('UPDATE tournaments SET merge_threshold=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .bind(body.merge_threshold, id).run()
    }
    if (body.courts !== undefined) {
        await c.env.DB.prepare('UPDATE tournaments SET courts=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .bind(body.courts, id).run()
    }
    return c.json({ success: true })
})

// ── 대회 삭제 (소유자, 슈퍼관리자, 협회관리자만) ────────────────────────────────────
app.delete('/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const user = c.get('adminUser') as any
        const body = await c.req.json().catch(() => ({})) as any

        const existing = await c.env.DB.prepare('SELECT * FROM tournaments WHERE id = ? AND deleted = 0').bind(id).first() as any
        if (!existing) return c.json({ error: 'Not found' }, 404)

        const isOwner = user?.id && existing.owner_id && existing.owner_id === user.id
        const isSuperAdmin = user?.global_role === 'super_admin'
        const isOrgAdmin = user?.org_roles && existing.org_id && user.org_roles[existing.org_id]
        const hasPwAuth = body?.password && existing.admin_password && body.password === existing.admin_password
        const isLegacy = !existing.owner_id

        if (!isOwner && !isSuperAdmin && !isOrgAdmin && !hasPwAuth && !isLegacy) {
            return c.json({ error: '삭제 권한이 없습니다.' }, 403)
        }

        // 종속 데이터 삭제 (테이블이 없을 수도 있으므로 각각 try-catch)
        const deleteTables = [
            'DELETE FROM standings WHERE event_id IN (SELECT id FROM events WHERE tournament_id = ?)',
            'DELETE FROM matches WHERE tournament_id = ?',
            'DELETE FROM teams WHERE tournament_id = ?',
            'DELETE FROM events WHERE tournament_id = ?',
            'DELETE FROM audit_logs WHERE tournament_id = ?',
            'DELETE FROM venues WHERE tournament_id = ?',
            'DELETE FROM push_subscriptions WHERE tournament_id = ?',
            'DELETE FROM push_notifications WHERE tournament_id = ?',
            'DELETE FROM member_tournament_history WHERE tournament_id = ?',
            'DELETE FROM member_match_records WHERE tournament_id = ?',
            'DELETE FROM elo_history WHERE tournament_id = ?',
            'DELETE FROM payments WHERE tournament_id = ?',
        ]
        for (const sql of deleteTables) {
            try { await c.env.DB.prepare(sql).bind(id).run() } catch (e) { /* table may not exist */ }
        }

        // 참가자 및 대회 정보는 이력 보존을 위해 소프트 딜리트
        try { await c.env.DB.prepare('UPDATE participants SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE tournament_id = ?').bind(id).run() } catch (e) { }
        await c.env.DB.prepare('UPDATE tournaments SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run()

        return c.json({ success: true })
    } catch (e: any) {
        return c.json({ error: e.message || 'Delete failed', detail: e.stack }, 500)
    }
})

// ── 비밀번호 인증 (레거시 호환) ─────────────────────────────
app.post('/:id/auth', async (c) => {
    const id = c.req.param('id')
    const { password } = await c.req.json()
    const row = await c.env.DB.prepare('SELECT admin_password, owner_id FROM tournaments WHERE id=? AND deleted=0').bind(id).first() as any
    if (!row) return c.json({ error: 'Not found' }, 404)

    // JWT 소유자는 비밀번호 없이 통과
    const user = c.get('adminUser') as any
    if (user?.id && row.owner_id && row.owner_id === user.id) {
        return c.json({ authenticated: true, method: 'jwt' })
    }

    if (row.admin_password && row.admin_password !== password) {
        return c.json({ error: 'Invalid password', authenticated: false }, 403)
    }
    return c.json({ authenticated: true, method: 'password' })
})

// ── 통계 / 인쇄 / Stats (기존 그대로) ───────────────────────
app.get('/:id/stats', async (c) => {
    const id = c.req.param('id')
    const participants = await c.env.DB.prepare(
        `SELECT 
            COUNT(*) as total, 
            SUM(CASE WHEN gender="m" THEN 1 ELSE 0 END) as male, 
            SUM(CASE WHEN gender="f" THEN 1 ELSE 0 END) as female, 
            SUM(paid) as paid_count, 
            SUM(checked_in) as checkedin_count,
            SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as toss_paid_count,
            SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as toss_pending_count,
            SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as total_revenue
         FROM participants WHERE tournament_id=? AND deleted=0`
    ).bind(id).first() as any
    const events = await c.env.DB.prepare('SELECT COUNT(*) as total FROM events WHERE tournament_id=?').bind(id).first() as any
    const matches = await c.env.DB.prepare(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status="completed" THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status="playing" THEN 1 ELSE 0 END) as playing FROM matches WHERE tournament_id=?'
    ).bind(id).first() as any
    return c.json({ participants, events: events.total, matches })
})

app.get('/:id/print-data', async (c) => {
    const tid = c.req.param('id')
    const tournament = await c.env.DB.prepare('SELECT * FROM tournaments WHERE id=? AND deleted=0').bind(tid).first()
    if (!tournament) return c.json({ error: 'Not found' }, 404)

    const { results: participants } = await c.env.DB.prepare('SELECT * FROM participants WHERE tournament_id=? AND deleted=0 ORDER BY club, name').bind(tid).all()
    const { results: events } = await c.env.DB.prepare('SELECT * FROM events WHERE tournament_id=? ORDER BY category, age_group, level_group').bind(tid).all()
    const { results: teams } = await c.env.DB.prepare(
        `SELECT t.*, p1.name as p1_name, p1.level as p1_level, p1.club as p1_club,
                p2.name as p2_name, p2.level as p2_level, p2.club as p2_club
         FROM teams t
         JOIN participants p1 ON t.player1_id = p1.id
         JOIN participants p2 ON t.player2_id = p2.id
         WHERE t.tournament_id=? ORDER BY t.event_id, t.group_num, t.id`
    ).bind(tid).all()
    const { results: matches } = await c.env.DB.prepare(
        `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name,
                t1p1.name as t1p1_name, t1p2.name as t1p2_name, t2p1.name as t2p1_name, t2p2.name as t2p2_name
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id=t1.id LEFT JOIN teams t2 ON m.team2_id=t2.id
         LEFT JOIN participants t1p1 ON t1.player1_id=t1p1.id LEFT JOIN participants t1p2 ON t1.player2_id=t1p2.id
         LEFT JOIN participants t2p1 ON t2.player1_id=t2p1.id LEFT JOIN participants t2p2 ON t2.player2_id=t2p2.id
         WHERE m.tournament_id=? ORDER BY m.event_id, m.group_num, m.round, m.match_order`
    ).bind(tid).all()
    const { results: standings } = await c.env.DB.prepare(
        `SELECT s.*, t.team_name, t.event_id, t.group_num, p1.name as p1_name, p2.name as p2_name
         FROM standings s
         JOIN teams t ON s.team_id=t.id
         JOIN participants p1 ON t.player1_id=p1.id
         JOIN participants p2 ON t.player2_id=p2.id
         WHERE t.tournament_id=? ORDER BY s.event_id, t.group_num, s.points DESC, s.goal_difference DESC`
    ).bind(tid).all()

    return c.json({ tournament, participants, events, teams, matches, standings })
})

// ── 대회 통계 리포트 ─────────────────────────────────────────
app.get('/:id/report', async (c) => {
    const tid = c.req.param('id')

    const tournament = await c.env.DB.prepare(
        'SELECT * FROM tournaments WHERE id=? AND deleted=0'
    ).bind(tid).first() as any
    if (!tournament) return c.json({ error: 'Not found' }, 404)

    const [
        participantsStat,
        byLevel,
        byClub,
        matchesStat,
        eventsStat,
        standings,
        topScorers,
        mostWins,
        eventResults
    ] = await Promise.all([
        // 참가자 전체 통계
        c.env.DB.prepare(`
            SELECT
                COUNT(*)                                                    AS total,
                SUM(CASE WHEN gender='m' THEN 1 ELSE 0 END)              AS male,
                SUM(CASE WHEN gender='f' THEN 1 ELSE 0 END)              AS female,
                SUM(paid)                                                  AS paid,
                SUM(checked_in)                                            AS checked_in,
                COUNT(DISTINCT club)                                       AS club_count
            FROM participants WHERE tournament_id=? AND deleted=0
        `).bind(tid).first(),

        // 급수별 분포
        c.env.DB.prepare(`
            SELECT level, COUNT(*) AS cnt
            FROM participants WHERE tournament_id=? AND deleted=0 AND level IS NOT NULL
            GROUP BY level ORDER BY level
        `).bind(tid).all(),

        // 클럽별 참가자 TOP 10
        c.env.DB.prepare(`
            SELECT club, COUNT(*) AS cnt
            FROM participants WHERE tournament_id=? AND deleted=0 AND club IS NOT NULL
            GROUP BY club ORDER BY cnt DESC LIMIT 10
        `).bind(tid).all(),

        // 경기 통계
        c.env.DB.prepare(`
            SELECT
                COUNT(*)                                                          AS total,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)             AS completed,
                SUM(CASE WHEN status='playing'   THEN 1 ELSE 0 END)             AS in_progress,
                SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END)             AS pending,
                ROUND(AVG(CASE WHEN status='completed'
                    THEN COALESCE(team1_set1,0)+COALESCE(team1_set2,0)+COALESCE(team1_set3,0)
                    ELSE NULL END), 1)                                            AS avg_score_winner,
                MAX(COALESCE(team1_set1,0)+COALESCE(team1_set2,0)+COALESCE(team1_set3,0)+
                    COALESCE(team2_set1,0)+COALESCE(team2_set2,0)+COALESCE(team2_set3,0)) AS max_total_score
            FROM matches WHERE tournament_id=?
        `).bind(tid).first(),

        // 종목별 경기 수
        c.env.DB.prepare(`
            SELECT e.name AS event_name, e.id AS event_id,
                   COUNT(m.id) AS match_count,
                   SUM(CASE WHEN m.status='completed' THEN 1 ELSE 0 END) AS completed
            FROM events e
            LEFT JOIN matches m ON m.event_id = e.id
            WHERE e.tournament_id=?
            GROUP BY e.id ORDER BY e.id
        `).bind(tid).all(),

        // 종목별 최종 순위 TOP 3 (서브쿼리 방식으로 SQLite 호환)
        c.env.DB.prepare(`
            SELECT * FROM (
                SELECT s.wins, s.losses, s.points, s.goal_difference,
                       t2.team_name, e.name AS event_name, s.event_id,
                       p1.name AS p1_name, p1.club AS p1_club,
                       p2.name AS p2_name,
                       ROW_NUMBER() OVER (
                           PARTITION BY s.event_id
                           ORDER BY s.points DESC, s.goal_difference DESC
                       ) AS rank_in_event
                FROM standings s
                JOIN teams t2 ON s.team_id = t2.id
                JOIN events e  ON s.event_id = e.id
                JOIN participants p1 ON t2.player1_id = p1.id
                JOIN participants p2 ON t2.player2_id = p2.id
                WHERE t2.tournament_id = ?
            ) WHERE rank_in_event <= 3
            ORDER BY event_id, rank_in_event
        `).bind(tid).all(),

        // 최고 득점 (개인 합산) TOP 5
        c.env.DB.prepare(`
            SELECT p.name, p.club,
                   SUM(
                       CASE WHEN m.team1_id = t.id
                            THEN COALESCE(m.team1_set1,0)+COALESCE(m.team1_set2,0)+COALESCE(m.team1_set3,0)
                            ELSE COALESCE(m.team2_set1,0)+COALESCE(m.team2_set2,0)+COALESCE(m.team2_set3,0)
                       END
                   ) AS total_score,
                   COUNT(m.id) AS games
            FROM participants p
            JOIN teams t ON (t.player1_id = p.id OR t.player2_id = p.id)
            JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
            WHERE p.tournament_id=? AND p.deleted=0 AND m.status='completed'
            GROUP BY p.id ORDER BY total_score DESC LIMIT 5
        `).bind(tid).all(),

        // 최다 승리 선수 TOP 5
        c.env.DB.prepare(`
            SELECT p.name, p.club,
                   COUNT(m.id) AS wins
            FROM participants p
            JOIN teams t ON (t.player1_id = p.id OR t.player2_id = p.id)
            JOIN matches m ON (
                (m.team1_id = t.id AND m.winner_team = 1) OR
                (m.team2_id = t.id AND m.winner_team = 2)
            )
            WHERE p.tournament_id=? AND p.deleted=0
            GROUP BY p.id ORDER BY wins DESC LIMIT 5
        `).bind(tid).all(),

        // 종목별 세부 순위 (전체)
        c.env.DB.prepare(`
            SELECT s.*, t2.team_name, e.name AS event_name, e.id AS event_id,
                   p1.name AS p1_name, p1.club AS p1_club, p1.level AS p1_level,
                   p2.name AS p2_name
            FROM standings s
            JOIN teams t2 ON s.team_id = t2.id
            JOIN events e  ON s.event_id = e.id
            JOIN participants p1 ON t2.player1_id = p1.id
            JOIN participants p2 ON t2.player2_id = p2.id
            WHERE t2.tournament_id=?
            ORDER BY s.event_id, s.points DESC, s.goal_difference DESC
        `).bind(tid).all()
    ])

    // 종목별 전체 순위 그룹핑
    const resultsByEvent: Record<string, any[]> = {}
    for (const row of (eventResults.results as any[])) {
        const key = row.event_name || '기타'
        if (!resultsByEvent[key]) resultsByEvent[key] = []
        resultsByEvent[key].push(row)
    }
    resultsByEvent

    return c.json({
        tournament,
        participants: {
            stat: participantsStat,
            by_level: byLevel.results,
            by_club: byClub.results
        },
        matches: matchesStat,
        events: eventsStat.results,
        podium: standings.results,    // 종목별 TOP3
        top_scorers: topScorers.results,
        most_wins: mostWins.results,
        results_by_event: resultsByEvent,
        generated_at: new Date().toISOString()
    })
})

export default app
