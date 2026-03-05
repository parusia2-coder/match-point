// src/routes/members.ts
// 통합 회원 관리 API

import { Hono } from 'hono'
import { optionalAuth, requireAuth } from '../middleware/auth'

type Env = { DB: D1Database; JWT_SECRET: string }
type Variables = { adminUser: { id: number; username: string; plan: string } }
const members = new Hono<{ Bindings: Env; Variables: Variables }>()

// 전역 선택적 인증
members.use('*', optionalAuth)

// ============================================================
// GET /api/members — 회원 목록 (내 회원만 반환)
// ============================================================
members.get('/', async (c) => {
    const db = c.env.DB
    const user = c.get('adminUser') as any
    const q = c.req.query('q') || ''
    const club = c.req.query('club') || ''
    const level = c.req.query('level') || ''
    const gender = c.req.query('gender') || ''
    const page = Math.max(1, parseInt(c.req.query('page') || '1'))
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
    const offset = (page - 1) * limit

    // 로그인한 관리자의 회원만, 미로그인 시 공개(owner_id NULL)
    let where = 'WHERE m.active = 1'
    const params: any[] = []

    if (user?.id) {
        where += ' AND (m.owner_id = ? OR m.owner_id IS NULL)'
        params.push(user.id)
    } else {
        where += ' AND m.owner_id IS NULL'
    }

    if (q) { where += ' AND (m.name LIKE ? OR m.phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`) }
    if (club) { where += ' AND m.club = ?'; params.push(club) }
    if (level) { where += ' AND m.level = ?'; params.push(level) }
    if (gender) { where += ' AND m.gender = ?'; params.push(gender) }

    const [rows, countRow] = await Promise.all([
        db.prepare(`
      SELECT m.*,
             COUNT(DISTINCT h.tournament_id) AS tournament_count,
             MAX(h.created_at)               AS last_tournament_at
      FROM members m
      LEFT JOIN member_tournament_history h ON h.member_id = m.id
      ${where}
      GROUP BY m.id
      ORDER BY m.name ASC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all(),
        db.prepare(`SELECT COUNT(*) AS cnt FROM members m ${where}`)
            .bind(...params).first<{ cnt: number }>()
    ])

    return c.json({
        members: rows.results,
        total: countRow?.cnt ?? 0,
        page,
        pages: Math.ceil((countRow?.cnt ?? 0) / limit)
    })
})

// ============================================================
// GET /api/members/:id — 회원 상세 + 대회 이력
// ============================================================
members.get('/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')

    const [member, history] = await Promise.all([
        db.prepare('SELECT * FROM members WHERE id = ? AND active = 1')
            .bind(id).first(),
        db.prepare(`
      SELECT h.*, t.name AS tournament_name, t.created_at AS tournament_date
      FROM member_tournament_history h
      JOIN tournaments t ON t.id = h.tournament_id
      WHERE h.member_id = ?
      ORDER BY h.created_at DESC
    `).bind(id).all()
    ])

    if (!member) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

    return c.json({ member, history: history.results })
})

// ============================================================
// POST /api/members — 회원 등록 (로그인 필수)
// ============================================================
members.post('/', requireAuth, async (c) => {
    const db = c.env.DB
    const user = c.get('adminUser') as any
    const body = await c.req.json()
    const { name, phone, gender, birth_year, level, club, memo } = body

    if (!name || !gender || !birth_year || !level) {
        return c.json({ error: '필수 항목 누락 (name, gender, birth_year, level)' }, 400)
    }

    const result = await db.prepare(`
    INSERT INTO members (name, phone, gender, birth_year, level, club, memo, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, phone || null, gender, birth_year, level, club || null, memo || null, user?.id || null).run()

    return c.json({ id: result.meta.last_row_id, message: '회원이 등록되었습니다.' }, 201)
})

// ============================================================
// PUT /api/members/:id — 회원 정보 수정 (로그인 필수)
// ============================================================
members.put('/:id', requireAuth, async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const user = c.get('adminUser') as any
    const body = await c.req.json()
    const { name, phone, gender, birth_year, level, club, memo } = body

    // 소유권 확인
    const m = await db.prepare('SELECT owner_id FROM members WHERE id=? AND active=1').bind(id).first() as any
    if (!m) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
    if (m.owner_id && m.owner_id !== user?.id) return c.json({ error: '수정 권한이 없습니다.' }, 403)

    await db.prepare(`
    UPDATE members
    SET name=?, phone=?, gender=?, birth_year=?, level=?, club=?, memo=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND active=1
  `).bind(name, phone || null, gender, birth_year, level, club || null, memo || null, id).run()

    return c.json({ message: '수정되었습니다.' })
})

// ============================================================
// DELETE /api/members/:id — 회원 비활성화 (로그인 필수)
// ============================================================
members.delete('/:id', requireAuth, async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const user = c.get('adminUser') as any

    const m = await db.prepare('SELECT owner_id FROM members WHERE id=? AND active=1').bind(id).first() as any
    if (!m) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
    if (m.owner_id && m.owner_id !== user?.id) return c.json({ error: '삭제 권한이 없습니다.' }, 403)

    await db.prepare('UPDATE members SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run()
    return c.json({ message: '회원이 비활성화되었습니다.' })
})

// ============================================================
// POST /api/members/import-from-tournament/:tid (로그인 필수)
// ============================================================
members.post('/import-from-tournament/:tid', requireAuth, async (c) => {
    const db = c.env.DB
    const tid = c.req.param('tid')
    const user = c.get('adminUser') as any
    const ownerId = user?.id || null

    const participants = await db.prepare(
        'SELECT * FROM participants WHERE tournament_id=? AND deleted=0 AND member_id IS NULL'
    ).bind(tid).all()

    let created = 0
    let skipped = 0

    for (const p of participants.results as any[]) {
        const existing = await db.prepare(
            'SELECT id FROM members WHERE name=? AND birth_year=? AND gender=? AND active=1 AND (owner_id=? OR owner_id IS NULL) LIMIT 1'
        ).bind(p.name, p.birth_year, p.gender, ownerId).first<{ id: number }>()

        if (existing) {
            await db.prepare('UPDATE participants SET member_id=? WHERE id=?').bind(existing.id, p.id).run()
            skipped++
        } else {
            const ins = await db.prepare(
                'INSERT INTO members (name, phone, gender, birth_year, level, club, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(p.name, p.phone || null, p.gender, p.birth_year, p.level, p.club || null, ownerId).run()
            await db.prepare('UPDATE participants SET member_id=? WHERE id=?').bind(ins.meta.last_row_id, p.id).run()
            created++
        }
    }

    return c.json({ message: `완료: 신규 ${created}명 등록, ${skipped}명 기존 회원 연결`, created, skipped })
})

// ============================================================
// GET /api/members/clubs — 클럽 목록 (자동완성용)
// ============================================================
members.get('/meta/clubs', async (c) => {
    const db = c.env.DB
    const rows = await db.prepare(`
    SELECT DISTINCT club FROM members
    WHERE club IS NOT NULL AND active=1
    ORDER BY club ASC
  `).all()
    return c.json(rows.results.map((r: any) => r.club))
})

// ============================================================
// GET /api/members/:id/matches — 개인 경기 기록 전체
// ============================================================
members.get('/:id/matches', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 200)

    const [stat, records] = await Promise.all([
        // 통계 요약
        db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result='win'  THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) as losses,
        SUM(my_score)  as total_score_for,
        SUM(opp_score) as total_score_against
      FROM member_match_records WHERE member_id = ?
    `).bind(id).first(),

        // 경기 목록
        db.prepare(`
      SELECT r.*,
             t.name AS tournament_name
      FROM member_match_records r
      LEFT JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.member_id = ?
      ORDER BY r.created_at DESC
      LIMIT ?
    `).bind(id, limit).all()
    ])

    return c.json({ stat, records: records.results })
})

export default members
