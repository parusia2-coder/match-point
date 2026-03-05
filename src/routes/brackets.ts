import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// Generate brackets
app.post('/:tid/brackets/generate', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { format, event_id, groups, teamsPerGroup } = body

    const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ? AND tournament_id = ?').bind(event_id, tid).first() as any
    if (!event) return c.json({ error: 'Event not found' }, 404)

    // Get teams
    const { results: teams } = await c.env.DB.prepare(
        'SELECT * FROM teams WHERE event_id = ? ORDER BY group_num, id'
    ).bind(event_id).all() as any

    if (teams.length < 2) return c.json({ error: 'Need at least 2 teams' }, 400)

    // Delete existing matches for this event (non-finals)
    await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ? AND tournament_id = ? AND round < 900').bind(event_id, tid).run()
    await c.env.DB.prepare('DELETE FROM standings WHERE event_id = ?').bind(event_id).run()

    const tournament = await c.env.DB.prepare('SELECT courts FROM tournaments WHERE id = ?').bind(tid).first() as any
    let numCourts = tournament?.courts || 6
    let venueId: number | null = null

    if (event.venue_id) {
        const venue = await c.env.DB.prepare('SELECT courts_count FROM venues WHERE id = ?').bind(event.venue_id).first() as any
        if (venue) {
            numCourts = venue.courts_count || 1
            venueId = event.venue_id
        }
    }

    let matchesCreated = 0

    if (format === 'tournament') {
        // Single elimination
        matchesCreated = await generateTournamentBracket(c.env.DB, parseInt(tid), event_id, teams, numCourts, venueId)
    } else if (format === 'double_elim') {
        // Double elimination
        matchesCreated = await generateDoubleElimination(c.env.DB, parseInt(tid), event_id, teams, numCourts, venueId)
    } else if (format === 'league') {
        // Full round-robin (all vs all)
        matchesCreated = await generateRoundRobin(c.env.DB, parseInt(tid), event_id, teams, numCourts, venueId)
    } else {
        // KDK or group-based
        if (groups && groups > 0) {
            matchesCreated = await generateGroupMatches(c.env.DB, parseInt(tid), event_id, teams, numCourts, parseInt(groups), teamsPerGroup || 5, venueId)
        } else {
            matchesCreated = await generateKDK(c.env.DB, parseInt(tid), event_id, teams, numCourts, tournament?.games_per_player || 4, venueId)
        }
    }

    return c.json({ success: true, matches_created: matchesCreated })
})

// Generate finals
app.post('/:tid/brackets/generate-finals', async (c) => {
    const tid = c.req.param('tid')
    const body = await c.req.json()
    const { event_id, topN } = body
    const top = topN || 2

    const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(event_id).first() as any
    if (!event) return c.json({ error: 'Event not found' }, 404)

    // Delete existing finals
    await c.env.DB.prepare('DELETE FROM matches WHERE event_id = ? AND tournament_id = ? AND round >= 900').bind(event_id, tid).run()

    // Get groups
    const { results: teams } = await c.env.DB.prepare(
        'SELECT DISTINCT group_num FROM teams WHERE event_id = ? AND group_num IS NOT NULL ORDER BY group_num'
    ).bind(event_id).all() as any

    const qualifiedTeams: any[] = []

    if (teams.length === 0) {
        // No groups — use all teams ranked by standings
        const { results: allTeams } = await c.env.DB.prepare(
            `SELECT t.id, t.team_name, t.group_num, 
         COALESCE(s.points, 0) as points,
         COALESCE(s.goal_difference, 0) as goal_difference,
         COALESCE(s.score_for, 0) as score_for
       FROM teams t
       LEFT JOIN standings s ON t.id = s.team_id AND s.event_id = ?
       WHERE t.event_id = ?
       ORDER BY points DESC, goal_difference DESC, score_for DESC`
        ).bind(event_id, event_id).all() as any
        qualifiedTeams.push(...allTeams.slice(0, top * 2)) // take enough for a bracket
    } else {
        // Get top N from each group
        for (const g of teams) {
            const { results: groupTeams } = await c.env.DB.prepare(
                `SELECT t.id, t.team_name, t.group_num,
           COALESCE(s.points, 0) as points,
           COALESCE(s.goal_difference, 0) as goal_difference,
           COALESCE(s.score_for, 0) as score_for
         FROM teams t
         LEFT JOIN standings s ON t.id = s.team_id AND s.event_id = ?
         WHERE t.event_id = ? AND t.group_num = ?
         ORDER BY points DESC, goal_difference DESC, score_for DESC
         LIMIT ?`
            ).bind(event_id, event_id, g.group_num, top).all() as any
            qualifiedTeams.push(...groupTeams)
        }
    }

    if (qualifiedTeams.length < 2) return c.json({ error: 'Not enough teams' }, 400)

    const tournament = await c.env.DB.prepare('SELECT courts FROM tournaments WHERE id = ?').bind(tid).first() as any
    let numCourts = tournament?.courts || 6
    let venueId: number | null = null

    if (event.venue_id) {
        const venue = await c.env.DB.prepare('SELECT courts_count FROM venues WHERE id = ?').bind(event.venue_id).first() as any
        if (venue) {
            numCourts = venue.courts_count || 1
            venueId = event.venue_id
        }
    }

    // Seed: cross-group matching (1st of group A vs 2nd of group B etc)
    const seeded = crossSeed(qualifiedTeams, teams.length > 0)

    // Generate single elimination bracket (rounds 900+)
    const numTeams = seeded.length
    const bracketSize = nextPowerOf2(numTeams)
    let round = 900
    let matchOrder = 1
    let courtIdx = 0

    // First round with BYEs
    const firstRoundPairs: { team1: any, team2: any }[] = []
    for (let i = 0; i < bracketSize; i += 2) {
        firstRoundPairs.push({
            team1: seeded[i] || null,
            team2: seeded[i + 1] || null
        })
    }

    let matchesCreated = 0
    for (const pair of firstRoundPairs) {
        const t1Id = pair.team1?.id || null
        const t2Id = pair.team2?.id || null
        if (!t1Id && !t2Id) continue

        courtIdx = (courtIdx % numCourts) + 1
        const status = (!t1Id || !t2Id) ? 'completed' : 'pending'
        const winner = !t1Id ? 2 : (!t2Id ? 1 : null)

        await c.env.DB.prepare(
            `INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, status, winner_team, venue_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(tid, event_id, round, matchOrder++, courtIdx, t1Id, t2Id, status, winner, venueId).run()
        matchesCreated++
    }

    // Subsequent rounds (empty for now — filled as matches complete)
    let matchesInRound = Math.ceil(firstRoundPairs.length / 2)
    while (matchesInRound >= 1) {
        round++
        for (let i = 0; i < matchesInRound; i++) {
            courtIdx = (courtIdx % numCourts) + 1
            await c.env.DB.prepare(
                `INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, status, venue_id)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
            ).bind(tid, event_id, round, i + 1, courtIdx, venueId).run()
            matchesCreated++
        }
        if (matchesInRound === 1) break
        matchesInRound = Math.ceil(matchesInRound / 2)
    }

    return c.json({ success: true, qualified: qualifiedTeams.length, matches_created: matchesCreated })
})

// Finals preview
app.get('/:tid/brackets/finals-preview', async (c) => {
    const tid = c.req.param('tid')
    const eventId = c.req.query('event_id')
    const topN = parseInt(c.req.query('topN') || '2')

    if (!eventId) return c.json({ error: 'event_id required' }, 400)

    const { results: groups } = await c.env.DB.prepare(
        'SELECT DISTINCT group_num FROM teams WHERE event_id = ? AND group_num IS NOT NULL ORDER BY group_num'
    ).bind(eventId).all() as any

    const qualified: any[] = []
    for (const g of groups) {
        const { results: teamsList } = await c.env.DB.prepare(
            `SELECT t.id, t.team_name, t.group_num,
         COALESCE(s.points, 0) as points,
         COALESCE(s.goal_difference, 0) as gd,
         COALESCE(s.score_for, 0) as sf
       FROM teams t
       LEFT JOIN standings s ON t.id = s.team_id AND s.event_id = ?
       WHERE t.event_id = ? AND t.group_num = ?
       ORDER BY points DESC, gd DESC, sf DESC LIMIT ?`
        ).bind(eventId, eventId, g.group_num, topN).all()
        qualified.push(...teamsList)
    }

    return c.json({ qualified, total: qualified.length })
})

// Helper functions

function nextPowerOf2(n: number): number {
    let p = 1
    while (p < n) p *= 2
    return p
}

function crossSeed(teams: any[], hasGroups: boolean): any[] {
    if (!hasGroups || teams.length <= 2) return teams

    // Group by group_num
    const byGroup: Record<number, any[]> = {}
    for (const t of teams) {
        const g = t.group_num || 0
        if (!byGroup[g]) byGroup[g] = []
        byGroup[g].push(t)
    }

    const groupNums = Object.keys(byGroup).map(Number).sort()
    if (groupNums.length < 2) return teams

    // Cross seed: interleave 1st of each group, then 2nd, etc.
    const seeded: any[] = []
    const maxPerGroup = Math.max(...Object.values(byGroup).map(g => g.length))

    for (let rank = 0; rank < maxPerGroup; rank++) {
        const order = rank % 2 === 0 ? groupNums : [...groupNums].reverse()
        for (const g of order) {
            if (byGroup[g][rank]) seeded.push(byGroup[g][rank])
        }
    }

    return seeded
}

async function generateTournamentBracket(db: D1Database, tid: number, eventId: number, teams: any[], numCourts: number, venueId: number | null): Promise<number> {
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    const bracketSize = nextPowerOf2(shuffled.length)

    let matchOrder = 1
    let courtIdx = 0
    let matchesCreated = 0

    for (let i = 0; i < bracketSize; i += 2) {
        const t1 = shuffled[i] || null
        const t2 = shuffled[i + 1] || null
        if (!t1 && !t2) continue

        courtIdx = (courtIdx % numCourts) + 1
        const status = (!t1 || !t2) ? 'completed' : 'pending'
        const winner = !t1 ? 2 : (!t2 ? 1 : null)

        await db.prepare(
            'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, status, winner_team, group_num, venue_id) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, eventId, matchOrder++, courtIdx, t1?.id || null, t2?.id || null, status, winner, teams[0]?.group_num || null, venueId).run()
        matchesCreated++
    }

    return matchesCreated
}

async function generateRoundRobin(db: D1Database, tid: number, eventId: number, teams: any[], numCourts: number, venueId: number | null): Promise<number> {
    let matchOrder = 1
    let courtIdx = 0
    let matchesCreated = 0
    const n = teams.length
    const rounds = n % 2 === 0 ? n - 1 : n

    for (let round = 1; round <= rounds; round++) {
        for (let i = 0; i < Math.floor(n / 2); i++) {
            let home, away
            if (round === 1) {
                home = i
                away = n - 1 - i
            } else {
                home = (round - 1 + i) % (n - 1)
                away = (n - 2 - i + round - 1) % (n - 1)
                if (i === 0) away = n - 1
            }
            if (home >= n || away >= n || home === away) continue

            courtIdx = (courtIdx % numCourts) + 1
            await db.prepare(
                'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, group_num, venue_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(tid, eventId, round, matchOrder++, courtIdx, teams[home].id, teams[away].id, teams[home].group_num || null, venueId).run()
            matchesCreated++
        }
    }
    return matchesCreated
}

async function generateGroupMatches(db: D1Database, tid: number, eventId: number, teams: any[], numCourts: number, numGroups: number, teamsPerGroup: number, venueId: number | null): Promise<number> {
    // Group teams
    const groups: Record<number, any[]> = {}
    for (const t of teams) {
        const g = t.group_num || 1
        if (!groups[g]) groups[g] = []
        groups[g].push(t)
    }

    let matchOrder = 1
    let courtIdx = 0
    let matchesCreated = 0

    for (const [groupNum, groupTeams] of Object.entries(groups)) {
        // Round robin within group
        for (let i = 0; i < groupTeams.length; i++) {
            for (let j = i + 1; j < groupTeams.length; j++) {
                courtIdx = (courtIdx % numCourts) + 1
                const round = Math.floor(matchOrder / numCourts) + 1
                await db.prepare(
                    'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, group_num, venue_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(tid, eventId, round, matchOrder++, courtIdx, groupTeams[i].id, groupTeams[j].id, parseInt(groupNum), venueId).run()
                matchesCreated++
            }
        }
    }
    return matchesCreated
}

async function generateKDK(db: D1Database, tid: number, eventId: number, teams: any[], numCourts: number, gamesPerPlayer: number, venueId: number | null): Promise<number> {
    // KDK: each team plays gamesPerPlayer matches
    const matchups: [number, number][] = []

    // Generate all possible matchups
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            matchups.push([i, j])
        }
    }

    // Shuffle
    matchups.sort(() => Math.random() - 0.5)

    // Select matches so each team plays at most gamesPerPlayer
    const teamMatchCount: Record<number, number> = {}
    const selectedMatchups: [number, number][] = []

    for (const [i, j] of matchups) {
        const ci = teamMatchCount[i] || 0
        const cj = teamMatchCount[j] || 0
        if (ci < gamesPerPlayer && cj < gamesPerPlayer) {
            selectedMatchups.push([i, j])
            teamMatchCount[i] = ci + 1
            teamMatchCount[j] = cj + 1
        }
    }

    let matchOrder = 1
    let courtIdx = 0
    let matchesCreated = 0
    const groupNum = teams[0]?.group_num || null

    for (const [i, j] of selectedMatchups) {
        courtIdx = (courtIdx % numCourts) + 1
        const round = Math.ceil(matchOrder / numCourts)
        await db.prepare(
            'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, group_num, venue_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, eventId, round, matchOrder++, courtIdx, teams[i].id, teams[j].id, groupNum, venueId).run()
        matchesCreated++
    }

    return matchesCreated
}

async function generateDoubleElimination(db: D1Database, tid: number, eventId: number, teams: any[], numCourts: number, venueId: number | null): Promise<number> {
    // ── 더블 엘리미네이션 ─────────────────────────────────────────
    // Winners bracket: round  1 ~ 49
    // Losers bracket:  round 50 ~ 98
    // Grand Final:     round 99
    // ─────────────────────────────────────────────────────────────
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    const bracketSize = nextPowerOf2(shuffled.length)
    let matchOrder = 1
    let courtIdx = 0
    let matchesCreated = 0

    // ── Winners bracket Round 1 ────────────────────────────────
    const wRound1Teams: (any | null)[] = []
    for (let i = 0; i < bracketSize; i += 2) {
        const t1 = shuffled[i] || null
        const t2 = shuffled[i + 1] || null
        wRound1Teams.push(t1, t2) // keep pairs

        if (!t1 && !t2) continue
        courtIdx = (courtIdx % numCourts) + 1
        const status = (!t1 || !t2) ? 'completed' : 'pending'
        const winner = !t1 ? 2 : (!t2 ? 1 : null)
        await db.prepare(
            'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, team1_id, team2_id, status, winner_team, venue_id) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, eventId, matchOrder++, courtIdx, t1?.id || null, t2?.id || null, status, winner, venueId).run()
        matchesCreated++
    }

    // ── Winners bracket subsequent rounds (placeholder) ────────
    let wMatchesInRound = Math.ceil((bracketSize / 2) / 2)
    let wRound = 2
    while (wMatchesInRound >= 1 && wRound < 49) {
        for (let i = 0; i < wMatchesInRound; i++) {
            courtIdx = (courtIdx % numCourts) + 1
            await db.prepare(
                'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, status, venue_id) VALUES (?, ?, ?, ?, ?, \'pending\', ?)'
            ).bind(tid, eventId, wRound, i + 1, courtIdx, venueId).run()
            matchesCreated++
        }
        if (wMatchesInRound === 1) break
        wMatchesInRound = Math.ceil(wMatchesInRound / 2)
        wRound++
    }

    // ── Losers bracket rounds (placeholder) ───────────────────
    // First losers round gets the R1 losers: bracketSize/2 teams → bracketSize/4 matches
    let lMatchesInRound = Math.ceil(bracketSize / 4)
    let lRound = 50
    while (lMatchesInRound >= 1 && lRound < 98) {
        for (let i = 0; i < lMatchesInRound; i++) {
            courtIdx = (courtIdx % numCourts) + 1
            await db.prepare(
                'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, status, venue_id) VALUES (?, ?, ?, ?, ?, \'pending\', ?)'
            ).bind(tid, eventId, lRound, i + 1, courtIdx, venueId).run()
            matchesCreated++
        }
        if (lMatchesInRound === 1) break
        lMatchesInRound = Math.ceil(lMatchesInRound / 2)
        lRound++
    }

    // ── Grand Final (round 99) ─────────────────────────────────
    courtIdx = (courtIdx % numCourts) + 1
    await db.prepare(
        'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, status, venue_id) VALUES (?, ?, 99, 1, ?, \'pending\', ?)'
    ).bind(tid, eventId, courtIdx, venueId).run()
    matchesCreated++

    // Grand Final Reset (99-2) — played only if loser wins GF
    await db.prepare(
        'INSERT INTO matches (tournament_id, event_id, round, match_order, court_number, status, venue_id) VALUES (?, ?, 99, 2, ?, \'pending\', ?)'
    ).bind(tid, eventId, courtIdx, venueId).run()
    matchesCreated++

    return matchesCreated
}

// ── Bracket Visualization API ──────────────────────────────────────────────
// GET /:tid/brackets/tree?event_id=N
// Returns structured data for frontend bracket tree rendering
app.get('/:tid/brackets/tree', async (c) => {
    const tid = c.req.param('tid')
    const eventId = c.req.query('event_id')
    if (!eventId) return c.json({ error: 'event_id required' }, 400)

    const { results: allMatches } = await c.env.DB.prepare(`
        SELECT m.*,
          t1.team_name as team1_name,
          t2.team_name as team2_name,
          t1p1.name as t1p1_name, t1p2.name as t1p2_name,
          t2p1.name as t2p1_name, t2p2.name as t2p2_name
        FROM matches m
        LEFT JOIN teams t1 ON m.team1_id = t1.id
        LEFT JOIN teams t2 ON m.team2_id = t2.id
        LEFT JOIN participants t1p1 ON t1.player1_id = t1p1.id
        LEFT JOIN participants t1p2 ON t1.player2_id = t1p2.id
        LEFT JOIN participants t2p1 ON t2.player1_id = t2p1.id
        LEFT JOIN participants t2p2 ON t2.player2_id = t2p2.id
        WHERE m.tournament_id = ? AND m.event_id = ?
        ORDER BY m.round, m.match_order
    `).bind(tid, eventId).all() as any

    // Determine bracket type
    const hasFinals = allMatches.some((m: any) => m.round >= 900)
    const hasDoubleElim = allMatches.some((m: any) => m.round >= 50 && m.round < 100)

    // Group by round
    const rounds: Record<number, any[]> = {}
    for (const m of allMatches) {
        if (!rounds[m.round]) rounds[m.round] = []
        rounds[m.round].push({
            id: m.id,
            round: m.round,
            match_order: m.match_order,
            court_number: m.court_number,
            team1: m.team1_name || (m.t1p1_name ? `${m.t1p1_name}·${m.t1p2_name}` : null),
            team2: m.team2_name || (m.t2p1_name ? `${m.t2p1_name}·${m.t2p2_name}` : null),
            score1: [m.team1_set1, m.team1_set2, m.team1_set3].filter((s: number) => s > 0),
            score2: [m.team2_set1, m.team2_set2, m.team2_set3].filter((s: number) => s > 0),
            winner: m.winner_team,
            status: m.status,
        })
    }

    // Separate sections
    const winnersRounds = Object.entries(rounds)
        .filter(([r]) => parseInt(r) < 50)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([r, ms]) => ({ round: parseInt(r), label: `${hasFinals ? '예선 ' : ''}${parseInt(r)}라운드`, matches: ms }))

    const losersRounds = Object.entries(rounds)
        .filter(([r]) => parseInt(r) >= 50 && parseInt(r) < 99)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([r, ms]) => ({ round: parseInt(r), label: `패자 ${parseInt(r) - 49}라운드`, matches: ms }))

    const grandFinal = rounds[99] ? { round: 99, label: '대결선', matches: rounds[99] } : null

    const finalsRounds = Object.entries(rounds)
        .filter(([r]) => parseInt(r) >= 900)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([r, ms]) => ({
            round: parseInt(r),
            label: (() => {
                const rn = parseInt(r) - 899
                if (rn === 1) return '결선 1라운드'
                const total = Object.keys(rounds).filter(x => parseInt(x) >= 900).length
                if (parseInt(r) === Math.max(...Object.keys(rounds).filter(x => parseInt(x) >= 900).map(Number))) return '결승'
                if (parseInt(r) === Math.max(...Object.keys(rounds).filter(x => parseInt(x) >= 900).map(Number)) - 1) return '준결승'
                return `결선 ${rn}라운드`
            })(),
            matches: ms
        }))

    return c.json({
        type: hasFinals ? 'finals' : hasDoubleElim ? 'double_elim' : 'single',
        winners: winnersRounds,
        losers: losersRounds.length > 0 ? losersRounds : null,
        grandFinal,
        finals: finalsRounds.length > 0 ? finalsRounds : null,
        total_matches: allMatches.length,
    })
})

export default app
