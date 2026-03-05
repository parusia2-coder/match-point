# 애플워치 스코어보드 심판용 앱 (watchOS)

이 프로젝트는 애플워치(Apple Watch)를 사용하는 심판들을 위한 **watchOS (SwiftUI)** 기반의 네이티브 앱 프로토타입 뼈대 코드입니다.

## 🛠 사용 기술 (Tech Stack)
- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI
- **Network:** URLSession, Combine
- **Haptics:** WKInterfaceDevice (햅틱 진동 피드백)

## 🚀 시작하기 (How to Run in Xcode)
이 폴더의 소스 코드는 수동으로 생성된 뼈대 파일들입니다. Xcode 프로젝트를 생성하여 이 파일들을 연결해야 합니다.

1. **Mac**에서 **Xcode**를 실행합니다.
2. `Create a new Xcode project`를 클릭합니다.
3. 상단 탭에서 **watchOS**를 선택하고, **App** 템플릿을 선택한 후 `Next`를 누릅니다.
4. **Product Name**에 `WatchScoreboard`를 입력하고, Interface는 `SwiftUI`, Language는 `Swift`로 설정한 뒤 프로젝트를 생성합니다.
5. 생성된 프로젝트의 폴더 안(`WatchScoreboard Watch App`)에 있는 기존 `.swift` 파일들을 모두 지우고, 이 폴더(`watch-app-swift/Sources/`)에 제공된 다음 파일들을 드래그 앤 드롭으로 추가합니다:
   - `Models.swift`
   - `NetworkManager.swift`
   - `ContentView.swift`
   - `WatchScoreboardApp.swift` (기존 App 파일을 대체)
6. 임시 서버 주소(`BASE_URL` in `NetworkManager.swift`)를 현재 동작 중인 서버 주소로 변경합니다.
7. 상단의 기기 선택기에서 **Apple Watch Simulator**를 선택하고 **Run (Cmd+R)** 을 누릅니다.

## ✨ 구현된 기능 특징
- **Jetpack Compose 버전과 1:1 대응**되는 아키텍처 (MVVM 패턴의 `ObservableObject` 적용)
- 배드민턴 및 **테니스 점수(15, 30, 40, AD)** 자동 변환 로직 탑재
- `.onTapGesture`를 활용한 점수 증가 및 `WKInterfaceDevice` 심장 박동(Click) 햅틱 진동 피드백
