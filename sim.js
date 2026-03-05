import { execSync } from 'child_process';
const URL = 'http://127.0.0.1:8787';
const TID = 1;

async function fetchJson(path, init) {
    const r = await fetch(URL + path, init);
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return { error: text }; }
}

function updateNextMatchDB(nextId, teamId, isTeam1) {
    if (!teamId) return;
    const col = isTeam1 ? 'team1_id' : 'team2_id';
    const cmd = `npx wrangler d1 execute DB --local --command="UPDATE matches SET ${col} = ${teamId} WHERE id = ${nextId}"`;
    try { execSync(cmd, { stdio: 'pipe' }); } catch (e) { }
}

async function start() {
    let events = await fetchJson(`/api/tournaments/${TID}/events`);
    if (events.error || events.length === 0) return;

    // Play prelim matches
    let iterations = 0;
    while (iterations < 5) {
        iterations++;
        let curMatches = await fetchJson(`/api/tournaments/${TID}/matches`);
        let curPending = curMatches.filter(m => m.status !== 'completed' && m.round < 900);
        if (curPending.length === 0) break;
        for (const m of curPending) {
            if (!m.team1_id || !m.team2_id) continue;
            await fetchJson(`/api/tournaments/${TID}/matches/${m.id}/score`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team1_set1: 25, team2_set1: 21, winner_team: 1, status: 'completed' })
            });
        }
    }

    // generating finals
    for (const e of events) {
        let curMatches = await fetchJson(`/api/tournaments/${TID}/matches?event_id=${e.id}`);
        let p = curMatches.filter(m => m.status !== 'completed' && m.round < 900);
        let finals = curMatches.filter(m => m.round >= 900);
        if (p.length === 0 && finals.length === 0) {
            await fetchJson(`/api/tournaments/${TID}/brackets/generate-finals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: e.id, topN: 2 })
            });
        }
    }

    // Advance ALL completed finals matches to the next round if they haven't been already
    iterations = 0;
    while (iterations < 50) {
        iterations++;
        let curMatches = await fetchJson(`/api/tournaments/${TID}/matches`);

        let advancedAny = false;
        let completedFinals = curMatches.filter(m => m.status === 'completed' && m.round >= 900 && m.winner_team);
        for (const m of completedFinals) {
            const nextRound = m.round + 1;
            const nextOrder = Math.ceil(m.match_order / 2);
            const isTeam1 = (m.match_order % 2 !== 0);
            const actualWinnerId = (m.winner_team == 1 || m.winner_team === m.team1_id) ? m.team1_id : (m.winner_team == 2 || m.winner_team === m.team2_id ? m.team2_id : null);

            const nextM = curMatches.find(x => x.event_id === m.event_id && x.round === nextRound && x.match_order === nextOrder);
            if (nextM && actualWinnerId) {
                const existingTeamId = isTeam1 ? nextM.team1_id : nextM.team2_id;
                if (existingTeamId !== actualWinnerId) {
                    updateNextMatchDB(nextM.id, actualWinnerId, isTeam1);
                    advancedAny = true;
                }
            }
        }

        // Re-fetch after advancing
        if (advancedAny) {
            curMatches = await fetchJson(`/api/tournaments/${TID}/matches`);
        }

        let curPending = curMatches.filter(m => m.status !== 'completed' && m.round >= 900);
        let playedAny = false;

        for (const m of curPending) {
            if (!m.team1_id || !m.team2_id) continue;

            await fetchJson(`/api/tournaments/${TID}/matches/${m.id}/score`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team1_set1: 25, team2_set1: 19, winner_team: 1, status: 'completed' })
            });
            playedAny = true;
        }

        if (!playedAny && !advancedAny) break;
    }

    console.log("\n============= 🏸 대회 결과 시뮬레이션 ==============");
    let finalMatches = await fetchJson(`/api/tournaments/${TID}/matches`);
    let printed = finalMatches.filter(m => m.round >= 900).map(m => {
        let isFinal = !finalMatches.find(x => x.event_id === m.event_id && x.round > m.round);
        let actualWinnerName = (m.winner_team == 1 || m.winner_team == m.team1_id) ? m.team1_name : (m.winner_team == 2 || m.winner_team == m.team2_id ? m.team2_name : '진행중');

        return `[${m.event_name}] ${isFinal ? '결승전' : 'R' + m.round} | ${m.team1_name || '?'} vs ${m.team2_name || '?'} | 승자: ${actualWinnerName}`;
    });
    const evts = [...new Set(printed.map(p => p.split(']')[0] + ']'))];
    evts.forEach(ev => {
        console.log(`\n🏆 ${ev}`);
        printed.filter(p => p.startsWith(ev)).forEach(p => console.log('  ' + p.replace(ev + ' ', '')));
    });
    console.log("\n모든 대진과 경기가 결승까지 정상적으로 생성 및 진행 완료되었습니다!");
}

start().catch(e => console.error(e));
