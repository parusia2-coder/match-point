import { Hono } from 'hono'

// In-memory WebSocket clients (works perfectly for local dev and single-region CF edge)
export const activeClients = new Map<string, Set<WebSocket>>()

const app = new Hono<{ Bindings: { DB: D1Database } }>()

app.get('/:tid/ws', async (c) => {
    const tid = c.req.param('tid')
    const upgradeHeader = c.req.header('Upgrade')

    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426)
    }

    // @ts-ignore - WebSocketPair is a global in Cloudflare Workers
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket]

    server.accept()

    if (!activeClients.has(tid)) {
        activeClients.set(tid, new Set())
    }
    const clients = activeClients.get(tid)!
    clients.add(server)

    server.addEventListener('close', () => {
        clients.delete(server)
        if (clients.size === 0) activeClients.delete(tid)
    })

    server.addEventListener('message', (event) => {
        // Keep-alive or debugging
        if (event.data === 'ping') server.send('pong')
    })

    // Send initial connection success
    server.send(JSON.stringify({ type: 'connected', message: 'Live updates streaming...' }))

    return new Response(null, {
        status: 101,
        // @ts-ignore
        webSocket: client,
    })
})

// Global helper to broadcast updates to a specific tournament
export const broadcastUpdate = (tid: string, payload: any) => {
    const clients = activeClients.get(tid?.toString())
    if (clients) {
        const message = JSON.stringify(payload)
        for (const client of clients) {
            try {
                client.send(message)
            } catch (e) {
                // Ignore broken pipes
            }
        }
    }
}

export default app
