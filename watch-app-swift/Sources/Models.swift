import Foundation

// MARK: - Networking Data Models
struct TeamScore: Codable {
    let name: String
    var score: Int
}

struct MatchStatus: Codable {
    let match_id: Int
    let status: String
    let current_set: Int
    let sport_type: String?
    var t1: TeamScore
    var t2: TeamScore
}

struct ScoreUpdateRequest: Codable {
    let team: Int
    let action: String
}

struct ScoreUpdateResponse: Codable {
    let success: Bool
    let new_score: Int
}
