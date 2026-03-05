import SwiftUI
import WatchKit

struct ContentView: View {
    @StateObject private var networkManager = NetworkManager()
    @State private var tid: Int = 1
    @State private var courtId: Int = 1

    var body: some View {
        ZStack {
            Color.black.edgesIgnoringSafeArea(.all)
            
            if let match = networkManager.matchInfo {
                HStack(spacing: 2) {
                    TeamScoreView(
                        teamName: match.t1.name,
                        score: match.t1.score,
                        opponentScore: match.t2.score,
                        sportType: match.sport_type,
                        color: Color(red: 16/255, green: 185/255, blue: 129/255), // Emerald
                        onAddScore: {
                            playHaptic()
                            addOptimisticScore(teamIdx: 1)
                            networkManager.updateScore(tid: tid, matchId: match.match_id, team: 1, action: "+1")
                        }
                    )
                    
                    Divider().background(Color.gray)
                    
                    TeamScoreView(
                        teamName: match.t2.name,
                        score: match.t2.score,
                        opponentScore: match.t1.score,
                        sportType: match.sport_type,
                        color: Color(red: 239/255, green: 68/255, blue: 68/255), // Red
                        onAddScore: {
                            playHaptic()
                            addOptimisticScore(teamIdx: 2)
                            networkManager.updateScore(tid: tid, matchId: match.match_id, team: 2, action: "+1")
                        }
                    )
                }
            } else {
                Text(networkManager.errorMessage.isEmpty ? "로딩중..." : networkManager.errorMessage)
                    .foregroundColor(.white)
            }
        }
        .onAppear {
            networkManager.startPolling(tid: tid, courtId: courtId)
        }
        .onDisappear {
            networkManager.stopPolling()
        }
    }
    
    // 낙관적 UI 업데이트
    private func addOptimisticScore(teamIdx: Int) {
        if let currentMatch = networkManager.matchInfo {
            var newMatch = currentMatch
            if teamIdx == 1 {
                newMatch.t1.score += 1
            } else {
                newMatch.t2.score += 1
            }
            networkManager.matchInfo = newMatch
        }
    }
    
    // 심박 탭(Haptic) 추가
    private func playHaptic() {
        WKInterfaceDevice.current().play(.click)
    }
}

// 점수 포맷터 및 화면 분할 UI
struct TeamScoreView: View {
    let teamName: String
    let score: Int
    let opponentScore: Int
    let sportType: String?
    let color: Color
    let onAddScore: () -> Void
    
    var displayScore: String {
        guard sportType == "tennis" else {
            return "\(score)"
        }
        
        let s = score
        let os = opponentScore
        
        if s <= 3 && os <= 3 {
            if s == 3 && os == 3 { return "40" }
            return ["0", "15", "30", "40"][s]
        } else if s == os {
            return "40"
        } else if s > os {
            return (s - os >= 2) ? "WIN" : "AD"
        } else {
            return "40"
        }
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(red: 15/255, green: 23/255, blue: 42/255) // Dark slate
                    .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 8) {
                    Text(String(teamName.prefix(5)))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    
                    Text(displayScore)
                        .font(.system(size: displayScore.count > 2 ? 30 : 44, weight: .bold))
                        .foregroundColor(displayScore == "WIN" ? .yellow : color)
                }
            }
            .contentShape(Rectangle()) // To make whole area tappable
            .onTapGesture {
                onAddScore()
            }
        }
    }
}
