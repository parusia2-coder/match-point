# 배드민턴/테니스 통합 스코어보드 심판용 스마트워치 앱 (Wear OS)

이 프로젝트는 심판들이 경기 중 스마트워치를 사용하여 간편하게 점수를 조작할 수 있도록 돕는 **Android Wear OS (Jetpack Compose)** 기반의 네이티브 앱 프로토타입입니다.

## 🛠 사용 기술 (Tech Stack)
- **Language:** Kotlin
- **UI Framework:** Jetpack Compose for Wear OS
- **Network:** Retrofit / OkHttp (API 직접 통신)
- **Haptics:** Android Vibrator API (진동 피드백)

## 🚀 시작하기 (How to Run)
1. **Android Studio**를 설치하고 실행합니다.
2. `File > Open...` 메뉴를 클릭하고 이 폴더(`watch-app-kotlin`)를 선택합니다.
3. Gradle Sync가 완료될 때까지 기다립니다.
4. 상단의 Device Manager에서 **Wear OS Emulator (예: Wear OS Large Round API 33)** 를 생성하거나, 실제 **갤럭시 워치**를 개발자 모드로 PC에 연결합니다.
5. `Run 'app'` (▶️버튼)을 눌러 워치에 설치합니다.

## ✨ 구현된 핵심 기능 (UI 프로토타입)
1. 코트 번호 및 대회 ID 설정 (초기 진입화면)
2. 경기 현황 API Polling (서버에서 주기적으로 코트 매치 정보 가져오기)
3. 좌/우 큰 버튼 터치를 통한 실시간 **점수 올리기 (+1)** 
4. 터치 시 손목으로 확실한 **햅틱 진동 피드백** 전송 (오동작 방지)
5. 길게 누르기(Long Press)로 점수 내리기 (-1)

## 🔗 연동 정보
- 이 앱은 백엔드의 `/api/watch/:tid/court/:courtId` 및 `/api/watch/:tid/match/:matchId/score` API 엔드포인트와 통신하도록 설계되었습니다.
- 테스트 시 `BASE_URL` 값을 현재 백엔드(서버/터널링 URL)로 변경해야 합니다.
