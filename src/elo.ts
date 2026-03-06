// src/elo.ts
// ── Elo 레이팅 엔진 ──────────────────────────────────────────
// Phase 3: AI 강화 로드맵 - 경기 완료 시 자동 Elo 업데이트
//
// 특징:
//   - K-factor: 경기 수에 따라 동적 조절 (신규 32 → 안정 16)
//   - 복식 대응: 팀 평균 Elo 기반
//   - 스코어 차이 보너스: 일방적 승리 시 추가 가중
//   - 최소 Elo 100 보장 (바닥 방지)

// ── Elo 계산 핵심 ──
export function calculateElo(
    winnerElo: number,
    loserElo: number,
    scoreDiff: number = 0,
    winnerGames: number = 0,
    loserGames: number = 0
): { winnerNew: number; loserNew: number; winnerDelta: number; loserDelta: number } {
    // K-factor: 경기 수 적을수록 크게 변동
    const getK = (games: number): number => {
        if (games < 10) return 40   // 신규: 빠르게 자리잡기
        if (games < 30) return 32   // 초기: 활발한 변동
        if (games < 60) return 24   // 중기: 안정화 중
        return 16                    // 안정: 소폭 변동
    }

    const winnerK = getK(winnerGames)
    const loserK = getK(loserGames)

    // 기대 승률 계산
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
    const expectedLoser = 1 - expectedWinner

    // 스코어 차이에 따른 가중치 (접전 vs 일방적)
    // scoreDiff: 내 총점 - 상대 총점 (승자 기준)
    let marginMultiplier = 1.0
    if (scoreDiff > 0) {
        // ln 기반 가중치: 큰 스코어 차이일수록 보너스 (상한 있음)
        marginMultiplier = Math.min(1.0 + Math.log(1 + scoreDiff) * 0.1, 1.5)
    }

    // Elo 변동 계산
    const winnerDelta = Math.round(winnerK * (1 - expectedWinner) * marginMultiplier)
    const loserDelta = Math.round(loserK * (0 - expectedLoser) * marginMultiplier)

    const winnerNew = Math.max(winnerElo + winnerDelta, 100)
    const loserNew = Math.max(loserElo + loserDelta, 100)

    return {
        winnerNew,
        loserNew,
        winnerDelta: winnerNew - winnerElo,
        loserDelta: loserNew - loserElo
    }
}

// ── DB 연동: 경기 완료 시 Elo 업데이트 ──
export async function updateEloAfterMatch(
    db: D1Database,
    matchId: number,
    tid: number,
    scoreBody: {
        team1_set1?: number; team1_set2?: number; team1_set3?: number;
        team2_set1?: number; team2_set2?: number; team2_set3?: number;
        winner_team?: number | string
    }
) {
    try {
        // 경기 정보 + 참가자 → 회원 매핑 조회
        const match = await db.prepare(`
            SELECT m.id, m.round,
                   e.name AS event_name,
                   t1.player1_id AS t1p1_pid, t1.player2_id AS t1p2_pid,
                   t2.player1_id AS t2p1_pid, t2.player2_id AS t2p2_pid,
                   p1a.member_id AS t1p1_mid, p1b.member_id AS t1p2_mid,
                   p2a.member_id AS t2p1_mid, p2b.member_id AS t2p2_mid
            FROM matches m
            LEFT JOIN teams t1 ON m.team1_id = t1.id
            LEFT JOIN teams t2 ON m.team2_id = t2.id
            LEFT JOIN participants p1a ON t1.player1_id = p1a.id
            LEFT JOIN participants p1b ON t1.player2_id = p1b.id
            LEFT JOIN participants p2a ON t2.player1_id = p2a.id
            LEFT JOIN participants p2b ON t2.player2_id = p2b.id
            LEFT JOIN events e ON m.event_id = e.id
            WHERE m.id = ?
        `).bind(matchId).first() as any
        if (!match) return

        const winner = scoreBody.winner_team
        if (winner !== 1 && winner !== 2) return  // 승자가 불분명하면 스킵

        // 팀별 회원 ID 수집
        const team1Members = [match.t1p1_mid, match.t1p2_mid].filter(Boolean) as number[]
        const team2Members = [match.t2p1_mid, match.t2p2_mid].filter(Boolean) as number[]

        // 회원 DB에 연결된 선수가 없으면 스킵
        if (team1Members.length === 0 && team2Members.length === 0) return

        // 현재 Elo 조회
        const allMemberIds = [...team1Members, ...team2Members]
        const memberElos: Record<number, { elo: number; games: number }> = {}

        for (const mid of allMemberIds) {
            const member = await db.prepare(
                'SELECT elo_rating FROM members WHERE id = ? AND active = 1'
            ).bind(mid).first() as any

            // 경기 수 조회
            const gameCount = await db.prepare(
                'SELECT COUNT(*) AS cnt FROM member_match_records WHERE member_id = ?'
            ).bind(mid).first() as any

            memberElos[mid] = {
                elo: member?.elo_rating ?? 1500,
                games: gameCount?.cnt ?? 0
            }
        }

        // 팀 평균 Elo 계산
        const avgElo = (members: number[]): number => {
            if (members.length === 0) return 1500
            return Math.round(members.reduce((sum, mid) => sum + (memberElos[mid]?.elo ?? 1500), 0) / members.length)
        }

        const team1Elo = avgElo(team1Members)
        const team2Elo = avgElo(team2Members)

        // 스코어 차이 계산
        const t1Total = (scoreBody.team1_set1 ?? 0) + (scoreBody.team1_set2 ?? 0) + (scoreBody.team1_set3 ?? 0)
        const t2Total = (scoreBody.team2_set1 ?? 0) + (scoreBody.team2_set2 ?? 0) + (scoreBody.team2_set3 ?? 0)
        const scoreDiff = Math.abs(t1Total - t2Total)

        // 승자/패자 결정
        const winnerMembers = winner === 1 ? team1Members : team2Members
        const loserMembers = winner === 1 ? team2Members : team1Members
        const winnerTeamElo = winner === 1 ? team1Elo : team2Elo
        const loserTeamElo = winner === 1 ? team2Elo : team1Elo

        // 각 선수의 Elo 업데이트
        const stmts: any[] = []

        // 승자 팀
        for (const mid of winnerMembers) {
            const info = memberElos[mid]
            const { winnerNew, winnerDelta } = calculateElo(
                info.elo, loserTeamElo, scoreDiff, info.games, 0
            )

            // members 업데이트
            stmts.push(
                db.prepare(
                    `UPDATE members SET elo_rating = ?, elo_peak = MAX(COALESCE(elo_peak, 0), ?), 
                     elo_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(winnerNew, winnerNew, mid)
            )

            // 히스토리 기록
            stmts.push(
                db.prepare(
                    `INSERT INTO elo_history (member_id, match_id, tournament_id, old_elo, new_elo, delta, opponent_elo, result, event_name)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'win', ?)`
                ).bind(mid, matchId, tid, info.elo, winnerNew, winnerDelta, loserTeamElo, match.event_name)
            )
        }

        // 패자 팀
        for (const mid of loserMembers) {
            const info = memberElos[mid]
            const { loserNew, loserDelta } = calculateElo(
                winnerTeamElo, info.elo, scoreDiff, 0, info.games
            )

            stmts.push(
                db.prepare(
                    `UPDATE members SET elo_rating = ?, elo_peak = MAX(COALESCE(elo_peak, 0), COALESCE(elo_rating, 1500)),
                     elo_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(loserNew, mid)
            )

            stmts.push(
                db.prepare(
                    `INSERT INTO elo_history (member_id, match_id, tournament_id, old_elo, new_elo, delta, opponent_elo, result, event_name)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'loss', ?)`
                ).bind(mid, matchId, tid, info.elo, loserNew, loserDelta, winnerTeamElo, match.event_name)
            )
        }

        // 배치 실행
        if (stmts.length > 0) {
            for (let i = 0; i < stmts.length; i += 50) {
                await db.batch(stmts.slice(i, i + 50))
            }
        }
    } catch (e) {
        console.error('updateEloAfterMatch error:', e)
    }
}
