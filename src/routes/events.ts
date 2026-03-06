import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Helper: get age filter SQL
function getAgeFilter(ageGroup: string): string {
    const currentYear = 2026
    switch (ageGroup) {
        case '20대': return `birth_year BETWEEN ${currentYear - 29} AND ${currentYear - 20}` // 1997~2006
        case '30대': return `birth_year BETWEEN ${currentYear - 39} AND ${currentYear - 30}` // 1987~1996
        case '40대': return `birth_year BETWEEN ${currentYear - 49} AND ${currentYear - 40}` // 1977~1986
        case '50대': return `birth_year BETWEEN ${currentYear - 54} AND ${currentYear - 50}` // 1972~1976
        case '55대': return `birth_year BETWEEN ${currentYear - 59} AND ${currentYear - 55}` // 1967~1971
        case '60대': return `birth_year <= ${currentYear - 60}` // ~1966
        default: return '1=1' // open
    }
}

// List events
app.get('/:tid/events', async (c) => {
    const tid = c.req.param('tid')
    const { results: events } = await c.env.DB.prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM teams t WHERE t.event_id = e.id) as team_count
     FROM events e WHERE e.tournament_id = ? ORDER BY e.category, e.age_group, e.level_group`
    ).bind(tid).all()
    return c.json(events)
})

// Create event
app.post('/:tid/events', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { category, age_group, level_group, name, venue_id } = body
    const validCategories = ['md', 'wd', 'xd']
    if (!validCategories.includes(category)) return c.json({ error: 'Invalid category' }, 400)

    const autoName = name || generateEventName(category, age_group, level_group)
    const result = await c.env.DB.prepare(
        'INSERT INTO events (tournament_id, category, age_group, level_group, name, venue_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tid, category, age_group, level_group, autoName, venue_id || null).run()
    return c.json({ id: result.meta.last_row_id, success: true }, 201)
})

// Update event
app.put('/:tid/events/:eid', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    const body = await c.req.json()
    const { venue_id } = body

    await c.env.DB.prepare(
        'UPDATE events SET venue_id = ? WHERE id = ? AND tournament_id = ?'
    ).bind(venue_id || null, eid, tid).run()

    return c.json({ success: true })
})

// Bulk create events
app.post('/:tid/events/bulk-create', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json() || {}
    const { categories, age_groups, level_groups, auto_assign, assign_options } = body
    const created: any[] = []

    for (const cat of categories) {
        for (const age of age_groups) {
            for (const level of level_groups) {
                const name = generateEventName(cat, age, level)
                const existing = await c.env.DB.prepare(
                    'SELECT id FROM events WHERE tournament_id = ? AND category = ? AND age_group = ? AND level_group = ?'
                ).bind(tid, cat, age, level).first()
                if (existing) continue

                const result = await c.env.DB.prepare(
                    'INSERT INTO events (tournament_id, category, age_group, level_group, name, venue_id) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(tid, cat, age, level, name, body.venue_id || null).run()
                created.push({ id: result.meta.last_row_id, name, category: cat, age_group: age, level_group: level, venue_id: body.venue_id || null })
            }
        }
    }

    // Auto assign teams if requested
    if (auto_assign && created.length > 0) {
        for (const evt of created) {
            await autoAssignTeams(c.env.DB, parseInt(tid), evt.id, evt.category, evt.age_group, evt.level_group)
        }
    }

    return c.json({ created, count: created.length })
})

// Delete event
app.delete('/:tid/events/:eid', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    // Delete related data
    await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(eid).run()
    await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ? AND tournament_id = ?').bind(eid, tid).run()
    await c.env.DB.prepare('DELETE FROM teams WHERE event_id = ? AND tournament_id = ?').bind(eid, tid).run()
    await c.env.DB.prepare('DELETE FROM events WHERE id = ? AND tournament_id = ?').bind(eid, tid).run()
    return c.json({ success: true })
})

// Register team manually
app.post('/:tid/events/:eid/teams', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    const { player1_id, player2_id } = await c.req.json()

    const p1 = await c.env.DB.prepare('SELECT name FROM participants WHERE id = ? AND tournament_id = ?').bind(player1_id, tid).first() as any
    const p2 = await c.env.DB.prepare('SELECT name FROM participants WHERE id = ? AND tournament_id = ?').bind(player2_id, tid).first() as any
    if (!p1 || !p2) return c.json({ error: 'Player not found' }, 404)

    const teamName = `${p1.name} · ${p2.name}`
    const result = await c.env.DB.prepare(
        'INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)'
    ).bind(eid, tid, player1_id, player2_id, teamName).run()
    return c.json({ id: result.meta.last_row_id, team_name: teamName, success: true }, 201)
})

// List teams
app.get('/:tid/events/:eid/teams', async (c) => {
    const eid = c.req.param('eid')
    const { results } = await c.env.DB.prepare(
        `SELECT t.*, p1.name as p1_name, p1.level as p1_level, p1.club as p1_club, p1.gender as p1_gender,
            p2.name as p2_name, p2.level as p2_level, p2.club as p2_club, p2.gender as p2_gender
     FROM teams t
     JOIN participants p1 ON t.player1_id = p1.id
     JOIN participants p2 ON t.player2_id = p2.id
     WHERE t.event_id = ? ORDER BY t.group_num, t.id`
    ).bind(eid).all()
    return c.json(results)
})

// Delete team
app.delete('/:tid/events/:eid/teams/:teamId', async (c) => {
    const teamId = c.req.param('teamId')
    await c.env.DB.prepare('DELETE FROM standings WHERE team_id = ?').bind(teamId).run()
    await c.env.DB.prepare('DELETE FROM matches WHERE team1_id = ? OR team2_id = ?').bind(teamId, teamId).run()
    await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run()
    return c.json({ success: true })
})

// Auto-assign teams for single event
app.post('/:tid/events/:eid/auto-assign', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    const body = await c.req.json() || {}
    const { method, assign_groups, teams_per_group, avoid_club_in_group } = body

    const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ? AND tournament_id = ?').bind(eid, tid).first() as any
    if (!event) return c.json({ error: 'Event not found' }, 404)

    const count = await autoAssignTeams(c.env.DB, parseInt(tid), parseInt(eid), event.category, event.age_group, event.level_group, { method })

    if (assign_groups) {
        await assignGroups(c.env.DB, parseInt(eid), parseInt(tid), teams_per_group || 5, avoid_club_in_group !== false)
    }

    return c.json({ success: true, teams_created: count })
})

// Auto-assign all events
app.post('/:tid/events/auto-assign-all', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json() || {}
    const { method, assign_groups, teams_per_group, avoid_club_in_group } = body

    const { results: events } = await c.env.DB.prepare('SELECT * FROM events WHERE tournament_id = ?').bind(tid).all() as any
    let total = 0
    for (const evt of events) {
        const count = await autoAssignTeams(c.env.DB, parseInt(tid), evt.id, evt.category, evt.age_group, evt.level_group, { method })
        if (assign_groups) {
            await assignGroups(c.env.DB, evt.id, parseInt(tid), teams_per_group || 5, avoid_club_in_group !== false)
        }
        total += count
    }
    return c.json({ success: true, total_teams: total })
})

// Check merge
app.post('/:tid/events/check-merge', async (c) => {
    const tid = c.req.param('tid')
    const tournament = await c.env.DB.prepare('SELECT merge_threshold, sport_type FROM tournaments WHERE id = ?').bind(tid).first() as any
    const threshold = tournament?.merge_threshold || 4
    const isTennis = tournament?.sport_type === 'tennis'

    const { results: events } = await c.env.DB.prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM teams t WHERE t.event_id = e.id) as team_count
     FROM events e WHERE e.tournament_id = ? AND e.merged_from IS NULL ORDER BY e.category, e.age_group, e.level_group`
    ).bind(tid).all() as any

    // Group by category+age_group
    const groups: Record<string, any[]> = {}
    for (const evt of events) {
        const key = `${evt.category}_${evt.age_group}`
        if (!groups[key]) groups[key] = []
        groups[key].push(evt)
    }

    const suggestions: any[] = []
    const levelOrder = isTennis ? ['오픈부', '신인부', '국화부', '개나리부', '베테랑부', '테린이', '테린이부'] : ['s', 'a', 'b', 'c', 'd', 'e']

    for (const [key, group] of Object.entries(groups)) {
        // Sort by level
        group.sort((a: any, b: any) => {
            let idxA = levelOrder.indexOf(a.level_group)
            let idxB = levelOrder.indexOf(b.level_group)
            if (idxA === -1) idxA = 99
            if (idxB === -1) idxB = 99
            return idxA - idxB
        })

        // Find events below threshold
        const needMerge = group.filter((e: any) => e.team_count < threshold && e.team_count > 0)
        if (needMerge.length < 2) continue

        // Try merging adjacent levels
        let i = 0
        while (i < needMerge.length) {
            const mergeGroup = [needMerge[i]]
            let totalTeams = needMerge[i].team_count
            let j = i + 1
            while (j < needMerge.length && totalTeams < threshold) {
                mergeGroup.push(needMerge[j])
                totalTeams += needMerge[j].team_count
                j++
            }
            if (mergeGroup.length >= 2) {
                const combinedLevels = mergeGroup.map((e: any) => e.level_group.toUpperCase()).join('+')
                const levelSuffix = (combinedLevels.endsWith('부') || combinedLevels.length > 5) ? '' : '급'
                suggestions.push({
                    events: mergeGroup,
                    total_teams: totalTeams,
                    merged_name: `${getCategoryLabel(mergeGroup[0].category)} ${mergeGroup[0].age_group} ${combinedLevels}${levelSuffix}`
                })
            }
            i = j
        }
    }

    return c.json({ threshold, suggestions })
})

// Execute merge
app.post('/:tid/events/execute-merge', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { event_ids, name: customName } = body

    if (!event_ids || event_ids.length < 2) return c.json({ error: 'Need at least 2 events' }, 400)

    // Get events info
    const placeholders = event_ids.map(() => '?').join(',')
    const { results: events } = await c.env.DB.prepare(
        `SELECT * FROM events WHERE id IN (${placeholders}) AND tournament_id = ?`
    ).bind(...event_ids, tid).all() as any

    if (events.length < 2) return c.json({ error: 'Events not found' }, 404)

    // Collect all players from all teams in these events
    const allPlayers: any[] = []
    for (const evt of events) {
        const { results: teams } = await c.env.DB.prepare(
            `SELECT t.*, p1.name as p1_name, p1.level as p1_level, p1.id as p1_id,
              p2.name as p2_name, p2.level as p2_level, p2.id as p2_id
       FROM teams t
       JOIN participants p1 ON t.player1_id = p1.id
       JOIN participants p2 ON t.player2_id = p2.id
       WHERE t.event_id = ?`
        ).bind(evt.id).all() as any
        for (const team of teams) {
            allPlayers.push({ id: team.p1_id, name: team.p1_name, level: team.p1_level })
            allPlayers.push({ id: team.p2_id, name: team.p2_name, level: team.p2_level })
        }
    }

    // Create merged event
    const mergedName = customName || events.map((e: any) => e.name).join(' + ')
    const levelGroups = events.map((e: any) => e.level_group)
    const result = await c.env.DB.prepare(
        'INSERT INTO events (tournament_id, category, age_group, level_group, name, merged_from) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tid, events[0].category, events[0].age_group, 'merged', mergedName, JSON.stringify(event_ids)).run()
    const newEventId = result.meta.last_row_id as number

    // Grade-balanced re-pairing
    const levelOrder = ['s', 'a', 'b', 'c', 'd', 'e']
    const uniquePlayers = Array.from(new Map(allPlayers.map(p => [p.id, p])).values())
    uniquePlayers.sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level))

    // Pair: top with bottom
    const newTeams: any[] = []
    const half = Math.ceil(uniquePlayers.length / 2)
    for (let i = 0; i < half; i++) {
        const p1 = uniquePlayers[i]
        const p2 = uniquePlayers[uniquePlayers.length - 1 - i]
        if (p1 && p2 && p1.id !== p2.id) {
            newTeams.push({ p1, p2 })
        }
    }

    // Insert new teams
    let teamCount = 0
    for (const team of newTeams) {
        const teamName = `${team.p1.name} · ${team.p2.name}`
        await c.env.DB.prepare(
            'INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)'
        ).bind(newEventId, tid, team.p1.id, team.p2.id, teamName).run()
        teamCount++
    }

    // Assign groups (5 teams per group with club avoidance)
    await assignGroups(c.env.DB, newEventId, parseInt(tid))

    // Delete old event teams/matches/standings
    for (const evt of events) {
        await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(evt.id).run()
        await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ?').bind(evt.id).run()
        await c.env.DB.prepare('DELETE FROM teams WHERE event_id = ?').bind(evt.id).run()
        await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(evt.id).run()
    }

    return c.json({ success: true, event_id: newEventId, teams: teamCount, name: mergedName })
})

// Unmerge event
app.post('/:tid/events/:eid/unmerge', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ? AND tournament_id = ?').bind(eid, tid).first() as any
    if (!event || !event.merged_from) return c.json({ error: 'Not a merged event' }, 400)

    const originalIds = JSON.parse(event.merged_from) as number[]

    // Get teams from merged event
    const { results: teams } = await c.env.DB.prepare('SELECT * FROM teams WHERE event_id = ?').bind(eid).all()

    // Restore original events (recreate)
    const restored: any[] = []
    for (const origId of originalIds) {
        // Try to get original event info from name
        const result = await c.env.DB.prepare(
            'INSERT INTO events (tournament_id, category, age_group, level_group, name) VALUES (?, ?, ?, ?, ?)'
        ).bind(tid, event.category, event.age_group, 'all', `복원된 종목 (원본 #${origId})`).run()
        restored.push(result.meta.last_row_id)
    }

    // Move teams to first restored event
    if (restored.length > 0 && teams.length > 0) {
        await c.env.DB.prepare('UPDATE teams SET event_id = ? WHERE event_id = ?').bind(restored[0], eid).run()
    }

    // Delete merged event
    await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(eid).run()
    await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ?').bind(eid).run()
    await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eid).run()

    return c.json({ success: true, restored_events: restored })
})

// Delete all assignments (teams/matches/standings, keep events)
app.delete('/:tid/events/all/assignments', async (c) => {
    const tid = c.req.param('tid')
    const { results: events } = await c.env.DB.prepare('SELECT id FROM events WHERE tournament_id = ?').bind(tid).all() as any
    let teamCount = 0, matchCount = 0, standingCount = 0

    for (const evt of events) {
        const s = await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(evt.id).run()
        standingCount += s.meta.changes || 0
        const m = await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ? AND tournament_id = ?').bind(evt.id, tid).run()
        matchCount += m.meta.changes || 0
        const t = await c.env.DB.prepare('DELETE FROM teams WHERE event_id = ? AND tournament_id = ?').bind(evt.id, tid).run()
        teamCount += t.meta.changes || 0
    }

    return c.json({ success: true, deleted: { teams: teamCount, matches: matchCount, standings: standingCount } })
})

// Delete everything (events + teams + matches + standings)
app.delete('/:tid/events/all/everything', async (c) => {
    const tid = c.req.param('tid')
    const { results: events } = await c.env.DB.prepare('SELECT id FROM events WHERE tournament_id = ?').bind(tid).all() as any
    let eventCount = 0, teamCount = 0, matchCount = 0, standingCount = 0

    for (const evt of events) {
        const s = await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(evt.id).run()
        standingCount += s.meta.changes || 0
        const m = await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ?').bind(evt.id).run()
        matchCount += m.meta.changes || 0
        const t = await c.env.DB.prepare('DELETE FROM teams WHERE event_id = ?').bind(evt.id).run()
        teamCount += t.meta.changes || 0
    }
    const e = await c.env.DB.prepare('DELETE FROM events WHERE tournament_id = ?').bind(tid).run()
    eventCount = e.meta.changes || 0

    return c.json({ success: true, deleted: { events: eventCount, teams: teamCount, matches: matchCount, standings: standingCount } })
})

// Assign groups for single event
app.post('/:tid/events/:eid/assign-groups', async (c) => {
    const tid = c.req.param('tid')
    const eid = c.req.param('eid')
    const body = await c.req.json() || {}
    const teamsPerGroup = body.teams_per_group || 5
    const avoidClub = body.avoid_club_in_group !== false
    const useElo = body.use_elo !== false  // 기본: Elo 균형 사용

    const analysis = await assignGroups(c.env.DB, parseInt(eid), parseInt(tid), teamsPerGroup, avoidClub, useElo)
    return c.json({ success: true, ...analysis })
})

// ── AI 조 편성 분석 ──────────────────────────────────────────
app.get('/:tid/events/:eid/group-analysis', async (c) => {
    const eid = c.req.param('eid')

    const { results: teams } = await c.env.DB.prepare(
        `SELECT t.*, p1.club as p1_club, p2.club as p2_club,
                p1.member_id as p1_mid, p2.member_id as p2_mid,
                m1.elo_rating as p1_elo, m2.elo_rating as p2_elo
         FROM teams t
         JOIN participants p1 ON t.player1_id = p1.id
         JOIN participants p2 ON t.player2_id = p2.id
         LEFT JOIN members m1 ON p1.member_id = m1.id
         LEFT JOIN members m2 ON p2.member_id = m2.id
         WHERE t.event_id = ? ORDER BY t.group_num, t.id`
    ).bind(eid).all() as any

    if (teams.length === 0) return c.json({ error: '팀이 없습니다.' }, 404)

    // 조별 분석
    const groupMap: Record<number, any[]> = {}
    for (const t of teams) {
        const g = t.group_num || 0
        if (!groupMap[g]) groupMap[g] = []
        const teamElo = Math.round(((t.p1_elo ?? 1500) + (t.p2_elo ?? 1500)) / 2)
        groupMap[g].push({ ...t, team_elo: teamElo })
    }

    const groupStats = Object.entries(groupMap).map(([groupNum, groupTeams]) => {
        const elos = groupTeams.map((t: any) => t.team_elo)
        const avg = Math.round(elos.reduce((a: number, b: number) => a + b, 0) / elos.length)
        const std = Math.round(Math.sqrt(elos.reduce((sq: number, elo: number) => sq + Math.pow(elo - avg, 2), 0) / elos.length))
        const clubs = [...new Set(groupTeams.flatMap((t: any) => [t.p1_club, t.p2_club].filter(Boolean)))]
        const clubDups = groupTeams.length - clubs.length

        return {
            group: parseInt(groupNum),
            teams: groupTeams.length,
            avg_elo: avg,
            min_elo: Math.min(...elos),
            max_elo: Math.max(...elos),
            elo_std: std,
            club_duplicates: Math.max(clubDups, 0),
            team_details: groupTeams.map((t: any) => ({
                id: t.id, name: t.team_name, elo: t.team_elo,
                clubs: [t.p1_club, t.p2_club].filter(Boolean).join('/')
            }))
        }
    })

    // 전체 조 간 균형도
    const avgElos = groupStats.map(g => g.avg_elo)
    const overallAvg = Math.round(avgElos.reduce((a, b) => a + b, 0) / avgElos.length)
    const groupSpread = Math.max(...avgElos) - Math.min(...avgElos)
    const balanceScore = groupSpread <= 30 ? 'A' : groupSpread <= 60 ? 'B' : groupSpread <= 100 ? 'C' : 'D'

    const insights: string[] = []
    insights.push(`📊 조 간 평균 Elo 편차: ±${groupSpread} (등급: ${balanceScore})`)
    if (balanceScore === 'A') insights.push(`✅ 매우 균형 잡힌 조 편성입니다!`)
    else if (balanceScore === 'D') insights.push(`⚠️ 조 간 실력 차이가 큽니다. Elo 균형 재배정을 추천합니다.`)

    const totalClubDups = groupStats.reduce((s, g) => s + g.club_duplicates, 0)
    if (totalClubDups === 0) insights.push(`✅ 같은 클럽 소속이 같은 조에 없습니다.`)
    else insights.push(`🔄 ${totalClubDups}건의 같은 클럽 중복이 있습니다.`)

    return c.json({
        total_teams: teams.length,
        total_groups: groupStats.length,
        overall_avg_elo: overallAvg,
        group_spread: groupSpread,
        balance_grade: balanceScore,
        groups: groupStats,
        insights
    })
})

// Helper functions
function generateEventName(category: string, ageGroup: string, levelGroup: string): string {
    const catLabel = getCategoryLabel(category)
    const ageLabel = ageGroup === 'open' ? '오픈' : ageGroup
    const levelLabel = levelGroup === 'all' ? '전체급' : (levelGroup.length > 2 || levelGroup.endsWith('부') ? levelGroup : `${levelGroup.toUpperCase()}급`)
    return `${catLabel} ${ageLabel} ${levelLabel}`
}

function getCategoryLabel(category: string): string {
    switch (category) {
        case 'md': return '남자복식'
        case 'wd': return '여자복식'
        case 'xd': return '혼합복식'
        default: return category
    }
}

async function autoAssignTeams(db: D1Database, tid: number, eid: number, category: string, ageGroup: string, levelGroup: string, options?: { method?: string }): Promise<number> {
    // Check existing teams
    const existing = await db.prepare('SELECT COUNT(*) as cnt FROM teams WHERE event_id = ?').bind(eid).first() as any
    if (existing.cnt > 0) return 0

    const ageFilter = getAgeFilter(ageGroup)
    let genderFilter = ''
    if (category === 'md') genderFilter = "AND gender = 'm'"
    else if (category === 'wd') genderFilter = "AND gender = 'f'"

    let levelFilter = ''
    if (levelGroup !== 'all' && levelGroup !== 'merged') {
        levelFilter = `AND level = '${levelGroup}'`
    }

    let sortSql = 'ORDER BY level, RANDOM()' // Default level priority
    if (options?.method === 'club') sortSql = 'ORDER BY club, level, RANDOM()'
    else if (options?.method === 'random') sortSql = 'ORDER BY RANDOM()'

    if (category === 'xd') {
        const { results: malesRaw } = await db.prepare(
            `SELECT * FROM participants WHERE tournament_id = ? AND deleted = 0 AND gender = 'm' AND wants_mixed = 1 AND ${ageFilter} ${levelFilter} ${sortSql}`
        ).bind(tid).all() as any
        const { results: femalesRaw } = await db.prepare(
            `SELECT * FROM participants WHERE tournament_id = ? AND deleted = 0 AND gender = 'f' AND wants_mixed = 1 AND ${ageFilter} ${levelFilter} ${sortSql}`
        ).bind(tid).all() as any

        let males = [...malesRaw]
        let females = [...femalesRaw]
        let count = 0

        // Match partners (Male -> Female or Female -> Male)
        let matched = true
        while (matched) {
            matched = false
            for (let i = 0; i < males.length; i++) {
                const m = males[i]
                const fIdx = females.findIndex((f: any) =>
                    (m.partner && f.name === m.partner) || (f.partner && f.partner === m.name) || (m.partner && f.partner && m.partner === f.name && f.partner === m.name)
                )
                if (fIdx !== -1) {
                    const f = females[fIdx]
                    const teamName = `${m.name} · ${f.name}`
                    await db.prepare('INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)').bind(eid, tid, m.id, f.id, teamName).run()
                    count++
                    males.splice(i, 1)
                    females.splice(fIdx, 1)
                    matched = true
                    break
                }
            }
        }

        // Remaining random matches
        const pairs = Math.min(males.length, females.length)
        for (let i = 0; i < pairs; i++) {
            const teamName = `${males[i].name} · ${females[i].name}`
            await db.prepare(
                'INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)'
            ).bind(eid, tid, males[i].id, females[i].id, teamName).run()
            count++
        }
        return count
    }

    // Same gender doubles
    const { results: playersRaw } = await db.prepare(
        `SELECT * FROM participants WHERE tournament_id = ? AND deleted = 0 ${genderFilter} ${levelFilter} AND ${ageFilter} ${sortSql}`
    ).bind(tid).all() as any

    let players = [...playersRaw]
    let count = 0

    // Match requested partners
    let matched = true
    while (matched) {
        matched = false
        for (let i = 0; i < players.length; i++) {
            const p1 = players[i]
            const j = players.findIndex((p2: any, idx: number) =>
                idx !== i && ((p1.partner && p2.name === p1.partner) || (p2.partner && p2.partner === p1.name))
            )
            if (j !== -1) {
                const p2 = players[j]
                const teamName = `${p1.name} · ${p2.name}`
                await db.prepare('INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)').bind(eid, tid, p1.id, p2.id, teamName).run()
                count++
                players = players.filter(p => p.id !== p1.id && p.id !== p2.id)
                matched = true
                break
            }
        }
    }

    // Remaining random matches
    for (let i = 0; i + 1 < players.length; i += 2) {
        const teamName = `${players[i].name} · ${players[i + 1].name}`
        await db.prepare(
            'INSERT INTO teams (event_id, tournament_id, player1_id, player2_id, team_name) VALUES (?, ?, ?, ?, ?)'
        ).bind(eid, tid, players[i].id, players[i + 1].id, teamName).run()
        count++
    }
    return count
}

// ── 조 편성: Elo 균형 + 클럽 회피 동시 최적화 ────────────────
async function assignGroups(
    db: D1Database, eventId: number, tid: number,
    teamsPerGroup = 5, avoidClub = true, useElo = true
): Promise<{ balance_grade?: string; group_spread?: number }> {
    const { results: teams } = await db.prepare(
        `SELECT t.*, p1.club as p1_club, p2.club as p2_club,
                p1.member_id as p1_mid, p2.member_id as p2_mid
         FROM teams t
         JOIN participants p1 ON t.player1_id = p1.id
         JOIN participants p2 ON t.player2_id = p2.id
         WHERE t.event_id = ?`
    ).bind(eventId).all() as any

    if (teams.length === 0) return {}

    // 팀별 Elo 계산
    const teamsWithElo: any[] = []
    for (const team of teams) {
        let teamElo = 1500  // 기본값
        if (useElo && (team.p1_mid || team.p2_mid)) {
            const elos: number[] = []
            if (team.p1_mid) {
                const m = await db.prepare('SELECT elo_rating FROM members WHERE id = ?').bind(team.p1_mid).first() as any
                if (m?.elo_rating) elos.push(m.elo_rating)
            }
            if (team.p2_mid) {
                const m = await db.prepare('SELECT elo_rating FROM members WHERE id = ?').bind(team.p2_mid).first() as any
                if (m?.elo_rating) elos.push(m.elo_rating)
            }
            if (elos.length > 0) teamElo = Math.round(elos.reduce((a, b) => a + b, 0) / elos.length)
        }
        teamsWithElo.push({ ...team, team_elo: teamElo })
    }

    const numGroups = Math.ceil(teamsWithElo.length / teamsPerGroup)
    const groups: any[][] = Array.from({ length: numGroups }, () => [])

    if (useElo) {
        // ── 스네이크 드래프트 + 클럽 회피 ──
        // Elo 높은 순으로 정렬 → 스네이크 패턴으로 분배 → 클럽 충돌 최소화
        teamsWithElo.sort((a, b) => b.team_elo - a.team_elo)

        for (let i = 0; i < teamsWithElo.length; i++) {
            const team = teamsWithElo[i]
            const snakeRound = Math.floor(i / numGroups)
            const posInRound = i % numGroups
            // 스네이크: 짝수 라운드 정순, 홀수 라운드 역순
            const targetGroup = snakeRound % 2 === 0 ? posInRound : (numGroups - 1 - posInRound)

            if (avoidClub) {
                // 클럽 충돌 확인 — 충돌 시 인접 조와 스왑 시도
                let bestGroup = targetGroup
                let minConflict = countClubConflicts(groups[targetGroup], team)

                // 인접 조±1 에서 더 나은 곳 탐색
                for (const delta of [-1, 1]) {
                    const altGroup = targetGroup + delta
                    if (altGroup >= 0 && altGroup < numGroups) {
                        const altConflict = countClubConflicts(groups[altGroup], team)
                        // 크기가 같거나 작을 때만 이동 (균형 유지)
                        if (altConflict < minConflict && groups[altGroup].length <= groups[bestGroup].length) {
                            minConflict = altConflict
                            bestGroup = altGroup
                        }
                    }
                }
                groups[bestGroup].push(team)
            } else {
                groups[targetGroup].push(team)
            }
        }
    } else {
        // 기존 랜덤 방식 (클럽 회피만)
        const shuffled = [...teamsWithElo].sort(() => Math.random() - 0.5)
        for (const team of shuffled) {
            let bestGroup = 0
            let minConflicts = Infinity
            let minSize = Infinity

            for (let g = 0; g < numGroups; g++) {
                if (groups[g].length >= teamsPerGroup && groups.some(x => x.length < teamsPerGroup)) continue

                const conflicts = avoidClub ? countClubConflicts(groups[g], team) : 0

                if (conflicts < minConflicts || (conflicts === minConflicts && groups[g].length < minSize)) {
                    minConflicts = conflicts
                    minSize = groups[g].length
                    bestGroup = g
                }
            }
            groups[bestGroup].push(team)
        }
    }

    // Update group numbers
    for (let g = 0; g < groups.length; g++) {
        for (const team of groups[g]) {
            await db.prepare('UPDATE teams SET group_num = ? WHERE id = ?').bind(g + 1, team.id).run()
        }
    }

    // 균형도 분석 반환
    const avgElos = groups.map(g => {
        const elos = g.map((t: any) => t.team_elo)
        return elos.length > 0 ? Math.round(elos.reduce((a: number, b: number) => a + b, 0) / elos.length) : 1500
    })
    const groupSpread = Math.max(...avgElos) - Math.min(...avgElos)
    const balanceScore = groupSpread <= 30 ? 'A' : groupSpread <= 60 ? 'B' : groupSpread <= 100 ? 'C' : 'D'

    return { balance_grade: balanceScore, group_spread: groupSpread }
}

function countClubConflicts(group: any[], team: any): number {
    return group.filter((t: any) =>
        (t.p1_club && t.p1_club === team.p1_club) || (t.p2_club && t.p2_club === team.p2_club) ||
        (t.p1_club && t.p1_club === team.p2_club) || (t.p2_club && t.p2_club === team.p1_club)
    ).length
}

export default app
