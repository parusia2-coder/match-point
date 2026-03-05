// src/middleware/auth.ts
// 관리자 JWT 인증 미들웨어
// ─────────────────────────────────────────────────────────────
import { Context, Next } from 'hono'
import { verifyJWT } from '../lib/jwt'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type AuthUser = { id: number; username: string; global_role: string; org_roles: Record<string, string>; club_roles: Record<string, string> }
type Variables = { adminUser: AuthUser }

// ── 인증 필수 미들웨어 ─────────────────────────────────────
export async function requireAuth(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
) {
    const secret = c.env.JWT_SECRET || 'dev-secret'

    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: '인증이 필요합니다. 로그인 후 이용하세요.', code: 'UNAUTHORIZED' }, 401)
    }

    try {
        const token = authHeader.slice(7)
        const payload = await verifyJWT(token, secret) as any
        c.set('adminUser', {
            id: payload.sub,
            username: payload.username,
            global_role: payload.global_role || 'user',
            org_roles: payload.org_roles || {},
            club_roles: payload.club_roles || {}
        })
        return await next()
    } catch (e: any) {
        return c.json({ error: '토큰이 만료되었거나 유효하지 않습니다.', code: 'TOKEN_INVALID' }, 401)
    }
}

// ── 선택적 인증 (있으면 파싱, 없어도 통과) ─────────────────
export async function optionalAuth(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
) {
    const secret = c.env.JWT_SECRET || 'dev-secret'
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const payload = await verifyJWT(authHeader.slice(7), secret) as any
            c.set('adminUser', {
                id: payload.sub,
                username: payload.username,
                global_role: payload.global_role || 'user',
                org_roles: payload.org_roles || {},
                club_roles: payload.club_roles || {}
            })
        } catch { }
    }
    return await next()
}
