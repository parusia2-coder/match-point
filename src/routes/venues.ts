import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Get all venues for a tournament
app.get('/:tid/venues', async (c) => {
    const tid = c.req.param('tid')
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM venues WHERE tournament_id = ? ORDER BY id ASC'
    ).bind(tid).all()
    return c.json(results)
})

// Create a venue
app.post('/:tid/venues', async (c) => {
    const tid = c.req.param('tid')
    const { name, courts_count, stream_name } = await c.req.json()

    if (!name || courts_count < 1) {
        return c.json({ error: 'Invalid input' }, 400)
    }

    const { meta } = await c.env.DB.prepare(
        'INSERT INTO venues (tournament_id, name, courts_count, stream_name) VALUES (?, ?, ?, ?)'
    ).bind(tid, name, courts_count, stream_name || null).run()

    return c.json({ success: true, id: meta.last_row_id })
})

// Update a venue
app.put('/:tid/venues/:vid', async (c) => {
    const tid = c.req.param('tid')
    const vid = c.req.param('vid')
    const { name, courts_count, stream_name } = await c.req.json()

    if (!name || courts_count < 1) {
        return c.json({ error: 'Invalid input' }, 400)
    }

    await c.env.DB.prepare(
        'UPDATE venues SET name = ?, courts_count = ?, stream_name = ? WHERE id = ? AND tournament_id = ?'
    ).bind(name, courts_count, stream_name || null, vid, tid).run()

    return c.json({ success: true })
})

// Delete a venue
app.delete('/:tid/venues/:vid', async (c) => {
    const tid = c.req.param('tid')
    const vid = c.req.param('vid')

    await c.env.DB.prepare(
        'DELETE FROM venues WHERE id = ? AND tournament_id = ?'
    ).bind(vid, tid).run()

    // Also remove venue assignment from events
    await c.env.DB.prepare(
        'UPDATE events SET venue_id = NULL WHERE venue_id = ? AND tournament_id = ?'
    ).bind(vid, tid).run()

    // And from matches
    await c.env.DB.prepare(
        'UPDATE matches SET venue_id = NULL WHERE venue_id = ? AND tournament_id = ?'
    ).bind(vid, tid).run()

    return c.json({ success: true })
})

export default app
