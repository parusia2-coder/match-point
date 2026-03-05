import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// List participants
app.get('/:tid/participants', async (c) => {
    const tid = c.req.param('tid')
    const club = c.req.query('club')
    let query = 'SELECT * FROM participants WHERE tournament_id = ? AND deleted = 0'
    const binds: any[] = [tid]
    if (club) {
        query += ' AND club = ?'
        binds.push(club)
    }
    query += ' ORDER BY club, name'
    const stmt = c.env.DB.prepare(query)
    const { results } = await (binds.length === 1 ? stmt.bind(binds[0]) : stmt.bind(...binds)).all()
    return c.json(results)
})

// Create participant
app.post('/:tid/participants', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { name, phone, gender, birth_year, level, club, wants_mixed, partner } = body
    if (!name || !gender || !birth_year || !level) {
        return c.json({ error: 'Missing required fields' }, 400)
    }
    const result = await c.env.DB.prepare(
        'INSERT INTO participants (tournament_id, name, phone, gender, birth_year, level, club, wants_mixed, partner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(tid, name, phone || '', gender, birth_year, level, club || '', wants_mixed || 0, partner || '').run()
    return c.json({ id: result.meta.last_row_id, success: true }, 201)
})

// Bulk register participants
app.post('/:tid/participants/bulk', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { data, format: fmt } = body // data is text content

    const lines = data.trim().split('\n').filter((l: string) => l.trim())
    let inserted = 0
    const errors: string[] = []

    for (let i = 0; i < lines.length; i++) {
        try {
            const line = lines[i].trim()
            if (!line || line.startsWith('#') || line.startsWith('이름')) continue

            // Support: name, gender, birth_year, level, phone, club, wants_mixed, partner
            // Format: tab or comma separated
            const parts = line.includes('\t') ? line.split('\t') : line.split(',')
            const name = parts[0]?.trim()
            let gender = parts[1]?.trim()?.toLowerCase() || ''
            if (gender === '남') gender = 'm'
            if (gender === '여') gender = 'f'
            const birth_year = parseInt(parts[2]?.trim())
            const level = parts[3]?.trim()?.toLowerCase() || ''
            const phone = parts[4]?.trim() || ''
            const club = parts[5]?.trim() || ''
            const wants_mixed = parts[6]?.trim() === '1' ? 1 : 0
            const partner = parts[7]?.trim() || ''

            if (!name || !['m', 'f'].includes(gender) || isNaN(birth_year) || !level) {
                errors.push(`Line ${i + 1}: Invalid data - ${line}`)
                continue
            }

            await c.env.DB.prepare(
                'INSERT INTO participants (tournament_id, name, phone, gender, birth_year, level, club, wants_mixed, partner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(tid, name, phone, gender, birth_year, level, club, wants_mixed, partner).run()
            inserted++
        } catch (e) {
            errors.push(`Line ${i + 1}: ${(e as Error).message}`)
        }
    }

    return c.json({ inserted, errors, total: lines.length })
})

// Update participant
app.put('/:tid/participants/:pid', async (c) => {
    const tid = c.req.param('tid')
    const pid = c.req.param('pid')
    const body = await c.req.json()
    const { name, phone, gender, birth_year, level, club, wants_mixed, partner } = body
    await c.env.DB.prepare(
        'UPDATE participants SET name = ?, phone = ?, gender = ?, birth_year = ?, level = ?, club = ?, wants_mixed = ?, partner = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
    ).bind(name, phone || '', gender, birth_year, level, club || '', wants_mixed || 0, partner || '', pid, tid).run()
    return c.json({ success: true })
})

// Delete participant (Cascading delete for related teams/matches)
app.delete('/:tid/participants/:pid', async (c) => {
    const pid = c.req.param('pid')
    const tid = c.req.param('tid')

    // Find teams this participant belongs to
    const { results: relatedTeams } = await c.env.DB.prepare(
        'SELECT id FROM teams WHERE tournament_id = ? AND (player1_id = ? OR player2_id = ?)'
    ).bind(tid, pid, pid).all() as any

    for (const team of relatedTeams) {
        // Cascade delete related matches and standings for the team
        await c.env.DB.prepare('DELETE FROM standings WHERE team_id = ?').bind(team.id).run()
        await c.env.DB.prepare('DELETE FROM matches WHERE team1_id = ? OR team2_id = ?').bind(team.id, team.id).run()
        await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(team.id).run()
    }

    // Soft delete the participant
    await c.env.DB.prepare('UPDATE participants SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?').bind(pid, tid).run()

    return c.json({ success: true, cascades: relatedTeams.length })
})

// Delete all participants (Cascading delete for ALL assignments)
app.delete('/:tid/participants', async (c) => {
    const tid = c.req.param('tid')

    // Cleanup all assignments first to prevent rendering errors
    await c.env.DB.prepare('DELETE FROM standings WHERE event_id IN (SELECT id FROM events WHERE tournament_id = ?)').bind(tid).run()
    await c.env.DB.prepare('DELETE FROM matches WHERE tournament_id = ?').bind(tid).run()
    await c.env.DB.prepare('DELETE FROM teams WHERE tournament_id = ?').bind(tid).run()

    // Soft delete all participants
    await c.env.DB.prepare('UPDATE participants SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE tournament_id = ?').bind(tid).run()

    return c.json({ success: true })
})

// Toggle paid
app.patch('/:tid/participants/:pid/paid', async (c) => {
    const pid = c.req.param('pid')
    const tid = c.req.param('tid')
    await c.env.DB.prepare(
        'UPDATE participants SET paid = CASE WHEN paid = 0 THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
    ).bind(pid, tid).run()
    const row = await c.env.DB.prepare('SELECT paid FROM participants WHERE id = ?').bind(pid).first() as any
    return c.json({ success: true, paid: row.paid })
})

// Toggle checkin
app.patch('/:tid/participants/:pid/checkin', async (c) => {
    const pid = c.req.param('pid')
    const tid = c.req.param('tid')
    await c.env.DB.prepare(
        'UPDATE participants SET checked_in = CASE WHEN checked_in = 0 THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tournament_id = ?'
    ).bind(pid, tid).run()
    const row = await c.env.DB.prepare('SELECT checked_in FROM participants WHERE id = ?').bind(pid).first() as any
    return c.json({ success: true, checked_in: row.checked_in })
})

export default app
