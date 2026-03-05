import { Hono } from 'hono'
import { broadcastUpdate } from './live'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Get lightweight court status
app.get('/:tid/court/:courtId', async (c) => {
    const tid = c.req.param('tid')
    const courtNum = c.req.param('courtId')

    const current = await c.env.DB.prepare(
        `SELECT m.id, m.status, m.team1_set1, m.team2_set1, m.team1_set2, m.team2_set2, m.team1_set3, m.team2_set3,
       t1.team_name as t1_name, t2.team_name as t2_name,
       t1p1.name as t1p1_name, t1p2.name as t1p2_name,
       t2p1.name as t2p1_name, t2p2.name as t2p2_name,
       trn.sport_type
     FROM matches m
     LEFT JOIN teams t1 ON m.team1_id = t1.id LEFT JOIN teams t2 ON m.team2_id = t2.id
     LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
     LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
     LEFT JOIN tournaments trn ON m.tournament_id = trn.id
     WHERE m.tournament_id = ? AND m.court_number = ? AND m.status = 'playing'
     LIMIT 1`
    ).bind(tid, courtNum).first() as any

    if (!current) return c.json({ error: 'No active match on this court' }, 404)

    // For simplicity watch uses a flattened "current_set" mapping.
    // Determine current set based on scores, here we assume it's basically the sum or fallback to set1 for now.
    // In a real app we'd track the exact current set. We'll use set1 for watch prototyping.
    const t1Name = current.t1_name || (current.t1p1_name + (current.t1p2_name ? '/' + current.t1p2_name : ''))
    const t2Name = current.t2_name || (current.t2p1_name + (current.t2p2_name ? '/' + current.t2p2_name : ''))

    return c.json({
        match_id: current.id,
        status: current.status,
        current_set: 1, // Simplified
        sport_type: current.sport_type,
        t1: { name: t1Name, score: current.team1_set1 || 0 },
        t2: { name: t2Name, score: current.team2_set1 || 0 }
    })
})

// Update score via watch (+1 / -1)
app.post('/:tid/match/:matchId/score', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('matchId')
    const { team, action } = await c.req.json()

    if (team !== 1 && team !== 2) return c.json({ error: 'Invalid team' }, 400)
    if (action !== '+1' && action !== '-1') return c.json({ error: 'Invalid action' }, 400)

    const match = await c.env.DB.prepare('SELECT team1_set1, team2_set1 FROM matches WHERE id = ? AND tournament_id = ?').bind(mid, tid).first() as any
    if (!match) return c.json({ error: 'Match not found' }, 404)

    const isT1 = team === 1
    const currentScore = isT1 ? (match.team1_set1 || 0) : (match.team2_set1 || 0)

    let newScore = currentScore
    if (action === '+1') newScore++
    if (action === '-1') newScore = Math.max(0, newScore - 1)

    const updateCol = isT1 ? 'team1_set1' : 'team2_set1'

    await c.env.DB.prepare(`UPDATE matches SET ${updateCol} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(newScore, mid).run()

    // Broadcast live update
    broadcastUpdate(tid, { type: 'update', message: 'Score updated via Watch', match_id: mid })

    return c.json({ success: true, new_score: newScore })
})

// Update status via watch (e.g., complete match)
app.post('/:tid/match/:matchId/status', async (c) => {
    const tid = c.req.param('tid')
    const mid = c.req.param('matchId')
    const { status, winner } = await c.req.json()

    await c.env.DB.prepare('UPDATE matches SET status = ?, winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?')
        .bind(status, winner || null, mid, tid).run()

    broadcastUpdate(tid, { type: 'update', message: 'Match status updated via Watch', match_id: mid })

    return c.json({ success: true })
})

export default app
