import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'

type Bindings = { DB: D1Database; JWT_SECRET: string }
const clubs = new Hono<{ Bindings: Bindings }>()

// 모든 단체/클럽 목록 조회 (공개용, 또는 최소 정보만 반환)
clubs.get('/', async (c) => {
    try {
        const { results } = await c.env.DB.prepare(`
            SELECT id, name, org_id
            FROM clubs 
            ORDER BY created_at DESC
        `).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 내 클럽 목록 조회 (관리자용)
clubs.get('/my', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')

        // 슈퍼관리자면 모든 클럽 반환
        if (user.global_role === 'super_admin') {
            const { results } = await c.env.DB.prepare(`
                SELECT * FROM clubs ORDER BY created_at DESC
            `).all()
            return c.json(results || [])
        }

        // 본인이 admin인 클럽만 반환
        const clubIds = Object.keys(user.club_roles || {}).map(id => parseInt(id, 10)).filter(id => !isNaN(id))
        if (clubIds.length === 0) return c.json([])

        const placeholders = clubIds.map(() => '?').join(',')
        const { results } = await c.env.DB.prepare(`
            SELECT * FROM clubs 
            WHERE id IN (${placeholders})
            ORDER BY created_at DESC
        `).bind(...clubIds).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체/클럽 신규 개설 (System Admin 또는 관련 Org Admin 전용)
clubs.post('/', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const b = await c.req.json()

        const { name, org_id } = b
        if (!name) return c.json({ error: 'Name is required' }, 400)

        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = org_id && user.org_roles && user.org_roles[org_id] === 'admin'

        // 슈퍼관리자 또는 소속될 협회의 관리자만 클럽(동호회) 생성 가능
        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '시스템 관리자 또는 소속 협회 관리자만 클럽을 생성할 수 있습니다.' }, 403)
        }

        const { success, meta } = await c.env.DB.prepare(`
            INSERT INTO clubs (name, org_id)
            VALUES (?, ?)
        `).bind(name, org_id || null).run()

        if (success) {
            const clubId = meta.last_row_id
            // Role table에 생성자를 club admin으로 등록
            await c.env.DB.prepare(`
              INSERT INTO user_roles (user_id, target_type, target_id, role)
              VALUES (?, 'club', ?, 'admin')
            `).bind(user.id, clubId).run()

            const newClub = await c.env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first()
            return c.json(newClub)
        }
        return c.json({ error: 'Create failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 내 클럽 수정
clubs.put('/:id', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const clubId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const check = await c.env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first() as any
        if (!check) return c.json({ error: 'Not found' }, 404)

        const isSuperAdmin = user.global_role === 'super_admin'
        const isClubAdmin = user.club_roles && user.club_roles[clubId] === 'admin'
        const isOrgAdmin = check.org_id && user.org_roles && user.org_roles[check.org_id] === 'admin'

        if (!isSuperAdmin && !isClubAdmin && !isOrgAdmin) {
            return c.json({ error: '수정 권한이 없습니다.' }, 403)
        }

        await c.env.DB.prepare(`
            UPDATE clubs 
            SET name = ?, org_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(b.name || check.name, b.org_id !== undefined ? b.org_id : check.org_id, clubId).run()

        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

export default clubs
