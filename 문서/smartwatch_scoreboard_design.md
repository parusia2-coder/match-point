# 스마트워치 스코어보드 개발 기획안 (Smartwatch Scoreboard Plan)

## 1. 사전 조사 및 타당성 (Research & Feasibility)
스마트워치를 스코어보드 리모컨으로 활용하는 것은 심판의 기동성을 극대화할 수 있어 매우 타당한 접근입니다.

**고려할 사항 (Challenges):**
- **작은 화면 (Small Screen):** UI는 극도로 단순해야 하며, 양 팀의 점수 증감 버튼(+/-)이 주가 되어야 합니다.
- **배터리 소모:** 화면을 계속 켜두거나(Always-On) 통신을 자주 하면 배터리 소모가 심합니다.
- **통신 방식:** 체육관의 Wi-Fi 환경이 불안정할 경우 문제 발생. (단독 Wi-Fi 직접 연결 vs 스마트폰 블루투스 테더링)

**추천 통신 전략 (Direct API vs Companion App):**
현재 시스템이 웹 기반이라는 점을 고려할 때, 워치에서 서버의 REST API/웹소켓으로 **직접 통신(Direct Connection)** 하는 스탠드얼론(Standalone) 방식이 가장 개발하기 직관적입니다.

## 2. 기술 스택 (Technology Stack)
대회 운영 환경 및 한국 시장 점유율(갤럭시 워치 우세)을 고려한 스택 제안:

- **1순위 제안 (Android Wear OS):** `Kotlin` + `Jetpack Compose for Wear OS`
    - 갤럭시 워치 등을 타겟으로 하는 네이티브 앱 개발.
    - 하드웨어 버튼이나 베젤 링 제어, 햅틱 진동 피드백 구현에 가장 유리함.
- **2순위 제안 (watchOS):** `Swift` + `SwiftUI`
    - 애플워치 사용 심판을 위한 네이티브 앱 개발.
- **대안 (PWA / Web App):**
    - 브라우저를 통해 웹페이지에 접속하는 방식. 개발은 빠르나 화면 꺼짐 현상, 조작(터치)의 불편함 등 UX 제약이 커서 리모컨 용도로는 부적합할 수 있음.

## 3. UI/UX 디자인 필수 요소
- **코트 선택 화면:** 번호 패드로 '코트 번호'를 입력하거나 스크롤하여 진입.
- **경기 컨트롤 화면 (메인):**
    - 화면을 절반으로 나누어 큰 터치 영역(팀1, 팀2) 제공. 터치 시 1점 증가.
    - **햅틱 진동(Haptic Feedback):** 점수가 올라갈 때마다 진동 피드백을 주어 심판이 시선을 뺏기지 않도록 함. (오동작 방지)
    - **Swipe 동작:** 화면을 스와이프 하거나 베젤을 돌릴 때 '취소(Undo)' 기능 작동.
    - **길게 누르기 (Long Press):** 세트 종료 또는 매치 종료 트리거.

## 4. 스마트워치 전용 경량화 API 설계 (API Design)
기존 API는 웹 대시보드를 위한 데이터를 모두 포함하므로, 워치 앱의 배터리와 네트워크를 아끼기 위해 극도로 최적화된 경량 API를 제공해야 합니다.

### `GET /api/watch/court/:courtId`
현재 코트의 진행 중인 경기 상태 최소한의 정보만 반환.
**Response:**
```json
{
  "match_id": 12,
  "status": "playing",
  "current_set": 1,
  "t1": { "name": "김철수/이영희", "score": 15 },
  "t2": { "name": "박민수/최지연", "score": 10 }
}
```

### `POST /api/watch/match/:matchId/score`
점수 업데이트 요청 (단순 증감 처리).
**Request:**
```json
{
  "team": 1, 
  "action": "+1" // "+1" 또는 "-1"
}
```

### `POST /api/watch/match/:matchId/status`
상태 변경 (종료 등).
**Request:**
```json
{
  "status": "completed",
  "winner": 1
}
```

## 5. 다음 단계 (Next Steps)
1. 백엔드(`Hono`)에 워치 전용 `routes/watch.ts` 라우터를 추가하여 프로토타입 API 구성.
2. Kotlin 또는 SwiftUI 기반의 간단한 워치 앱 프로토타입 UI 목업 제작 논의.
