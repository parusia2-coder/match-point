// src/routes/auth.ts
// 관리자/사용자 통합 인증 API
// ─────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { signJWT, verifyJWT, hashPassword, verifyPassword } from '../lib/jwt'
import { requireAuth } from '../middleware/auth'

type Bindings = { DB: D1Database; JWT_SECRET: string }
const auth = new Hono<{ Bindings: Bindings }>()

const ACCESS_TTL = 60 * 60 * 8      // 8시간
const REFRESH_TTL = 60 * 60 * 24 * 30 // 30일

// ── 회원가입 ───────────────────────────────────────────────
auth.post('/register', async (c) => {
    const { username, password, email, name, phone } = await c.req.json()

    if (!username || !password) return c.json({ error: 'username과 password는 필수입니다.' }, 400)
    if (username.length < 3) return c.json({ error: 'username은 3자 이상이어야 합니다.' }, 400)
    if (password.length < 6) return c.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)

    // 중복 확인
    const existing = await c.env.DB.prepare(
        'SELECT id FROM users WHERE username = ?'
    ).bind(username).first()
    if (existing) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409)

    // 비밀번호 해시
    const { hash, salt } = await hashPassword(password)

    const result = await c.env.DB.prepare(`
    INSERT INTO users (username, email, password_hash, password_salt, name, phone, global_role)
    VALUES (?, ?, ?, ?, ?, ?, 'user')
  `).bind(username, email || null, hash, salt, name || null, phone || null).run()

    if (!result.success) return c.json({ error: '계정 생성 실패' }, 500)

    const userId = result.meta.last_row_id
    const secret = c.env.JWT_SECRET || 'dev-secret'

    const payload = {
        sub: userId, username, global_role: 'user', org_roles: {}, club_roles: {}
    }
    const token = await signJWT(payload, secret, ACCESS_TTL)

    return c.json({
        success: true,
        token,
        user: payload
    }, 201)
})

// ── 로그인 ────────────────────────────────────────────────
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: 'username과 password는 필수입니다.' }, 400)

    const account = await c.env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
    ).bind(username).first() as any
    if (!account) return c.json({ error: '아이디 또는 비밀번호가 틀렸습니다.' }, 401)

    const ok = await verifyPassword(password, account.password_hash, account.password_salt)
    if (!ok) return c.json({ error: '아이디 또는 비밀번호가 틀렸습니다.' }, 401)

    // 역할 정보 조회
    const { results: roles } = await c.env.DB.prepare(
        'SELECT target_type, target_id, role FROM user_roles WHERE user_id = ?'
    ).bind(account.id).all()

    const org_roles: Record<number, string> = {}
    const club_roles: Record<number, string> = {}
    roles.forEach((r: any) => {
        if (r.target_type === 'org') org_roles[r.target_id] = r.role
        if (r.target_type === 'club') club_roles[r.target_id] = r.role
    })

    const payload = {
        sub: account.id,
        username: account.username,
        global_role: account.global_role,
        org_roles,
        club_roles
    }

    const secret = c.env.JWT_SECRET || 'dev-secret'
    const token = await signJWT(payload, secret, ACCESS_TTL)

    return c.json({
        success: true,
        token,
        user: payload
    })
})

// ── 내 정보 조회 (토큰 필요) ──────────────────────────────
auth.get('/me', async (c) => {
    const secret = c.env.JWT_SECRET || 'dev-secret'
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return c.json({ error: '로그인이 필요합니다.' }, 401)

    try {
        const payloadDecoded = await verifyJWT(authHeader.slice(7), secret) as any
        const account = await c.env.DB.prepare(
            'SELECT id, username, email, name, global_role, created_at FROM users WHERE id = ?'
        ).bind(payloadDecoded.sub).first() as any
        if (!account) return c.json({ error: '계정을 찾을 수 없습니다.' }, 404)

        // 내 대회 목록
        const { results: myTournaments } = await c.env.DB.prepare(`
            SELECT t.id, t.name, t.status, t.created_at as date 
            FROM tournaments t
            JOIN user_roles ur ON ur.target_id = t.id AND ur.target_type = 'tournament'
            WHERE ur.user_id = ? 
            ORDER BY t.created_at DESC LIMIT 5
        `).bind(account.id).all()

        return c.json({ ...account, tournaments: myTournaments })
    } catch {
        return c.json({ error: '토큰이 유효하지 않습니다.' }, 401)
    }
})

// ── 비밀번호 변경 ─────────────────────────────────────────
auth.put('/password', async (c) => {
    const secret = c.env.JWT_SECRET || 'dev-secret'
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return c.json({ error: '로그인이 필요합니다.' }, 401)

    const payload = await verifyJWT(authHeader.slice(7), secret).catch(() => null) as any
    if (!payload) return c.json({ error: '토큰이 유효하지 않습니다.' }, 401)

    const { current_password, new_password } = await c.req.json()
    if (!current_password || !new_password) return c.json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요.' }, 400)
    if (new_password.length < 6) return c.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, 400)

    const account = await c.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
    ).bind(payload.sub).first() as any
    if (!account) return c.json({ error: '계정을 찾을 수 없습니다.' }, 404)

    const ok = await verifyPassword(current_password, account.password_hash, account.password_salt)
    if (!ok) return c.json({ error: '현재 비밀번호가 틀렸습니다.' }, 401)

    const { hash, salt } = await hashPassword(new_password)
    await c.env.DB.prepare(
        'UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(hash, salt, account.id).run()

    return c.json({ success: true, message: '비밀번호가 변경되었습니다.' })
})

export default auth
