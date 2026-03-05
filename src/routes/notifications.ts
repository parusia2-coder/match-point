import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Get VAPID public key
app.get('/:tid/push/vapid-key', (c) => {
    // In production, this should come from environment variables
    return c.json({ publicKey: 'BDummyVAPIDPublicKeyForDevelopment' })
})

// Subscribe to push notifications
app.post('/:tid/push/subscribe', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { name, phone, subscription } = body

    if (!name || !subscription?.endpoint) {
        return c.json({ error: 'Name and subscription required' }, 400)
    }

    try {
        // Upsert: delete old then insert new
        await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(subscription.endpoint).run()
        await c.env.DB.prepare(
            'INSERT INTO push_subscriptions (tournament_id, participant_name, participant_phone, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(tid, name, phone || '', subscription.endpoint, subscription.keys?.p256dh || '', subscription.keys?.auth || '').run()
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// Unsubscribe
app.post('/:tid/push/unsubscribe', async (c) => {
    const tid = c.req.param('tid')
    const { endpoint } = await c.req.json()
    if (!endpoint) return c.json({ error: 'endpoint required' }, 400)
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND tournament_id = ?').bind(endpoint, tid).run()
    return c.json({ success: true })
})

// Check subscription status
app.get('/:tid/push/status', async (c) => {
    const tid = c.req.param('tid')
    const name = c.req.query('name')
    if (!name) return c.json({ subscribed: false })

    const sub = await c.env.DB.prepare(
        'SELECT id FROM push_subscriptions WHERE tournament_id = ? AND participant_name = ? LIMIT 1'
    ).bind(tid, name).first()
    return c.json({ subscribed: !!sub })
})

// Test notification
app.post('/:tid/push/test', async (c) => {
    const tid = c.req.param('tid')
    const { name } = await c.req.json()
    // In a real implementation, this would use Web Push API with VAPID
    // For now, just log it
    return c.json({ success: true, message: `Test notification would be sent to ${name}` })
})

export default app
