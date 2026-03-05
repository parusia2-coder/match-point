import Foundation
import Combine

class NetworkManager: ObservableObject {
    @Published var matchInfo: MatchStatus?
    @Published var errorMessage: String = ""
    
    // 개발 서버 주소입력 (PC의 로컬 IP나 Cloudflare Tunnel Domain 사용)
    private let baseURL = "https://badminton-tournament-5ny.pages.dev"
    private var cancellables = Set<AnyCancellable>()
    private var timerPublisher: AnyCancellable?
    
    func startPolling(tid: Int, courtId: Int) {
        // Stop any existing timer
        timerPublisher?.cancel()
        
        // Immediate fetch
        fetchCourtStatus(tid: tid, courtId: courtId)
        
        // Timer fetch (매 5초마다 동작)
        timerPublisher = Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.fetchCourtStatus(tid: tid, courtId: courtId)
            }
    }
    
    func stopPolling() {
        timerPublisher?.cancel()
    }
    
    func fetchCourtStatus(tid: Int, courtId: Int) {
        guard let url = URL(string: "\(baseURL)/api/watch/\(tid)/court/\(courtId)") else { return }
        
        URLSession.shared.dataTaskPublisher(for: url)
            .map(\.data)
            .decode(type: MatchStatus.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { completion in
                switch completion {
                case .failure(let error):
                    self.errorMessage = "대기중.."
                    print("Fetch Error: \(error)")
                case .finished:
                    break
                }
            }, receiveValue: { match in
                self.matchInfo = match
                self.errorMessage = ""
            })
            .store(in: &cancellables)
    }
    
    func updateScore(tid: Int, matchId: Int, team: Int, action: String) {
        guard let url = URL(string: "\(baseURL)/api/watch/\(tid)/match/\(matchId)/score") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ScoreUpdateRequest(team: team, action: action)
        request.httpBody = try? JSONEncoder().encode(body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Update Error: \(error)")
                return
            }
        }.resume()
    }
}
