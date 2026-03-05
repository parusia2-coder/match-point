// src/lib/jwt.ts
// Cloudflare Workers Web Crypto API 기반 JWT (HMAC-SHA256)
// ─────────────────────────────────────────────────────────────

const ALG = { name: 'HMAC', hash: 'SHA-256' }

// Base64url 인코딩/디코딩
function b64url(buf: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
function b64urlDecode(s: string) {
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

async function getKey(secret: string, usage: KeyUsage[]) {
    return crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), ALG, false, usage
    )
}

// JWT 발급
export async function signJWT(payload: Record<string, unknown>, secret: string, expiresInSec = 86400) {
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer)
    const body = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSec, iat: Math.floor(Date.now() / 1000) })).buffer as ArrayBuffer)
    const key = await getKey(secret, ['sign'])
    const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(`${header}.${body}`))
    return `${header}.${body}.${b64url(sig)}`
}

// JWT 검증
export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown>> {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid token')
    const key = await getKey(secret, ['verify'])
    const ok = await crypto.subtle.verify(
        ALG, key,
        b64urlDecode(parts[2]).buffer as ArrayBuffer,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    )
    if (!ok) throw new Error('Invalid signature')
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])))
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
    return payload
}

// 비밀번호 해시 (PBKDF2)
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    const useSalt = salt ?? Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: new TextEncoder().encode(useSalt), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    )
    const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
    return { hash, salt: useSalt }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    const result = await hashPassword(password, salt)
    return result.hash === hash
}
