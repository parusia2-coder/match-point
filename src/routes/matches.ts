import { Hono } from 'hono'
import { broadcastUpdate } from './live'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// List matches
app.get('/:tid/matches', async (c) => {
    const tid = c.req.param('tid')
    const eventId = c.req.query('event_id')
    let query = `SELECT m.*, 
    t1.team_name as team1_name, t2.team_name as team2_name,
    t1p1.name as t1p1_name, t1p2.name as t1p2_name,
    t2p1.name as t2p1_name, t2p2.name as t2p2_name,
    e.name as event_name, e.category,
    v.name as venue_name, v.stream_name
    FROM matches m
    LEFT JOIN teams t1 ON m.team1_id = t1.id
    LEFT JOIN teams t2 ON m.team2_id = t2.id
    LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id
    LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
    LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id
    LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
    LEFT JOIN events e ON m.event_id = e.id
    LEFT JOIN venues v ON m.venue_id = v.id
    WHERE m.tournament_id = ?`
    const binds: any[] = [tid]

    const venueId = c.req.query('venue_id')
    if (venueId) {
        query += ' AND m.venue_id = ?'
        binds.push(venueId)
    }
    if (eventId) {
        query += ' AND m.event_id = ?'
        binds.push(eventId)
    }
    query += ' ORDER BY m.round, m.match_order'
    const stmt = c.env.DB.prepare(query)
    const { results } = await (binds.length === 1 ? stmt.bind(binds[0]) : stmt.bind(...binds)).all()
    return c.json(results)
})

// Update score
app.put('/:tid/matches/:mid/score', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('mid')
    const body = await c.req.json()
    const { team1_set1, team1_set2, team1_set3, team2_set1, team2_set2, team2_set3, winner_team, status, court_swapped } = body

    // Get old values for audit
    const oldMatch = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').bind(mid, tid).first() as any
    if (!oldMatch) return c.json({ error: 'Match not found' }, 404)

    await c.env.DB.prepare(
        `UPDATE matches SET team1_set1=?, team1_set2=?, team1_set3=?, 
     team2_set1=?, team2_set2=?, team2_set3=?,
     winner_team=?, status=?, court_swapped=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND tournament_id=?`
    ).bind(
        team1_set1 ?? 0, team1_set2 ?? 0, team1_set3 ?? 0,
        team2_set1 ?? 0, team2_set2 ?? 0, team2_set3 ?? 0,
        winner_team || null, status || oldMatch.status, court_swapped !== undefined ? court_swapped : (oldMatch.court_swapped || 0), mid, tid
    ).run()

    // Audit log
    await c.env.DB.prepare(
        'INSERT INTO audit_logs (tournament_id, match_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
    ).bind(tid, mid, 'score_update',
        JSON.stringify({ t1: [oldMatch.team1_set1, oldMatch.team1_set2, oldMatch.team1_set3], t2: [oldMatch.team2_set1, oldMatch.team2_set2, oldMatch.team2_set3] }),
        JSON.stringify({ t1: [team1_set1, team1_set2, team1_set3], t2: [team2_set1, team2_set2, team2_set3], winner: winner_team })
    ).run()

    // Update standings if completed
    if (status === 'completed' && winner_team) {
        if (oldMatch.round >= 900) {
            await autoAdvanceBracket(c.env.DB, parseInt(tid), oldMatch.event_id, oldMatch.round, oldMatch.match_order, winner_team, oldMatch.team1_id, oldMatch.team2_id)
        } else {
            await updateStandings(c.env.DB, parseInt(mid), parseInt(tid))
        }
        // 🔴 개인 경기 기록 자동 저장
        await saveMemberMatchRecords(c.env.DB, parseInt(mid), parseInt(tid), body)
    }

    // Send push notifications when match starts
    if (status === 'playing' && oldMatch.status !== 'playing') {
        await sendMatchNotifications(c.env, parseInt(tid), parseInt(mid), 'match_starting')
        // Also notify next match on same court
        await notifyNextMatch(c.env, parseInt(tid), oldMatch.court_number)
    }

    // Broadcast update via WebSocket
    broadcastUpdate(tid, { type: 'update', message: 'Score updated', match_id: mid })

    return c.json({ success: true })
})

// Update match status
app.patch('/:tid/matches/:mid/status', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('mid')
    const { status } = await c.req.json()

    const oldMatch = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').bind(mid, tid).first() as any
    if (!oldMatch) return c.json({ error: 'Not found' }, 404)

    await c.env.DB.prepare('UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?').bind(status, mid, tid).run()

    if (status === 'playing' && oldMatch.status !== 'playing') {
        await sendMatchNotifications(c.env, parseInt(tid), parseInt(mid), 'match_starting')
        await notifyNextMatch(c.env, parseInt(tid), oldMatch.court_number)
    }

    // Broadcast update via WebSocket
    broadcastUpdate(tid, { type: 'update', message: 'Match status changed', match_id: mid })

    return c.json({ success: true })
})

// Standings
app.get('/:tid/standings', async (c) => {
    const tid = c.req.param('tid')

    // Recalculate all standings
    const { results: events } = await c.env.DB.prepare('SELECT id FROM events WHERE tournament_id = ?').bind(tid).all() as any
    for (const evt of events) {
        await recalculateStandings(c.env.DB, evt.id, parseInt(tid))
    }

    const { results } = await c.env.DB.prepare(
        `SELECT s.*, t.team_name, t.event_id, t.group_num, e.name as event_name,
       p1.name as p1_name, p2.name as p2_name
     FROM standings s
     JOIN teams t ON s.team_id = t.id
     JOIN events e ON s.event_id = e.id
     JOIN participants p1 ON t.player1_id = p1.id
     JOIN participants p2 ON t.player2_id = p2.id
     WHERE t.tournament_id = ?
     ORDER BY s.event_id, t.group_num, s.points DESC, s.goal_difference DESC, s.score_for DESC`
    ).bind(tid).all()
    return c.json(results)
})

// Court current match
app.get('/:tid/court/:courtNum', async (c) => {
    const tid = c.req.param('tid')
    const courtNum = c.req.param('courtNum')

    const venueId = c.req.query('venue_id')
    let currentQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name,
       t1p1.name as t1p1_name, t1p2.name as t1p2_name,
       t2p1.name as t2p1_name, t2p2.name as t2p2_name,
       e.name as event_name, e.category,
       trn.sport_type
     FROM matches m
     LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
     LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
     LEFT JOIN events e ON m.event_id = e.id
     LEFT JOIN tournaments trn ON m.tournament_id = trn.id
     WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'playing'`
    const currentBinds: any[] = [tid, courtNum]
    if (venueId) {
        currentQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
        currentBinds.push(venueId)
    }
    currentQuery += ' LIMIT 1'
    const current = await c.env.DB.prepare(currentQuery).bind(...currentBinds).first()

    // Next pending match
    let nextQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name,
       t1p1.name as t1p1_name, t1p2.name as t1p2_name,
       t2p1.name as t2p1_name, t2p2.name as t2p2_name,
       e.name as event_name, e.category,
       trn.sport_type
     FROM matches m
     LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
     LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
     LEFT JOIN events e ON m.event_id = e.id
     LEFT JOIN tournaments trn ON m.tournament_id = trn.id
     WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'pending'`
    const nextBinds: any[] = [tid, courtNum]
    if (venueId) {
        nextQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
        nextBinds.push(venueId)
    }
    nextQuery += ' ORDER BY m.round ASC, m.match_order ASC LIMIT 1'
    const next = await c.env.DB.prepare(nextQuery).bind(...nextBinds).first()

    // Recent completed
    let recentQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name,
       e.name as event_name
     FROM matches m
     LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN events e ON m.event_id = e.id
     WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'completed'`
    const recentBinds: any[] = [tid, courtNum]
    if (venueId) {
        recentQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
        recentBinds.push(venueId)
    }
    recentQuery += ' ORDER BY m.updated_at DESC LIMIT 3'
    const recent = await c.env.DB.prepare(recentQuery).bind(...recentBinds).all()

    return c.json({ current, next, recent: recent.results })
})

// Auto-start next match on court
app.post('/:tid/court/:courtNum/next', async (c) => {
    const tid = c.req.param('tid')
    const courtNum = c.req.param('courtNum')

    const venueId = c.req.query('venue_id')

    // Check no active match
    let activeQuery = 'SELECT id FROM matches WHERE tournament_id = ? AND court_number = ? AND status = \'playing\''
    const activeBinds: any[] = [tid, courtNum]
    if (venueId) {
        activeQuery += ' AND (venue_id = ? OR venue_id IS NULL)'
        activeBinds.push(venueId)
    }
    const active = await c.env.DB.prepare(activeQuery).bind(...activeBinds).first()
    if (active) return c.json({ error: 'Court is busy' }, 400)

    let nextQuery = 'SELECT id FROM matches WHERE tournament_id = ? AND court_number = ? AND status = \'pending\''
    const nextBinds: any[] = [tid, courtNum]
    if (venueId) {
        nextQuery += ' AND (venue_id = ? OR venue_id IS NULL)'
        nextBinds.push(venueId)
    }
    nextQuery += ' ORDER BY round, match_order LIMIT 1'
    const next = await c.env.DB.prepare(nextQuery).bind(...nextBinds).first() as any
    if (!next) return c.json({ error: 'No pending matches' }, 404)

    await c.env.DB.prepare('UPDATE matches SET status = \'playing\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(next.id).run()

    // Send notifications
    await sendMatchNotifications(c.env, parseInt(tid), next.id, 'match_starting')
    await notifyNextMatch(c.env, parseInt(tid), parseInt(courtNum))

    // Broadcast update via WebSocket
    broadcastUpdate(tid, { type: 'update', message: 'Next match started', match_id: next.id })

    return c.json({ success: true, match_id: next.id })
})

// Courts overview
app.get('/:tid/courts/overview', async (c) => {
    const tid = c.req.param('tid')
    const venueId = c.req.query('venue_id')
    const tournament = await c.env.DB.prepare('SELECT courts FROM tournaments WHERE id = ? AND deleted = 0').bind(tid).first() as any
    if (!tournament) return c.json({ error: 'Not found or deleted' }, 404)

    let numCourts = tournament?.courts || 6
    if (venueId) {
        const venue = await c.env.DB.prepare('SELECT courts_count FROM venues WHERE id = ?').bind(venueId).first() as any
        if (venue) numCourts = venue.courts_count || 1
    }

    const overview: any[] = []
    for (let i = 1; i <= numCourts; i++) {
        let playingQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name, e.name as event_name
       FROM matches m
       LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
       LEFT JOIN events e ON m.event_id = e.id
       WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'playing'`
        const playingBinds: any[] = [tid, i]
        if (venueId) {
            playingQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
            playingBinds.push(venueId)
        }
        playingQuery += ' LIMIT 1'
        const playing = await c.env.DB.prepare(playingQuery).bind(...playingBinds).first()

        let pendingQuery = 'SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = ? AND court_number = ? AND status = \'pending\''
        const pendingBinds: any[] = [tid, i]
        if (venueId) {
            pendingQuery += ' AND (venue_id = ? OR venue_id IS NULL)'
            pendingBinds.push(venueId)
        }
        const pendingCount = await c.env.DB.prepare(pendingQuery).bind(...pendingBinds).first() as any

        let recently_completed = null;
        if (!playing) {
            let completedQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name, e.name as event_name
           FROM matches m
           LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
           LEFT JOIN events e ON m.event_id = e.id
           WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'completed' AND m.updated_at >= datetime('now', '-20 seconds')`
            const completedBinds: any[] = [tid, i]
            if (venueId) {
                completedQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
                completedBinds.push(venueId)
            }
            completedQuery += ' ORDER BY m.updated_at DESC LIMIT 1'
            recently_completed = await c.env.DB.prepare(completedQuery).bind(...completedBinds).first()
        }
        // 다음 예정 경기 (시간순)
        let nextMatch = null
        let nextQuery = `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name, e.name as event_name
       FROM matches m
       LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
       LEFT JOIN events e ON m.event_id = e.id
       WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'pending'`
        const nextBinds: any[] = [tid, i]
        if (venueId) {
            nextQuery += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
            nextBinds.push(venueId)
        }
        nextQuery += ' ORDER BY CASE WHEN m.scheduled_time IS NOT NULL THEN 0 ELSE 1 END, m.scheduled_time ASC, m.round ASC, m.match_order ASC LIMIT 1'
        nextMatch = await c.env.DB.prepare(nextQuery).bind(...nextBinds).first()

        overview.push({ court: i, current: playing, pending: pendingCount?.cnt || 0, recently_completed, next_match: nextMatch })
    }
    return c.json(overview)
})

// Reassign match (change court/order/time)
app.put('/:tid/matches/:mid/reassign', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('mid')
    const body = await c.req.json()
    const { court_number, match_order, scheduled_time } = body

    const oldMatch = await c.env.DB.prepare(
        'SELECT * FROM matches WHERE id = ? AND tournament_id = ?'
    ).bind(mid, tid).first() as any
    if (!oldMatch) return c.json({ error: 'Match not found' }, 404)

    // Build dynamic SET clause - only update fields that were provided
    const sets: string[] = []
    const binds: any[] = []

    if (court_number !== undefined && court_number !== null) {
        sets.push('court_number = ?')
        binds.push(court_number)
    }
    if (match_order !== undefined && match_order !== null) {
        sets.push('match_order = ?')
        binds.push(match_order)
    }
    if (scheduled_time !== undefined) {
        sets.push('scheduled_time = ?')
        binds.push(scheduled_time || null)
    }

    if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400)

    sets.push('updated_at = CURRENT_TIMESTAMP')
    binds.push(mid, tid)

    await c.env.DB.prepare(
        `UPDATE matches SET ${sets.join(', ')} WHERE id = ? AND tournament_id = ?`
    ).bind(...binds).run()

    // Audit log
    await c.env.DB.prepare(
        'INSERT INTO audit_logs (tournament_id, match_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
    ).bind(tid, mid, 'match_reassign',
        JSON.stringify({ court: oldMatch.court_number, order: oldMatch.match_order, time: oldMatch.scheduled_time }),
        JSON.stringify({ court: court_number, order: match_order, time: scheduled_time })
    ).run()

    // Broadcast update via WebSocket
    broadcastUpdate(tid, { type: 'update', message: 'Match reassigned', match_id: mid })

    return c.json({ success: true })
})

// Audit logs
app.get('/:tid/audit-logs', async (c) => {
    const tid = c.req.param('tid')
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM audit_logs WHERE tournament_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(tid).all()
    return c.json(results)
})

// Signature save
app.put('/:tid/matches/:mid/signature', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('mid')
    const { team1_signature, team2_signature } = await c.req.json()
    await c.env.DB.prepare(
        'UPDATE matches SET team1_signature = ?, team2_signature = ?, signature_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
    ).bind(team1_signature || null, team2_signature || null, mid, tid).run()
    return c.json({ success: true })
})

// Signature get
app.get('/:tid/matches/:mid/signature', async (c) => {
    const mid = c.req.param('mid')
    const row = await c.env.DB.prepare(
        'SELECT team1_signature, team2_signature, signature_at FROM matches WHERE id = ?'
    ).bind(mid).first()
    return c.json(row || {})
})

// Dashboard stats
app.get('/:tid/dashboard', async (c) => {
    const tid = c.req.param('tid')

    // 존재하는(삭제되지 않은) 대회인지 확인
    const tournament = await c.env.DB.prepare('SELECT id FROM tournaments WHERE id = ? AND deleted = 0').bind(tid).first()
    if (!tournament) return c.json({ error: 'Not found or deleted' }, 404)

    const total = await c.env.DB.prepare(
        `SELECT COUNT(*) as total, 
     SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
     SUM(CASE WHEN status='playing' THEN 1 ELSE 0 END) as playing,
     SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
     FROM matches WHERE tournament_id = ?`
    ).bind(tid).first() as any

    const { results: eventStats } = await c.env.DB.prepare(
        `SELECT e.id, e.name, e.category,
     COUNT(m.id) as total_matches,
     SUM(CASE WHEN m.status='completed' THEN 1 ELSE 0 END) as completed,
     SUM(CASE WHEN m.status='playing' THEN 1 ELSE 0 END) as playing
     FROM events e
     LEFT JOIN matches m ON e.id = m.event_id
     WHERE e.tournament_id = ?
     GROUP BY e.id ORDER BY e.category, e.name`
    ).bind(tid).all()

    const { results: clubStats } = await c.env.DB.prepare(
        `SELECT p.club, COUNT(DISTINCT p.id) as participants,
     COUNT(DISTINCT CASE WHEN m.status='completed' AND m.winner_team IS NOT NULL THEN m.id END) as matches_played
     FROM participants p
     LEFT JOIN teams t ON (p.id = t.player1_id OR p.id = t.player2_id)
     LEFT JOIN matches m ON (t.id = m.team1_id OR t.id = m.team2_id)
     WHERE p.tournament_id = ? AND p.deleted = 0 AND p.club != ''
     GROUP BY p.club ORDER BY participants DESC`
    ).bind(tid).all()

    return c.json({
        overall: total,
        completion_rate: total.total > 0 ? Math.round((total.completed / total.total) * 100) : 0,
        events: eventStats,
        clubs: clubStats
    })
})

// My matches (participant view)
app.get('/:tid/my-matches', async (c) => {
    const tid = c.req.param('tid')
    const name = c.req.query('name')
    const phone = c.req.query('phone')

    if (!name) return c.json({ error: 'Name required' }, 400)

    // Find participant
    let participant
    if (phone) {
        participant = await c.env.DB.prepare(
            'SELECT * FROM participants WHERE tournament_id = ? AND name = ? AND phone = ? AND deleted = 0'
        ).bind(tid, name, phone).first()
    }
    if (!participant) {
        participant = await c.env.DB.prepare(
            'SELECT * FROM participants WHERE tournament_id = ? AND name = ? AND deleted = 0 LIMIT 1'
        ).bind(tid, name).first()
    }
    if (!participant) return c.json({ error: 'Participant not found', matches: [] }, 404)

    const { results: matches } = await c.env.DB.prepare(
        `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name,
       e.name as event_name, e.category,
       t1p1.name as t1p1_name, t1p2.name as t1p2_name,
       t2p1.name as t2p1_name, t2p2.name as t2p2_name
     FROM matches m
     JOIN teams t1 ON m.team1_id = t1.id
     JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id
     LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
     LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id
     LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
     LEFT JOIN events e ON m.event_id = e.id
     WHERE m.tournament_id = ? AND (t1.player1_id = ? OR t1.player2_id = ? OR t2.player1_id = ? OR t2.player2_id = ?)
     ORDER BY CASE m.status WHEN 'playing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, m.round, m.match_order`
    ).bind(tid, (participant as any).id, (participant as any).id, (participant as any).id, (participant as any).id).all()

    return c.json({ participant, matches })
})

// Timeline
app.get('/:tid/timeline', async (c) => {
    const tid = c.req.param('tid')
    const venueId = c.req.query('venue_id')
    const tournament = await c.env.DB.prepare('SELECT courts FROM tournaments WHERE id = ?').bind(tid).first() as any
    let numCourts = tournament?.courts || 6

    if (venueId) {
        const venue = await c.env.DB.prepare('SELECT courts_count FROM venues WHERE id = ?').bind(venueId).first() as any
        if (venue) numCourts = venue.courts_count || numCourts
    }

    // Lightweight tuple format for performance
    let query = `SELECT m.id, m.court_number as c, m.round as r, m.match_order as o, m.status as s,
       m.team1_set1, m.team1_set2, m.team1_set3, m.team2_set1, m.team2_set2, m.team2_set3,
       m.winner_team as w, m.group_num as g, m.scheduled_time as st,
       t1.team_name as n1, t2.team_name as n2,
       e.name as en, e.category as ec
     FROM matches m
     LEFT JOIN teams t1 ON m.team1_id = t1.id
     LEFT JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN events e ON m.event_id = e.id
     WHERE m.tournament_id = ?`
    const binds: any[] = [tid]
    if (venueId) {
        query += ' AND (m.venue_id = ? OR m.venue_id IS NULL)'
        binds.push(venueId)
    }
    query += ' ORDER BY m.court_number, CASE WHEN m.scheduled_time IS NOT NULL THEN 0 ELSE 1 END, m.scheduled_time, m.round, m.match_order'

    const { results: matches } = await c.env.DB.prepare(query).bind(...binds).all()

    // Also return venues list
    const { results: venues } = await c.env.DB.prepare('SELECT id, name, courts_count FROM venues WHERE tournament_id = ?').bind(tid).all()

    return c.json({ courts: numCourts, matches, venues })
})

// Helper: recalculate standings for an event
async function recalculateStandings(db: D1Database, eventId: number, tid: number) {
    // Clear existing
    await db.prepare('DELETE FROM standings WHERE event_id = ?').bind(eventId).run()

    // Get teams
    const { results: teams } = await db.prepare('SELECT id FROM teams WHERE event_id = ?').bind(eventId).all() as any

    // Get completed matches
    const { results: matches } = await db.prepare(
        'SELECT * FROM matches WHERE event_id = ? AND status = \'completed\' AND winner_team IS NOT NULL'
    ).bind(eventId).all() as any

    // Calculate per team
    for (const team of teams) {
        let wins = 0, losses = 0, scoreFor = 0, scoreAgainst = 0

        for (const m of matches) {
            const isTeam1 = m.team1_id === team.id
            const isTeam2 = m.team2_id === team.id
            if (!isTeam1 && !isTeam2) continue

            const myScores = isTeam1 ? [m.team1_set1, m.team1_set2, m.team1_set3] : [m.team2_set1, m.team2_set2, m.team2_set3]
            const oppScores = isTeam1 ? [m.team2_set1, m.team2_set2, m.team2_set3] : [m.team1_set1, m.team1_set2, m.team1_set3]

            scoreFor += myScores.reduce((a: number, b: number) => a + (b || 0), 0)
            scoreAgainst += oppScores.reduce((a: number, b: number) => a + (b || 0), 0)

            if ((isTeam1 && m.winner_team === 1) || (isTeam2 && m.winner_team === 2)) {
                wins++
            } else {
                losses++
            }
        }

        const points = wins * 2
        const goalDiff = scoreFor - scoreAgainst

        await db.prepare(
            'INSERT INTO standings (event_id, team_id, wins, losses, points, score_for, score_against, goal_difference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(eventId, team.id, wins, losses, points, scoreFor, scoreAgainst, goalDiff).run()
    }
}

async function updateStandings(db: D1Database, matchId: number, tid: number) {
    const match = await db.prepare('SELECT event_id FROM matches WHERE id = ?').bind(matchId).first() as any
    if (match) {
        await recalculateStandings(db, match.event_id, tid)
    }
}

async function autoAdvanceBracket(db: D1Database, tid: number, eventId: number, round: number, matchOrder: number, winner: number | string, team1_id: number | null, team2_id: number | null) {
    // Determine the actual winning team ID
    // Note: winner could be the team ID itself, or 1 for team1, 2 for team2
    let winningTeamId = null;
    if (winner == 1) winningTeamId = team1_id;
    else if (winner == 2) winningTeamId = team2_id;
    else if (winner == team1_id || winner == team2_id) winningTeamId = winner;

    if (!winningTeamId) return; // Cannot determine winner ID

    const nextRound = Math.floor(round) + 1;
    const nextOrder = Math.ceil(matchOrder / 2);
    const isTeam1 = (matchOrder % 2 !== 0);
    const colToUpdate = isTeam1 ? 'team1_id' : 'team2_id';

    // Find if the next match exists
    const nextMatch = await db.prepare(
        'SELECT id FROM matches WHERE event_id = ? AND round = ? AND match_order = ?'
    ).bind(eventId, nextRound, nextOrder).first() as any;

    if (nextMatch) {
        // Update the next match with the winning team
        await db.prepare(
            `UPDATE matches SET ${colToUpdate} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(winningTeamId, nextMatch.id).run();

        // Broadcast the bracket update
        broadcastUpdate(tid.toString(), { type: 'update', message: 'Bracket auto-advanced', match_id: nextMatch.id })
    }
}

// --- Solapi SMS Helper ----------------------------------------------------
async function getSolapiAuth(apiKey: string, apiSecret: string) {
    const salt = crypto.randomUUID().replace(/-/g, '');
    const date = new Date().toISOString();
    const data = date + salt;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signatureHex}`;
}

async function sendSolapiSms(env: any, toPhone: string, text: string) {
    if (!env || !env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET || !env.SOLAPI_SENDER) return;
    const cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) return;
    try {
        const authHeader = await getSolapiAuth(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET);
        await fetch('https://api.solapi.com/messages/v4/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ message: { to: cleanPhone, from: env.SOLAPI_SENDER, text } })
        });
    } catch (e) {
        console.error('Solapi SMS error:', e);
    }
}
// --------------------------------------------------------------------------

// Push notification helpers
async function sendMatchNotifications(env: any, tid: number, matchId: number, type: string) {
    const db = env.DB;
    try {
        const match = await db.prepare(
            `SELECT m.*, t1.player1_id as t1p1, t1.player2_id as t1p2, t2.player1_id as t2p1, t2.player2_id as t2p2
       FROM matches m
       JOIN teams t1 ON m.team1_id = t1.id
       JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.id = ?`
        ).bind(matchId).first() as any
        if (!match) return

        const playerIds = [match.t1p1, match.t1p2, match.t2p1, match.t2p2]
        for (const pid of playerIds) {
            if (!pid) continue;
            const player = await db.prepare('SELECT name, phone FROM participants WHERE id = ?').bind(pid).first() as any
            if (!player) continue

            // Check duplicate
            const existing = await db.prepare(
                'SELECT id FROM notification_logs WHERE match_id = ? AND participant_name = ? AND notification_type = ?'
            ).bind(matchId, player.name, type).first()
            if (existing) continue

            // Log
            await db.prepare(
                'INSERT INTO notification_logs (tournament_id, match_id, participant_name, notification_type) VALUES (?, ?, ?, ?)'
            ).bind(tid, matchId, player.name, type).run()

            // Send actual SMS if phone is available
            if (player.phone) {
                let msgText = '';
                if (type === 'match_starting') {
                    msgText = `[배드민턴 대회] ${player.name}선수님! 코트${match.court_number || '-'}에서 경기가 곧(방금) 시작되었습니다. 코트로 이동해주세요!`;
                } else if (type === 'match_upcoming') {
                    msgText = `[배드민턴 대회] ${player.name}선수님! 코트${match.court_number || '-'}의 다음 경기 출전 대기 부탁드립니다.`;
                }
                if (msgText) await sendSolapiSms(env, player.phone, msgText);
            }
        }
    } catch (e) {
        console.error('Notification error:', e)
    }
}

async function notifyNextMatch(env: any, tid: number, courtNumber: number) {
    const db = env.DB;
    try {
        const nextMatch = await db.prepare(
            'SELECT id FROM matches WHERE tournament_id = ? AND court_number = ? AND status = \'pending\' ORDER BY round, match_order LIMIT 1'
        ).bind(tid, courtNumber).first() as any
        if (nextMatch) {
            await sendMatchNotifications(env, tid, nextMatch.id, 'match_upcoming')
        }
    } catch (e) {
        console.error('Next match notification error:', e)
    }
}

// ── 개인 경기 기록 자동 저장 ──────────────────────────────────────────────────
async function saveMemberMatchRecords(
    db: D1Database,
    matchId: number,
    tid: number,
    scoreBody: any
) {
    try {
        // 경기 + 팀 + 참가자 + 회원 ID 한 번에 조회
        const match = await db.prepare(`
      SELECT m.id, m.round, m.court_number, m.winner_team,
             e.name AS event_name,
             t1.player1_id AS t1p1_pid, t1.player2_id AS t1p2_pid,
             t2.player1_id AS t2p1_pid, t2.player2_id AS t2p2_pid,
             p1a.member_id AS t1p1_mid, p1a.name AS t1p1_name,
             p1b.member_id AS t1p2_mid, p1b.name AS t1p2_name,
             p2a.member_id AS t2p1_mid, p2a.name AS t2p1_name,
             p2b.member_id AS t2p2_mid, p2b.name AS t2p2_name
      FROM matches m
      LEFT JOIN teams    t1  ON m.team1_id     = t1.id
      LEFT JOIN teams    t2  ON m.team2_id     = t2.id
      LEFT JOIN participants p1a ON t1.player1_id = p1a.id
      LEFT JOIN participants p1b ON t1.player2_id = p1b.id
      LEFT JOIN participants p2a ON t2.player1_id = p2a.id
      LEFT JOIN participants p2b ON t2.player2_id = p2b.id
      LEFT JOIN events   e   ON m.event_id     = e.id
      WHERE m.id = ?
    `).bind(matchId).first() as any
        if (!match) return

        const t1s1 = scoreBody.team1_set1 ?? 0
        const t1s2 = scoreBody.team1_set2 ?? 0
        const t1s3 = scoreBody.team1_set3 ?? 0
        const t2s1 = scoreBody.team2_set1 ?? 0
        const t2s2 = scoreBody.team2_set2 ?? 0
        const t2s3 = scoreBody.team2_set3 ?? 0
        const t1total = t1s1 + t1s2 + t1s3
        const t2total = t2s1 + t2s2 + t2s3
        const winner = scoreBody.winner_team // 1 or 2

        const t1Names = [match.t1p1_name, match.t1p2_name].filter(Boolean).join(' · ')
        const t2Names = [match.t2p1_name, match.t2p2_name].filter(Boolean).join(' · ')

        // 저장할 선수 목록 (팀별 구성)
        // team1 플레이어들
        const team1Players = [
            { memberId: match.t1p1_mid, partnerId: match.t1p2_mid },
            { memberId: match.t1p2_mid, partnerId: match.t1p1_mid },
        ]
        // team2 플레이어들
        const team2Players = [
            { memberId: match.t2p1_mid, partnerId: match.t2p2_mid },
            { memberId: match.t2p2_mid, partnerId: match.t2p1_mid },
        ]

        const insertRecord = async (
            memberId: number | null,
            partnerId: number | null,
            myS1: number, myS2: number, myS3: number,
            oppS1: number, oppS2: number, oppS3: number,
            myTotal: number, oppTotal: number,
            result: 'win' | 'loss',
            oppNames: string
        ) => {
            if (!memberId) return  // 회원 DB에 연결 안 된 참가자는 스킵
            await db.prepare(`
        INSERT OR IGNORE INTO member_match_records
          (member_id, partner_member_id, match_id, tournament_id, event_name,
           round, court_number,
           my_score, opp_score,
           my_set1, my_set2, my_set3,
           opp_set1, opp_set2, opp_set3,
           result, opp_names)
        VALUES (?,?,?,?,?, ?,?, ?,?, ?,?,?, ?,?,?, ?,?)
      `).bind(
                memberId, partnerId || null, matchId, tid, match.event_name || null,
                match.round || null, match.court_number || null,
                myTotal, oppTotal,
                myS1, myS2, myS3,
                oppS1, oppS2, oppS3,
                result, oppNames
            ).run()
        }

        const t1result: 'win' | 'loss' = winner == 1 ? 'win' : 'loss'
        const t2result: 'win' | 'loss' = winner == 2 ? 'win' : 'loss'

        for (const p of team1Players) {
            await insertRecord(
                p.memberId, p.partnerId,
                t1s1, t1s2, t1s3, t2s1, t2s2, t2s3,
                t1total, t2total, t1result, t2Names
            )
        }
        for (const p of team2Players) {
            await insertRecord(
                p.memberId, p.partnerId,
                t2s1, t2s2, t2s3, t1s1, t1s2, t1s3,
                t2total, t1total, t2result, t1Names
            )
        }

        // member_tournament_history 에도 승/패 누적
        const allPlayers = [...team1Players, ...team2Players]
        const results = [...team1Players.map(() => t1result), ...team2Players.map(() => t2result)]
        for (let i = 0; i < allPlayers.length; i++) {
            const mid2 = allPlayers[i].memberId
            if (!mid2) continue
            const isWin = results[i] === 'win' ? 1 : 0
            await db.prepare(`
        UPDATE member_tournament_history
        SET wins   = wins   + ?,
            losses = losses + ?
        WHERE member_id = ? AND tournament_id = ?
      `).bind(isWin, 1 - isWin, mid2, tid).run()
        }
    } catch (e) {
        console.error('saveMemberMatchRecords error:', e)
    }
}

export default app
