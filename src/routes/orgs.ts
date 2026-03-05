import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { hashPassword } from '../lib/jwt'

type Bindings = {
    DB: D1Database;
    JWT_SECRET: string;
    SOLAPI_API_KEY: string;
    SOLAPI_API_SECRET: string;
    SOLAPI_SENDER: string;
}
const orgs = new Hono<{ Bindings: Bindings }>()

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
    if (!env || !env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET || !env.SOLAPI_SENDER) return false;
    const cleanPhone = toPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) return false;
    try {
        const authHeader = await getSolapiAuth(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET);
        const res = await fetch('https://api.solapi.com/messages/v4/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ message: { to: cleanPhone, from: env.SOLAPI_SENDER, text } })
        });
        return res.ok;
    } catch (e) {
        console.error('Solapi SMS error:', e);
        return false;
    }
}
// --------------------------------------------------------------------------

// 모든 단체(조직) 목록 조회 (공개용, 또는 최소 정보만 반환)
orgs.get('/', async (c) => {
    try {
        const { results } = await c.env.DB.prepare(`
      SELECT id, slug, name, sport_type, logo_url, theme_color, status 
      FROM organizations 
      WHERE status = 'active'
      ORDER BY created_at DESC
    `).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 내 단체 목록 조회 (관리자용)
orgs.get('/my', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const userId = user.id
        const isSuperAdmin = user.global_role === 'super_admin'

        let query = ''
        let bindings: any[] = []

        if (isSuperAdmin) {
            query = `SELECT * FROM organizations WHERE status != 'deleted' ORDER BY created_at DESC`
        } else {
            query = `
              SELECT o.* FROM organizations o
              JOIN user_roles r ON o.id = r.target_id
              WHERE r.user_id = ? AND r.target_type = 'org' AND r.role = 'admin' AND o.status != 'deleted'
              ORDER BY o.created_at DESC
            `
            bindings = [userId]
        }

        let stmt = c.env.DB.prepare(query)
        if (bindings.length > 0) stmt = stmt.bind(...bindings)

        const { results } = await stmt.all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체 조회 by Slug (프론트엔드 맞춤형 렌더링용)
orgs.get('/slug/:slug', async (c) => {
    try {
        const slug = c.req.param('slug')
        const org = await c.env.DB.prepare(`
      SELECT * FROM organizations WHERE slug = ? AND status = 'active'
    `).bind(slug).first()

        if (!org) return c.json({ error: 'Not found' }, 404)

        // Parse JSON config if possible
        try {
            if (org.site_layout) org.site_layout = JSON.parse(org.site_layout as string);
            if (org.custom_rules) org.custom_rules = JSON.parse(org.custom_rules as string);
        } catch (e) { }

        // 가져온 조직에 소속된 대회 리스트도 같이 보내줌 (portal 용)
        const { results: tournaments } = await c.env.DB.prepare(`
      SELECT id, name, sport_type, status, format, games_per_player, courts, description, updated_at
      FROM tournaments 
      WHERE org_id = ? AND deleted = 0
      ORDER BY created_at DESC
    `).bind(org.id).all()

        return c.json({ org, tournaments })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체(협회) 신규 개설 (System Admin 전용)
orgs.post('/', requireAuth, async (c) => {
    let user: any = null;
    try {
        user = c.get('adminUser')
        if (user.global_role !== 'super_admin') {
            return c.json({ error: '시스템 관리자만 협회를 생성할 수 있습니다.' }, 403)
        }

        const b = await c.req.json()

        const { slug, name, sport_type = 'badminton', theme_color = '#f97316', plan_tier = 'standard' } = b
        if (!slug || !name) return c.json({ error: 'Slug and Name are required' }, 400)

        // slug 중복체크
        const ext = await c.env.DB.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first()
        if (ext) return c.json({ error: '이미 사용중인 고유 URL(Slug)입니다.' }, 400)

        const defaultLayout = JSON.stringify({
            hero: { title: `${name} 공식 홈페이지`, subtitle: '환영합니다.' },
            sections: ['tournaments', 'ranking', 'notices']
        })

        const { success, meta } = await c.env.DB.prepare(`
      INSERT INTO organizations (owner_id, slug, name, sport_type, theme_color, plan_tier, site_layout)
      VALUES (NULL, ?, ?, ?, ?, ?, ?)
    `).bind(slug, name, sport_type, theme_color, plan_tier, defaultLayout).run()

        if (success) {
            const orgId = meta.last_row_id

            // 1. 단체 전용 관리자 계정 생성 (기억하기 쉽도록 임시 발급)
            // username은 org slug + 4자리 숫자, 비밀번호는 '123456' 통일
            const generatedPassword = '123456'
            const randomCode = Math.floor(Math.random() * 9000) + 1000 // 1000~9999
            const adminUsername = `${slug}${randomCode}`
            const { hash, salt } = await hashPassword(generatedPassword)

            let adminMsg = "임시로 발급된 계정 정보입니다. 로그인 후 우측 상단 프로필 메뉴에서 비밀번호를 반드시 변경해주세요."
            let newUserId = null

            try {
                const userInsert = await c.env.DB.prepare(`
                    INSERT INTO users (username, password_hash, password_salt, name, global_role)
                    VALUES (?, ?, ?, ?, 'user')
                `).bind(adminUsername, hash, salt, `${name} 관리자`).run()

                newUserId = userInsert.meta.last_row_id

                // 새 전용 관리자에게 권한 부여
                await c.env.DB.prepare(`
                  INSERT INTO user_roles (user_id, target_type, target_id, role)
                  VALUES (?, 'org', ?, 'admin')
                `).bind(newUserId, orgId).run()

                // 최고관리자가 나중에 비번을 리셋하거나 알려줄 수 있도록 원문 저장 (보안상 취약할 수 있으나 유저 요청 적용)
                await c.env.DB.prepare(`
                  INSERT INTO org_admin_credentials (org_id, username, current_password)
                  VALUES (?, ?, ?)
                `).bind(orgId, adminUsername, generatedPassword).run()
            } catch (e) {
                adminMsg = "계정 자동 생성 중 충돌이 발생했습니다. 최고 관리자에게 문의하세요."
            }

            // 2. 단체 개설자(현재 로그인된 관리자) 본인에게도 접근 권한을 명시적으로 추가
            try {
                await c.env.DB.prepare(`
                  INSERT INTO user_roles (user_id, target_type, target_id, role)
                  VALUES (?, 'org', ?, 'admin')
                `).bind(user.id, orgId).run()
            } catch (e) { /* ignore duplicate */ }

            // 3. 최근에 추가된 기능들을 위한 기본 셋팅 (게시판, 재고 관리 등)
            try {
                // 기본 게시판 3개 자동 생성
                await c.env.DB.prepare(`INSERT INTO org_boards (org_id, name, description, is_public) VALUES (?, ?, ?, ?)`).bind(orgId, '공지사항', '협회 및 단체의 주요 공지사항을 안내합니다.', 1).run()
                await c.env.DB.prepare(`INSERT INTO org_boards (org_id, name, description, is_public) VALUES (?, ?, ?, ?)`).bind(orgId, '자유게시판', '회원 간 자유롭게 소통하는 공간입니다.', 1).run()
                await c.env.DB.prepare(`INSERT INTO org_boards (org_id, name, description, is_public) VALUES (?, ?, ?, ?)`).bind(orgId, '대회 갤러리', '대회 및 행사 사진을 공유합니다.', 1).run()

                // 기본 물품 재고 리스트 자동 생성
                await c.env.DB.prepare(`INSERT INTO org_inventory_items (org_id, name, category, quantity, unit, description) VALUES (?, ?, ?, ?, ?, ?)`).bind(orgId, '대회 공인구', '용품', 0, '박스', '대회 사용을 위한 셔틀콕/테니스공').run()
                await c.env.DB.prepare(`INSERT INTO org_inventory_items (org_id, name, category, quantity, unit, description) VALUES (?, ?, ?, ?, ?, ?)`).bind(orgId, '구급 상자', '의료기기', 1, '개', '응급 처치용 구급 상자').run()
                await c.env.DB.prepare(`INSERT INTO org_inventory_items (org_id, name, category, quantity, unit, description) VALUES (?, ?, ?, ?, ?, ?)`).bind(orgId, '대회 현수막', '기타', 0, '장', '대회용 현수막 (재사용 가능)').run()
            } catch (e) {
                console.error("기본 셋팅 생성 오류:", e)
            }

            const newOrg = await c.env.DB.prepare('SELECT * FROM organizations WHERE slug = ?').bind(slug).first()

            return c.json({
                ...newOrg,
                adminSetup: {
                    username: adminUsername,
                    password: generatedPassword,
                    message: adminMsg
                }
            })
        }
        return c.json({ error: 'Create failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message, debug_user: user }, 500)
    }
})

// 단체 정보 수정 (System Admin 또는 해당 Org Admin)
orgs.put('/:id', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        // 소유자 체크
        const check = await c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first() as any
        if (!check) return c.json({ error: 'Not found' }, 404)

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '수정 권한이 없습니다.' }, 403)
        }

        const newSiteLayout = b.site_layout ? JSON.stringify(b.site_layout) : check.site_layout

        await c.env.DB.prepare(`
      UPDATE organizations 
      SET name = ?, theme_color = ?, contact_email = ?, contact_phone = ?, bank_account = ?, site_layout = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
            b.name || check.name,
            b.theme_color || check.theme_color,
            b.contact_email !== undefined ? b.contact_email : check.contact_email,
            b.contact_phone !== undefined ? b.contact_phone : check.contact_phone,
            b.bank_account !== undefined ? b.bank_account : check.bank_account,
            newSiteLayout,
            orgId
        ).run()

        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체 전용 관리자 로그인 정보 조회 (Super Admin 전용)
orgs.get('/:id/credentials', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        if (user.global_role !== 'super_admin') return c.json({ error: '최고 관리자만 접근 가능합니다.' }, 403)

        const orgId = parseInt(c.req.param('id'), 10)
        const creds = await c.env.DB.prepare('SELECT username, current_password FROM org_admin_credentials WHERE org_id = ?').bind(orgId).first()

        if (!creds) return c.json({ error: '발급된 계정 정보가 없습니다.' }, 404)
        return c.json(creds)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체 전용 관리자 비밀번호 초기화 (Super Admin 전용)
orgs.post('/:id/reset-password', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        if (user.global_role !== 'super_admin') return c.json({ error: '최고 관리자만 접근 가능합니다.' }, 403)

        const orgId = parseInt(c.req.param('id'), 10)

        const creds = await c.env.DB.prepare('SELECT username FROM org_admin_credentials WHERE org_id = ?').bind(orgId).first() as any
        if (!creds) return c.json({ error: '발급된 계정 정보가 없습니다.' }, 404)

        const generatedPassword = Math.random().toString(36).slice(-6)
        const { hash, salt } = await hashPassword(generatedPassword)

        // 유저 정보 업데이트
        await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?').bind(hash, salt, creds.username).run()

        // 원문 정보 업데이트
        await c.env.DB.prepare('UPDATE org_admin_credentials SET current_password = ?, updated_at = CURRENT_TIMESTAMP WHERE org_id = ?').bind(generatedPassword, orgId).run()

        return c.json({ success: true, username: creds.username, password: generatedPassword })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 단체 폭파 (삭제) (Super Admin 전용 또는 최고 책임자 전용)
orgs.delete('/:id', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        // 권한 체크: 시스템 관리자이거나 조직의 admin
        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '단체 삭제 권한이 없습니다.' }, 403)
        }

        // 관련 데이터 삭제부터 해야 무결성 오류가 안납니다.
        // 하지만 sqlite의 foreign key 제약조건에 따라 CASCADE가 설정되어 있을 수 있지만, 일단 명시적으로 지우거나 상태만 바꿉니다.
        // 현재는 status를 'deleted'로 업데이트하도록 할까요, 아니면 정말 DROP 할까요?
        // tournaments 쪽을 보면 deleted = 1 이나 deleted 상태를 쓰기도 하지만, 
        // organizations 테이블에 status 컬럼이 있으니 status = 'deleted' 가 안전합니다.

        await c.env.DB.prepare(`
            UPDATE organizations 
            SET slug = slug || '-deleted-' || id, status = 'deleted', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(orgId).run()

        // 관련된 user_roles 에 설정된 admin 권한도 회수해 주는 것이 좋습니다.
        await c.env.DB.prepare(`
            DELETE FROM user_roles WHERE target_type = 'org' AND target_id = ?
        `).bind(orgId).run()

        return c.json({ success: true, message: '단체가 성공적으로 삭제 처리되었습니다.' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 소속 회원 관리 (Org Members) ───────────────────────────────────

// 1. 단체 회원 목록 조회 (Org Admin/Super Admin 전용)
orgs.get('/:id/members', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        const clubRoles = Object.keys(user.club_roles || {}).map(Number)
        let isClubAdmin = false
        let clubAdminNames: string[] = []

        if (clubRoles.length > 0) {
            const placeholders = clubRoles.map(() => '?').join(',')
            const orgClubs = await c.env.DB.prepare(`SELECT name FROM clubs WHERE id IN (${placeholders}) AND org_id = ?`).bind(...clubRoles, orgId).all()
            if (orgClubs.results.length > 0) {
                isClubAdmin = true
                clubAdminNames = orgClubs.results.map((r: any) => r.name)
            }
        }

        if (!isSuperAdmin && !isOrgAdmin && !isClubAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        let query = `
            SELECT om.*, m.name, m.phone, m.gender, m.birth_year, m.birth_date, m.level as global_level
            FROM org_members om
            JOIN members m ON om.member_id = m.id
            WHERE om.org_id = ?
        `
        let bindings: any[] = [orgId]

        if (isClubAdmin && !isSuperAdmin && !isOrgAdmin) {
            const pl = clubAdminNames.map(() => '?').join(',')
            query += ` AND om.affiliated_club IN (${pl}) `
            bindings.push(...clubAdminNames)
        }
        query += ` ORDER BY om.joined_at DESC `

        const { results } = await c.env.DB.prepare(query).bind(...bindings).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 단체에 회원 추가 (Org Admin/Super Admin 전용)
orgs.post('/:id/members', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const { member_id, role = 'member', affiliated_club, official_level, position, clothing_size, status = 'active' } = b
        if (!member_id) return c.json({ error: 'member_id is required' }, 400)

        // 중복 체크
        const ext = await c.env.DB.prepare('SELECT id FROM org_members WHERE org_id = ? AND member_id = ?').bind(orgId, member_id).first()
        if (ext) return c.json({ error: '이미 등록된 회원입니다.' }, 400)

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_members (org_id, member_id, role, affiliated_club, official_level, position, clothing_size, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(orgId, member_id, role, affiliated_club || null, official_level || null, position || null, clothing_size || null, status).run()

        if (success) return c.json({ message: '회원 등록 성공' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3. 단체 회원 정보 수정 (상태, 급수, 클럽 변경 등)
orgs.put('/:id/members/:omId', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const omId = parseInt(c.req.param('omId'), 10)
        const b = await c.req.json()

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const target = await c.env.DB.prepare('SELECT * FROM org_members WHERE id = ? AND org_id = ?').bind(omId, orgId).first() as any
        if (!target) return c.json({ error: '회원 맵핑 정보를 찾을 수 없습니다.' }, 404)

        // 이름/전화번호/성별/생년 등 중앙DB 필드 업데이트
        if (b.name || b.phone || b.gender || b.birth_year || b.birth_date) {
            const memberId = target.member_id
            const existingMember = await c.env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first() as any
            if (existingMember) {
                await c.env.DB.prepare(`
                    UPDATE members SET name = ?, phone = ?, gender = ?, birth_year = ?, birth_date = ?
                    WHERE id = ?
                `).bind(
                    b.name || existingMember.name,
                    b.phone !== undefined ? (b.phone || null) : existingMember.phone,
                    b.gender || existingMember.gender,
                    b.birth_year || existingMember.birth_year,
                    b.birth_date !== undefined ? (b.birth_date || null) : existingMember.birth_date,
                    memberId
                ).run()
            }
        }

        await c.env.DB.prepare(`
            UPDATE org_members
            SET role = ?, affiliated_club = ?, official_level = ?, position = ?, clothing_size = ?, status = ?
            WHERE id = ?
        `).bind(
            b.role || target.role,
            b.affiliated_club !== undefined ? b.affiliated_club : target.affiliated_club,
            b.official_level !== undefined ? b.official_level : target.official_level,
            b.position !== undefined ? (b.position || null) : target.position,
            b.clothing_size !== undefined ? (b.clothing_size || null) : target.clothing_size,
            b.status || target.status,
            omId
        ).run()

        return c.json({ success: true, message: '회원 정보 수정 성공' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 4. 단체 회원 삭제 (추방)
orgs.delete('/:id/members/:omId', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const omId = parseInt(c.req.param('omId'), 10)

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        await c.env.DB.prepare('DELETE FROM org_members WHERE id = ? AND org_id = ?').bind(omId, orgId).run()

        return c.json({ success: true, message: '단체에서 제외되었습니다.' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 5. 단체 회원 전체 삭제 (초기화)
orgs.delete('/:id/members', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        await c.env.DB.prepare('DELETE FROM org_members WHERE org_id = ?').bind(orgId).run()

        return c.json({ success: true, message: '모든 회원이 단체에서 제외되었습니다.' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 6. 단체 회원 일괄 개설 및 등록 (Excel/CSV Bulk)
orgs.post('/:id/members/bulk', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const newMembers = b.members || []
        if (!Array.isArray(newMembers) || newMembers.length === 0) {
            return c.json({ error: '데이터가 없습니다.' }, 400)
        }

        let addedCount = 0;
        for (const m of newMembers) {
            if (!m.name) continue;

            const safePhone = m.phone ? m.phone.replace(/[^0-9-]/g, '') : null;
            let globalMemberId = null;

            // 1. 이름과 전화번호로 중앙 DB에서 검색
            if (safePhone) {
                const existing = await c.env.DB.prepare('SELECT id FROM members WHERE name = ? AND (phone = ? OR phone = REPLACE(?, "-", ""))').bind(m.name, safePhone, safePhone).first() as any;
                if (existing) globalMemberId = existing.id;
            }

            // 2. 없으면 중앙 DB에 신규 회원 생성
            if (!globalMemberId) {
                const { success, meta } = await c.env.DB.prepare(`
                    INSERT INTO members (owner_id, name, phone, gender, birth_year, birth_date, level, club)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    user.id, m.name, safePhone, m.gender || 'm', m.birth_year || null, m.birth_date || null, m.global_level || 'E', m.affiliated_club || null
                ).run()
                if (success) globalMemberId = meta.last_row_id
            }

            // 3. 단체에 맵핑
            if (globalMemberId) {
                try {
                    await c.env.DB.prepare(`
                        INSERT INTO org_members (org_id, member_id, role, affiliated_club, official_level, position, clothing_size, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
                    `).bind(orgId, globalMemberId, 'member', m.affiliated_club || null, m.official_level || null, m.position || null, m.clothing_size || null).run()
                    addedCount++;
                } catch (e) {
                    // Unique constraint error - already mapped
                }
            }
        }

        return c.json({ success: true, message: `${addedCount}명의 데이터가 단체에 동기화되었습니다.` })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 7. 단체 회원 알림톡/문자 발송 (선택된 회원들)
orgs.post('/:id/members/sms', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const { member_ids, message } = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        if (!message || message.length < 2) return c.json({ error: '메시지를 2자 이상 입력해주세요.' }, 400)
        if (!member_ids || member_ids.length === 0) return c.json({ error: '발송 대상이 없습니다.' }, 400)

        // 단체 이름 가져오기
        const org = await c.env.DB.prepare('SELECT name FROM organizations WHERE id = ?').bind(orgId).first() as any;
        const orgName = org?.name || '단체관리자'

        // 대상 회원들의 휴대폰 번호 조회
        const placeholders = member_ids.map(() => '?').join(',')
        const { results } = await c.env.DB.prepare(`
            SELECT m.name, m.phone 
            FROM org_members om
            JOIN members m ON om.member_id = m.id
            WHERE om.org_id = ? AND om.id IN (${placeholders}) AND m.phone IS NOT NULL AND m.phone != ''
        `).bind(orgId, ...member_ids).all()

        let successCount = 0;
        let failCount = 0;

        for (const m of results) {
            if (m.phone) {
                const prefixedMessage = `[${orgName}] ${m.name}님, \n\n${message}`;
                const ok = await sendSolapiSms(c.env, m.phone as string, prefixedMessage);
                if (ok) successCount++;
                else failCount++;
            } else {
                failCount++;
            }
        }

        return c.json({ success: true, message: `총 ${successCount}건 발송 성공, ${failCount}건 실패/누락` })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 회비 관리 (Billing/Dues) ───────────────────────────────────

// 1. 회비 납부 내역 조회
orgs.get('/:id/dues', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        // 권한 체크
        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const { results } = await c.env.DB.prepare(`
            SELECT d.*, m.name as member_name, m.phone
            FROM dues_payments d
            LEFT JOIN members m ON d.member_id = m.id
            WHERE d.org_id = ?
            ORDER BY d.created_at DESC
        `).bind(orgId).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 단체 회비 납부 기록 추가
orgs.post('/:id/dues', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const { member_id, club_id, amount, payment_type, target_year, target_month, payment_method, payment_status = 'completed', memo } = b

        const { success } = await c.env.DB.prepare(`
            INSERT INTO dues_payments (org_id, club_id, member_id, amount, payment_type, target_year, target_month, payment_method, payment_status, memo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            orgId, club_id || null, member_id || null, amount, payment_type,
            target_year || null, target_month || null, payment_method || 'transfer', payment_status, memo || null
        ).run()

        // 최신 납부연도 갱신 (연회비인 경우)
        if (success && member_id && payment_type === 'annual_fee' && target_year) {
            await c.env.DB.prepare(`UPDATE org_members SET last_dues_year = ? WHERE org_id = ? AND member_id = ?`)
                .bind(target_year, orgId, member_id).run()
        }

        if (success) return c.json({ message: '회비 등록 완료' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})


// ── 단체 지출 관리 (Expenses) ──────────────────────────────────────

// 1. 지출 내역 조회
orgs.get('/:id/expenses', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { results } = await c.env.DB.prepare(`
            SELECT * FROM org_expenses
            WHERE org_id = ?
            ORDER BY expense_date DESC, created_at DESC
        `).bind(orgId).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 지출 내역 등록
orgs.post('/:id/expenses', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { category, amount, description, receipt_url, expense_date } = b

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_expenses (org_id, category, amount, description, receipt_url, expense_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            orgId, category, amount, description || null, receipt_url || null, expense_date, user.id
        ).run()

        if (success) return c.json({ message: '지출 내역 등록 완료' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3. 정산 (1/N N빵) 요청 등록
orgs.post('/:id/finances/settlement', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { total_amount, member_ids, category, memo } = b

        if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
            return c.json({ error: '정산 대상 회원이 없습니다.' }, 400)
        }

        const count = member_ids.length
        const perPerson = Math.ceil(total_amount / count) // 올림 처리

        let inserted = 0;
        for (const mid of member_ids) {
            // N빵 정산은 미납(pending) 상태로 dues_payments에 등록됨
            const { success } = await c.env.DB.prepare(`
                INSERT INTO dues_payments (org_id, member_id, amount, payment_type, payment_status, memo)
                VALUES (?, ?, ?, ?, 'pending', ?)
            `).bind(orgId, mid, perPerson, category || 'participation_fee', memo || `${count}명 N빵 정산`).run()
            if (success) inserted++;
        }

        return c.json({ success: true, message: `${inserted}명에게 각각 ${perPerson.toLocaleString()}원씩 정산이 요청되었습니다.` })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 재무 통계 (Finance Stats) ───────────────────────────────────

orgs.get('/:id/finance-stats', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        // 수입 합계 (결제 완료된 건만)
        const incomeTotalReq = await c.env.DB.prepare(`SELECT SUM(amount) as total FROM dues_payments WHERE org_id = ? AND payment_status = 'completed'`).bind(orgId).first() as any
        const incomeTotal = incomeTotalReq?.total || 0

        // 지출 합계
        const expenseTotalReq = await c.env.DB.prepare(`SELECT SUM(amount) as total FROM org_expenses WHERE org_id = ?`).bind(orgId).first() as any
        const expenseTotal = expenseTotalReq?.total || 0

        // 지출 카테고리별 통계
        const { results: expenseByCategory } = await c.env.DB.prepare(`
            SELECT category, SUM(amount) as total 
            FROM org_expenses 
            WHERE org_id = ? 
            GROUP BY category
            ORDER BY total DESC
        `).bind(orgId).all()

        // 월별 수입 (최근 6개월)
        const { results: monthlyIncome } = await c.env.DB.prepare(`
            SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total 
            FROM dues_payments 
            WHERE org_id = ? AND payment_status = 'completed'
            GROUP BY month 
            ORDER BY month DESC LIMIT 6
        `).bind(orgId).all()

        // 월별 지출 (최근 6개월)
        const { results: monthlyExpense } = await c.env.DB.prepare(`
            SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total 
            FROM org_expenses 
            WHERE org_id = ?
            GROUP BY month 
            ORDER BY month DESC LIMIT 6
        `).bind(orgId).all()

        return c.json({
            balance: incomeTotal - expenseTotal,
            income_total: incomeTotal,
            expense_total: expenseTotal,
            expense_by_category: expenseByCategory || [],
            monthly_income: monthlyIncome || [],
            monthly_expense: monthlyExpense || []
        })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 공통 일정 관리 (Schedules) ───────────────────────────────────

// 1. 단체 일정 목록 조회
orgs.get('/:id/schedules', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        // Public하게 공개 (모임 일정 등)
        const { results } = await c.env.DB.prepare(`
            SELECT * FROM schedules
            WHERE org_id = ? 
            ORDER BY start_time ASC
        `).bind(orgId).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 단체 일정 등록
orgs.post('/:id/schedules', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const { title, description, location, start_time, end_time, event_type, club_id, repeat_months = 0 } = b

        const repeatCount = Math.max(0, parseInt(repeat_months) || 0)
        let inserted = 0;

        for (let i = 0; i <= repeatCount; i++) {
            const startStr = start_time;
            const endStr = end_time;
            let finalStart = new Date(startStr);
            let finalEnd = endStr ? new Date(endStr) : null;

            if (i > 0) {
                finalStart.setMonth(finalStart.getMonth() + i);
                if (finalEnd) finalEnd.setMonth(finalEnd.getMonth() + i);
            }

            const { success } = await c.env.DB.prepare(`
                INSERT INTO schedules (org_id, club_id, title, description, location, start_time, end_time, event_type, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                orgId, club_id || null, title, description || null, location || null,
                finalStart.toISOString(), finalEnd ? finalEnd.toISOString() : null, event_type || 'meeting', user.id
            ).run()

            if (success) inserted++;
        }

        if (inserted > 0) return c.json({ message: '일정 등록 완료', inserted }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2-1. 단체 일정 수정
orgs.put('/:id/schedules/:scheduleId', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const scheduleId = parseInt(c.req.param('scheduleId'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const existing = await c.env.DB.prepare('SELECT * FROM schedules WHERE id = ? AND org_id = ?').bind(scheduleId, orgId).first() as any
        if (!existing) return c.json({ error: '일정이 없습니다.' }, 404)

        const { title, description, location, start_time, end_time, event_type } = b
        await c.env.DB.prepare(`
            UPDATE schedules 
            SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?, event_type = ?
            WHERE id = ? AND org_id = ?
        `).bind(
            title || existing.title,
            description !== undefined ? (description || null) : existing.description,
            location !== undefined ? (location || null) : existing.location,
            start_time || existing.start_time,
            end_time !== undefined ? (end_time || null) : existing.end_time,
            event_type || existing.event_type,
            scheduleId, orgId
        ).run()

        return c.json({ success: true, message: '일정 수정 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3. 단체 일정 삭제
orgs.delete('/:id/schedules/:scheduleId', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const scheduleId = parseInt(c.req.param('scheduleId'), 10)

        const isSuperAdmin = user.global_role === 'super_admin'
        const isOrgAdmin = user.org_roles && user.org_roles[orgId] === 'admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOwner = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin && !isOwner) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        await c.env.DB.prepare(`DELETE FROM schedules WHERE id = ? AND org_id = ?`).bind(scheduleId, orgId).run()
        // 관련된 출석 기록도 삭제됨 (ON DELETE CASCADE 가 없으면 여기서 삭제)
        await c.env.DB.prepare(`DELETE FROM schedule_attendances WHERE schedule_id = ?`).bind(scheduleId).run()

        return c.json({ message: '일정 삭제 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3-1. 요일 기반 일괄 생성 (매주/격주 반복, 1년 단위)
orgs.post('/:id/schedules/bulk-weekly', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        const { title, location, event_type = 'meeting', description,
            day_of_week, start_hour, start_minute = 0,
            end_hour, end_minute = 0,
            start_date, end_date,
            interval_weeks = 1, // 1=매주, 2=격주
            exclude_dates = [] // 제외할 날짜들 (공휴일 등)
        } = b

        if (!title || day_of_week === undefined || !start_hour || !start_date || !end_date) {
            return c.json({ error: '필수값을 입력해주세요 (제목, 요일, 시간, 시작/종료일)' }, 400)
        }

        const dayNum = parseInt(day_of_week) // 0=일, 1=월, ... 6=토
        const intWeeks = Math.max(1, parseInt(interval_weeks) || 1)
        const excludeSet = new Set(exclude_dates.map((d: string) => d.substring(0, 10)))

        // 시작일부터 첫 번째 해당 요일 찾기
        const sDate = new Date(start_date + 'T00:00:00')
        const eDate = new Date(end_date + 'T23:59:59')

        // 첫 번째 해당 요일로 이동
        let cursor = new Date(sDate)
        while (cursor.getDay() !== dayNum) {
            cursor.setDate(cursor.getDate() + 1)
        }

        let inserted = 0
        const schedules: any[] = []

        while (cursor <= eDate) {
            const dateStr = cursor.toISOString().substring(0, 10)

            if (!excludeSet.has(dateStr)) {
                const startDt = new Date(cursor)
                startDt.setHours(parseInt(start_hour), parseInt(start_minute || 0), 0, 0)
                let endDt: Date | null = null
                if (end_hour) {
                    endDt = new Date(cursor)
                    endDt.setHours(parseInt(end_hour), parseInt(end_minute || 0), 0, 0)
                }

                schedules.push({
                    start: startDt.toISOString(),
                    end: endDt ? endDt.toISOString() : null
                })
            }

            cursor.setDate(cursor.getDate() + 7 * intWeeks)
        }

        // 배치 INSERT
        for (const s of schedules) {
            const { success } = await c.env.DB.prepare(`
                INSERT INTO schedules (org_id, title, description, location, start_time, end_time, event_type, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(orgId, title, description || null, location || null, s.start, s.end, event_type, user.id).run()
            if (success) inserted++
        }

        return c.json({ message: `${inserted}건의 일정이 생성되었습니다.`, inserted }, 201)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3-2. 전체 일정 초기화 (삭제)
orgs.delete('/:id/schedules', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) {
            return c.json({ error: '권한이 없습니다.' }, 403)
        }

        // 출석 데이터도 함께 삭제
        const { results: scheds } = await c.env.DB.prepare('SELECT id FROM schedules WHERE org_id = ?').bind(orgId).all()
        if (scheds && scheds.length > 0) {
            const ids = (scheds as any[]).map(s => s.id)
            for (const sid of ids) {
                await c.env.DB.prepare('DELETE FROM schedule_attendances WHERE schedule_id = ?').bind(sid).run()
            }
        }

        await c.env.DB.prepare('DELETE FROM schedules WHERE org_id = ?').bind(orgId).run()

        return c.json({ message: `${scheds?.length || 0}건의 일정이 초기화되었습니다.` })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})
orgs.get('/:id/schedules/:scheduleId/attendance', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const scheduleId = parseInt(c.req.param('scheduleId'), 10)

        const { results } = await c.env.DB.prepare(`
            SELECT sa.id, sa.member_id, sa.status, m.name, m.phone, m.gender, om.affiliated_club
            FROM schedule_attendances sa
            JOIN members m ON sa.member_id = m.id
            LEFT JOIN org_members om ON m.id = om.member_id AND om.org_id = ?
            WHERE sa.schedule_id = ?
        `).bind(orgId, scheduleId).all()

        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 5. 단체 일정 출석 상태 변경 (Bulk Update)
orgs.post('/:id/schedules/:scheduleId/attendance', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const scheduleId = parseInt(c.req.param('scheduleId'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const attendances = b.attendances || []; // [{member_id: 1, status: 'present'}, ...]
        for (const a of attendances) {
            if (!a.member_id || !a.status) continue;
            // Upsert (SQLite)
            await c.env.DB.prepare(`
                INSERT INTO schedule_attendances (schedule_id, member_id, org_id, status)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(schedule_id, member_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
            `).bind(scheduleId, a.member_id, orgId, a.status).run()
        }

        return c.json({ success: true, message: '출석 기록이 저장되었습니다.' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── QR 출석체크 시스템 ──

// QR 토큰 생성 (관리자가 일정에 대해 QR 생성)
orgs.post('/:id/schedules/:scheduleId/qr-token', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const scheduleId = parseInt(c.req.param('scheduleId'), 10)

        // 간단한 토큰 생성 (orgId + scheduleId + 랜덤)
        const token = `qr_${orgId}_${scheduleId}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`

        // 토큰을 스케줄에 저장 (description 필드를 임시로 활용하거나 별도 필드)
        await c.env.DB.prepare('UPDATE schedules SET qr_token = ? WHERE id = ? AND org_id = ?')
            .bind(token, scheduleId, orgId).run()

        return c.json({ token, url: `/qr-attend?token=${token}` })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// QR 통해 출석 가능한 회원 목록 (토큰 기반, 인증 불필요)
orgs.get('/:id/qr-attend/:token', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const token = c.req.param('token')

        // 토큰 유효성 확인
        const schedule = await c.env.DB.prepare('SELECT * FROM schedules WHERE qr_token = ? AND org_id = ?')
            .bind(token, orgId).first() as any
        if (!schedule) return c.json({ error: '유효하지 않은 QR 코드입니다.' }, 404)

        // 소속 회원 목록
        const { results: members } = await c.env.DB.prepare(`
            SELECT om.member_id, m.name, om.affiliated_club
            FROM org_members om JOIN members m ON om.member_id = m.id
            WHERE om.org_id = ? AND om.status = 'active'
            ORDER BY m.name ASC
        `).bind(orgId).all()

        // 이미 출석한 회원
        const { results: attended } = await c.env.DB.prepare(`
            SELECT member_id FROM schedule_attendances WHERE schedule_id = ? AND status = 'present'
        `).bind(schedule.id).all()
        const attendedIds = new Set((attended || []).map((a: any) => a.member_id))

        return c.json({
            schedule: { id: schedule.id, title: schedule.title, start_time: schedule.start_time },
            members: (members || []).map((m: any) => ({ ...m, already_checked: attendedIds.has(m.member_id) }))
        })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// QR로 출석 등록 (인증 불필요 — 토큰으로 검증)
orgs.post('/:id/qr-attend/:token', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const token = c.req.param('token')
        const b = await c.req.json()

        const schedule = await c.env.DB.prepare('SELECT * FROM schedules WHERE qr_token = ? AND org_id = ?')
            .bind(token, orgId).first() as any
        if (!schedule) return c.json({ error: '유효하지 않은 QR 코드입니다.' }, 404)

        const memberIds: number[] = b.member_ids || []
        if (memberIds.length === 0) return c.json({ error: '회원을 선택해주세요.' }, 400)

        let checkedCount = 0
        for (const memberId of memberIds) {
            try {
                await c.env.DB.prepare(`
                    INSERT INTO schedule_attendances (schedule_id, member_id, status, checked_at)
                    VALUES (?, ?, 'present', datetime('now'))
                `).bind(schedule.id, memberId).run()
                checkedCount++
            } catch (e) {
                // 이미 출석한 경우 무시
            }
        }

        return c.json({ message: `${checkedCount}명 출석 처리 완료!`, checked: checkedCount })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 6. 단체 출석 통계 (랭킹/월별)
orgs.get('/:id/attendance-stats', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const type = c.req.query('type')

        if (type === 'monthly') {
            const { results } = await c.env.DB.prepare(`
                SELECT strftime('%Y-%m', s.start_time) as month, count(sa.id) as attend_count
                FROM schedules s
                JOIN schedule_attendances sa ON s.id = sa.schedule_id
                WHERE s.org_id = ? AND sa.status = 'present'
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
            `).bind(orgId).all()
            return c.json(results || [])
        } else if (type === 'quarterly') {
            // 분기별 통계
            const { results } = await c.env.DB.prepare(`
                SELECT 
                    CASE 
                        WHEN CAST(strftime('%m', s.start_time) AS INTEGER) BETWEEN 1 AND 3 THEN strftime('%Y', s.start_time) || '-Q1'
                        WHEN CAST(strftime('%m', s.start_time) AS INTEGER) BETWEEN 4 AND 6 THEN strftime('%Y', s.start_time) || '-Q2'
                        WHEN CAST(strftime('%m', s.start_time) AS INTEGER) BETWEEN 7 AND 9 THEN strftime('%Y', s.start_time) || '-Q3'
                        ELSE strftime('%Y', s.start_time) || '-Q4'
                    END as quarter,
                    count(DISTINCT s.id) as event_count,
                    count(sa.id) as attend_count
                FROM schedules s
                LEFT JOIN schedule_attendances sa ON s.id = sa.schedule_id AND sa.status = 'present'
                WHERE s.org_id = ?
                GROUP BY quarter
                ORDER BY quarter DESC
                LIMIT 8
            `).bind(orgId).all()
            return c.json(results || [])
        } else if (type === 'individual') {
            // 개인별 출석률 (전체 일정 대비)
            const totalSchedules = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM schedules WHERE org_id = ?').bind(orgId).first() as any
            const total = totalSchedules?.cnt || 0
            const { results } = await c.env.DB.prepare(`
                SELECT m.id, m.name, om.affiliated_club, om.position,
                    COUNT(sa.id) as attend_count
                FROM members m
                JOIN org_members om ON m.id = om.member_id AND om.org_id = ?
                LEFT JOIN schedule_attendances sa ON m.id = sa.member_id AND sa.status = 'present'
                    AND sa.schedule_id IN (SELECT id FROM schedules WHERE org_id = ?)
                WHERE om.status = 'active'
                GROUP BY m.id
                ORDER BY attend_count DESC
            `).bind(orgId, orgId).all()
            return c.json({ total_schedules: total, members: results || [] })
        } else {
            // 종합 개인별 랭킹
            const { results } = await c.env.DB.prepare(`
                SELECT m.id, m.name, om.affiliated_club, COUNT(sa.id) as attend_count
                FROM members m
                JOIN org_members om ON m.id = om.member_id AND om.org_id = ?
                JOIN schedule_attendances sa ON m.id = sa.member_id AND sa.status = 'present'
                JOIN schedules s ON sa.schedule_id = s.id AND s.org_id = ?
                WHERE om.status = 'active'
                GROUP BY m.id
                ORDER BY attend_count DESC
                LIMIT 50
            `).bind(orgId, orgId).all()
            return c.json(results || [])
        }
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 캘린더 데이터 (월별 일정 조회) ──
orgs.get('/:id/calendar', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const year = parseInt(c.req.query('year') || new Date().getFullYear().toString())
        const month = parseInt(c.req.query('month') || (new Date().getMonth() + 1).toString())

        const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
        const endDate = month === 12 ? `${year + 1}-01-01T00:00:00` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`

        const { results } = await c.env.DB.prepare(`
            SELECT id, title, start_time, end_time, event_type, location, description
            FROM schedules 
            WHERE org_id = ? AND start_time >= ? AND start_time < ?
            ORDER BY start_time ASC
        `).bind(orgId, startDate, endDate).all()

        // 출석 수도 함께 반환
        const scheduleIds = (results || []).map((r: any) => r.id)
        const attendCounts: Record<number, number> = {}
        for (const sid of scheduleIds) {
            const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM schedule_attendances WHERE schedule_id = ? AND status = ?').bind(sid, 'present').first() as any
            attendCounts[sid] = cnt?.c || 0
        }

        return c.json({
            year, month,
            schedules: (results || []).map((r: any) => ({ ...r, attend_count: attendCounts[r.id] || 0 }))
        })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 내부 경기 기록 (Match Records) ──
orgs.get('/:id/match-records', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const { results } = await c.env.DB.prepare(`
            SELECT * FROM org_match_records 
            WHERE org_id = ? 
            ORDER BY match_date DESC
            LIMIT 100
        `).bind(orgId).all()
        return c.json(results || [])
    } catch (e) {
        return c.json([] as any[])
    }
})

orgs.post('/:id/match-records', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'
        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { match_date, match_type, player1_name, player2_name, player1_score, player2_score, player3_name, player4_name, notes } = b

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_match_records (org_id, match_date, match_type, player1_name, player2_name, player1_score, player2_score, player3_name, player4_name, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(orgId, match_date, match_type || 'singles', player1_name, player2_name, player1_score || 0, player2_score || 0, player3_name || null, player4_name || null, notes || null, user.id).run()

        return c.json({ message: '경기 기록 저장 완료' }, 201)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

orgs.delete('/:id/match-records/:recordId', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const recordId = parseInt(c.req.param('recordId'), 10)

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'
        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        await c.env.DB.prepare('DELETE FROM org_match_records WHERE id = ? AND org_id = ?').bind(recordId, orgId).run()
        return c.json({ message: '삭제 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 사이트 편집기 (Site Config) ──────────────────────────────────

// 사이트 설정 조회
orgs.get('/:id/site-config', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const org = await c.env.DB.prepare('SELECT site_config, name, sport_type, theme_color, slug FROM organizations WHERE id = ?').bind(orgId).first() as any
        if (!org) return c.json({ error: '단체를 찾을 수 없습니다.' }, 404)

        let config: any = {}
        try { config = JSON.parse(org.site_config || '{}') } catch (e) { }

        // 기본값 병합
        const defaults = {
            hero_title: org.name || '',
            hero_subtitle: '함께 뛰고, 함께 성장하는 커뮤니티.\\n당신의 시작을 응원합니다.',
            hero_cta_primary: '가입 신청하기',
            hero_cta_secondary: '일정 보기',
            show_schedule: true,
            show_notice: true,
            show_join_form: true,
            show_about: false,
            about_title: '소개',
            about_text: '',
            contact_phone: '',
            contact_address: '',
            contact_email: '',
            sns_instagram: '',
            sns_blog: '',
            sns_youtube: '',
            footer_text: '',
            template_id: 'developer'
        }
        return c.json({ ...defaults, ...config, slug: org.slug, sport_type: org.sport_type, theme_color: org.theme_color })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 사이트 설정 저장
orgs.put('/:id/site-config', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        // theme_color는 organizations 테이블에 직접 저장
        if (b.theme_color) {
            await c.env.DB.prepare('UPDATE organizations SET theme_color = ? WHERE id = ?').bind(b.theme_color, orgId).run()
        }

        // 나머지는 site_config JSON으로
        const configFields = ['hero_title', 'hero_subtitle', 'hero_cta_primary', 'hero_cta_secondary',
            'show_schedule', 'show_notice', 'show_join_form', 'show_about',
            'about_title', 'about_text', 'contact_phone', 'contact_address', 'contact_email',
            'sns_instagram', 'sns_blog', 'sns_youtube', 'footer_text', 'template_id']

        const config: any = {}
        for (const f of configFields) {
            if (b[f] !== undefined) config[f] = b[f]
        }

        await c.env.DB.prepare('UPDATE organizations SET site_config = ? WHERE id = ?').bind(JSON.stringify(config), orgId).run()
        return c.json({ message: '사이트 설정이 저장되었습니다!' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 게시판 관리 (Boards & Posts) ───────────────────────────────────

// 1. 게시판 목록 조회
orgs.get('/:id/boards', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const { results } = await c.env.DB.prepare(`SELECT * FROM org_boards WHERE org_id = ? ORDER BY id ASC`).bind(orgId).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 게시판 생성 (관리자 전용)
orgs.post('/:id/boards', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { success } = await c.env.DB.prepare(`INSERT INTO org_boards (org_id, name, description, board_type) VALUES (?, ?, ?, ?)`).bind(
            orgId, b.name, b.description || null, b.board_type || 'normal'
        ).run()

        if (success) return c.json({ message: '게시판 생성 완료' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3. 특정 게시판 게시글 목록 조회
orgs.get('/:id/boards/:boardId/posts', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const boardId = parseInt(c.req.param('boardId'), 10)
        const search = c.req.query('search') || ''

        let query = `
            SELECT p.*, 
                   (SELECT COUNT(*) FROM org_comments WHERE post_id = p.id) as comment_count
            FROM org_posts p
            WHERE p.org_id = ? AND p.board_id = ?
        `
        const bindings: any[] = [orgId, boardId]
        if (search) {
            query += ` AND (p.title LIKE ? OR p.content LIKE ?) `
            bindings.push(`%${search}%`, `%${search}%`)
        }
        query += ` ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT 100`

        const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 4. 게시글 등록
orgs.post('/:id/boards/:boardId/posts', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const boardId = parseInt(c.req.param('boardId'), 10)
        const b = await c.req.json()

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_posts (org_id, board_id, author_id, author_name, title, content)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(orgId, boardId, user.id, user.username || '관리자', b.title, b.content).run()

        if (success) return c.json({ message: '게시글이 등록되었습니다.' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 5. 게시글 상세 및 댓글 조회
orgs.get('/:id/boards/:boardId/posts/:postId', async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const postId = parseInt(c.req.param('postId'), 10)

        // 조회수 증가
        await c.env.DB.prepare(`UPDATE org_posts SET views = views + 1 WHERE id = ? AND org_id = ?`).bind(postId, orgId).run()

        const post = await c.env.DB.prepare(`SELECT * FROM org_posts WHERE id = ? AND org_id = ?`).bind(postId, orgId).first()
        if (!post) return c.json({ error: '게시글을 찾을 수 없습니다.' }, 404)

        const { results: comments } = await c.env.DB.prepare(`SELECT * FROM org_comments WHERE post_id = ? ORDER BY created_at ASC`).bind(postId).all()

        return c.json({ post, comments: comments || [] })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 6. 게시글 삭제
orgs.delete('/:id/boards/:boardId/posts/:postId', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const postId = parseInt(c.req.param('postId'), 10)

        await c.env.DB.prepare(`DELETE FROM org_posts WHERE id = ? AND org_id = ?`).bind(postId, orgId).run()
        return c.json({ message: '삭제 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 6-1. 게시글 수정
orgs.put('/:id/boards/:boardId/posts/:postId', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const postId = parseInt(c.req.param('postId'), 10)
        const b = await c.req.json()

        await c.env.DB.prepare(`UPDATE org_posts SET title = ?, content = ? WHERE id = ? AND org_id = ?`)
            .bind(b.title, b.content, postId, orgId).run()
        return c.json({ message: '수정 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 6-2. 공지 고정/해제 토글
orgs.patch('/:id/boards/:boardId/posts/:postId/pin', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const postId = parseInt(c.req.param('postId'), 10)

        const post = await c.env.DB.prepare('SELECT is_pinned FROM org_posts WHERE id = ? AND org_id = ?').bind(postId, orgId).first() as any
        if (!post) return c.json({ error: '게시글을 찾을 수 없습니다.' }, 404)

        const newPinned = post.is_pinned ? 0 : 1
        await c.env.DB.prepare('UPDATE org_posts SET is_pinned = ? WHERE id = ? AND org_id = ?').bind(newPinned, postId, orgId).run()
        return c.json({ message: newPinned ? '공지로 고정합니다.' : '고정 해제합니다.', is_pinned: newPinned })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 7. 댓글 작성
orgs.post('/:id/boards/:boardId/posts/:postId/comments', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const postId = parseInt(c.req.param('postId'), 10)
        const b = await c.req.json()

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_comments (post_id, author_id, author_name, content)
            VALUES (?, ?, ?, ?)
        `).bind(postId, user.id, user.username || '관리자', b.content).run()

        if (success) return c.json({ message: '댓글이 등록되었습니다.' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 8. 댓글 삭제
orgs.delete('/:id/boards/:boardId/posts/:postId/comments/:commentId', requireAuth, async (c) => {
    try {
        const commentId = parseInt(c.req.param('commentId'), 10)
        await c.env.DB.prepare(`DELETE FROM org_comments WHERE id = ?`).bind(commentId).run()
        return c.json({ message: '댓글 삭제 완료' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 단체 물품 재고 관리 (Inventory) ───────────────────────────────────

// 1. 재고 목록 조회
orgs.get('/:id/inventory', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        const { results } = await c.env.DB.prepare(`SELECT * FROM org_inventory_items WHERE org_id = ? ORDER BY category ASC, id DESC`).bind(orgId).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 2. 새 물품(품목) 등록
orgs.post('/:id/inventory', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const b = await c.req.json()

        const isSuperAdmin = user.global_role === 'super_admin'
        const roleCheck = await c.env.DB.prepare('SELECT role FROM user_roles WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, 'org', orgId).first() as any
        const isOrgAdmin = roleCheck && roleCheck.role === 'admin'

        if (!isSuperAdmin && !isOrgAdmin) return c.json({ error: '권한이 없습니다.' }, 403)

        const { success } = await c.env.DB.prepare(`
            INSERT INTO org_inventory_items (org_id, name, category, current_quantity, unit)
            VALUES (?, ?, ?, ?, ?)
        `).bind(orgId, b.name, b.category || 'other', b.initial_quantity || 0, b.unit || '개').run()

        if (success) return c.json({ message: '품목이 등록되었습니다.' }, 201)
        return c.json({ error: 'Failed' }, 500)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 3. 재고 입출고/조정 기록 등록 (Log)
orgs.post('/:id/inventory/:itemId/logs', requireAuth, async (c) => {
    try {
        const user = c.get('adminUser')
        const orgId = parseInt(c.req.param('id'), 10)
        const itemId = parseInt(c.req.param('itemId'), 10)
        const b = await c.req.json()

        const { log_type, quantity_change, memo, log_date } = b

        // 트랜잭션과 유사하게 현재 수량 가져와서 업데이트
        const item = await c.env.DB.prepare(`SELECT current_quantity FROM org_inventory_items WHERE id = ? AND org_id = ?`).bind(itemId, orgId).first() as any
        if (!item) return c.json({ error: '품목을 찾을 수 없습니다.' }, 404)

        const currentQty = item.current_quantity
        let newQty = currentQty
        const change = parseInt(quantity_change, 10)

        if (log_type === 'in') {
            newQty += change
        } else if (log_type === 'out') {
            newQty -= change
        } else if (log_type === 'adjust') {
            // adjust일 때는 quantity_change를 차이값이 아니라 '변경 후 최종 값'으로 받기로 가정하거나, 프론트에서 +,- 차이값을 넘겨야 함.
            // 여기서는 프론트가 차이값(+/-)을 계산해서 넘긴다고 가정 (위 로직과 동일)
            newQty += change
        }

        const dateStr = log_date || new Date().toISOString()

        // 1. 로그 기록 남김
        await c.env.DB.prepare(`
            INSERT INTO org_inventory_logs (org_id, item_id, log_type, quantity_change, balance_after, log_date, memo, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(orgId, itemId, log_type, change, newQty, dateStr, memo || null, user.id).run()

        // 2. 품목 마스터의 현재 수량 업데이트
        await c.env.DB.prepare(`
            UPDATE org_inventory_items 
            SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND org_id = ?
        `).bind(newQty, itemId, orgId).run()

        return c.json({ message: '재고 변동 내역이 저장되었습니다.', current_quantity: newQty })

    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// 4. 재고 변동 내역(Logs) 조회
orgs.get('/:id/inventory/logs', requireAuth, async (c) => {
    try {
        const orgId = parseInt(c.req.param('id'), 10)
        // 특정 아이템 필터링 여부
        const itemId = c.req.query('item_id')

        let query = `
            SELECT l.*, i.name as item_name, i.category, i.unit, u.username as creator_name
            FROM org_inventory_logs l
            JOIN org_inventory_items i ON l.item_id = i.id
            LEFT JOIN users u ON l.created_by = u.id
            WHERE l.org_id = ?
        `
        const bindings: any[] = [orgId]

        if (itemId) {
            query += ` AND l.item_id = ?`
            bindings.push(parseInt(itemId, 10))
        }

        query += ` ORDER BY l.log_date DESC, l.created_at DESC LIMIT 100`

        const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
        return c.json(results || [])
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 사이트 설정 (site_config) 조회 ──
orgs.get('/:id/site-config', requireAuth, async (c) => {
    const id = c.req.param('id')
    try {
        const org = await c.env.DB.prepare('SELECT id, name, sport_type, theme_color, site_config FROM organizations WHERE id = ?').bind(id).first() as any
        if (!org) return c.json({ error: 'Not found' }, 404)

        let sc: any = {}
        try { sc = JSON.parse(org.site_config || '{}') } catch (e) { }

        const defaults = {
            hero_title: org.name || '',
            hero_subtitle: '',
            hero_cta_primary: '가입 신청하기',
            hero_cta_secondary: '일정 보기',
            show_schedule: true,
            show_notice: true,
            show_join_form: true,
            show_about: false,
            about_title: '소개',
            about_text: '',
            contact_phone: '',
            contact_address: '',
            contact_email: '',
            sns_instagram: '',
            sns_blog: '',
            sns_youtube: '',
            footer_text: ''
        }

        return c.json({ ...defaults, ...sc, theme_color: org.theme_color || '#C8FF00' })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

// ── 사이트 설정 (site_config) 저장 ──
orgs.put('/:id/site-config', requireAuth, async (c) => {
    const id = c.req.param('id')
    try {
        const body = await c.req.json() as any
        const { theme_color, ...siteConfig } = body
        const siteConfigJson = JSON.stringify(siteConfig)

        if (theme_color) {
            await c.env.DB.prepare('UPDATE organizations SET site_config = ?, theme_color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .bind(siteConfigJson, theme_color, id).run()
        } else {
            await c.env.DB.prepare('UPDATE organizations SET site_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .bind(siteConfigJson, id).run()
        }

        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 500)
    }
})

export default orgs

