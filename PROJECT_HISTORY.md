# 배드민턴/테니스 대회 운영 시스템 - 프로젝트 히스토리

> 세션이 끊어졌을 때 이 파일을 읽으면 프로젝트 전체 맥락을 복원할 수 있습니다.
> 마지막 업데이트: 2026-03-02 (v3.8)

---
## ✨ 최근 주요 업데이트 (v3.8 - 2026-03-02) 

1. **🏛️ 단체 전용 홈페이지 개설 프로세스 고도화 및 권한 최적화**
   - **임시 발급 비밀번호 시스템**: 단체(Org) 개설 시 자동 생성되는 관리자 비밀번호를 기억하기 쉬운 '123456'으로 고정 발급하고, 안내 모달의 텍스트를 친화적으로 개선 (사용자가 직접 자유롭게 추후 변경 가능).
   - **대회 개설 시 주최자 권한 자동 할당**: `POST /api/tournaments`에서 대회를 새로 만들 때, 대회 생성자에게 해당 대회의 `admin` 롤(role)을 `user_roles` 테이블에 즉시 부여하여 개설 직후 대시보드 목록에 빠짐없이 노출되도록 500 에러 및 누락 버그 해결.
   - **대시보드 소속 단체 노출 로직 추가**: 전역 최고 관리자뿐만 아니라 단체 권한(Org Admin)을 가진 관리자가 로그인 한 경우에도 화면 상단에 '내 단체(협회/리그)' 리스트(`myOrgsHtml`)가 정상 출력되도록 프론트엔드(`renderRoleDashboard`) UI 렌더링 로직 수정.
   - **단체 관리자 자격지명 이슈 해결 (보안/복구 기능)**: `org_admin_credentials` 테이블에서 생성된 비밀번호 평문을 추적 보관하여, 최고 관리자가 단체 관리자들의 잊어버린 암호를 조회 및 즉시 리셋할 수 있는 복구 엔드포인트 구현 완료.

---
## 🔙 이전 주요 업데이트 (v3.7 - 2026-03-01) 

1. **🔐 역할 기반 권한 제어 (RBAC) 및 인증 리팩토링**
   - 전역 관리자(Super Admin), 협회 관리자(Org Admin), 클럽 관리자(Club Admin), 일반 유저 권한 분리 
   - `0018_auth_roles_reorg.sql` 마이그레이션: `users`, `user_roles`, `clubs` 테이블 도입 및 데이터 마이그레이션 완료
   - 프론트엔드 `auth.js`의 토큰 및 권한 파싱, 모달 문구 등 로그인/가입 워크플로우 범용화
   - API 권한 검증 미들웨어 (`src/middleware/auth.ts`)에서 JWT 페이로드 내부의 다중 롤 파싱 로직 구현

2. **📊 권한별 맞춤형 진입 대시보드 (Role-based Dashboard Landing)**
   - `public/static/app.js`에서 인증 성공 시 `renderRoleDashboard` 함수를 통해 역할에 맞는 메인 화면 표시
   - `Super Admin`: 전체 시스템 통계 및 통합 관리 화면
   - `Org Admin`: 산하 클럽 통계 및 협회 소속 대회 관리
   - `Club Admin`: 클럽 회원 및 출전 대회 정보
   - `User`: 내 전적 요약 및 상세 일정 링크 표시

3. **🏛️ 멀티테넌트(Multi-tenant) 데이터 격리 및 전용 라우팅 완비**
   - `index.tsx`에 `/org/:slug` 서브 라우트 추가 및 `window.MP_CONFIG.tenantSlug` 전역 주입 (SPA 지원)
   - 프론트엔드 라우팅 시 `tenantSlug` 여부에 따라 해당 단체의 테마 컬러(`--primary`) 및 전용 대시보드 강제 렌더링
   - 시스템 내에서 대회 개설(`POST /api/tournaments`) 시 현재 활성화된 단체(Tenant)의 `org_id`를 인식하여 자동 매핑 처리
   - `GET /api/tournaments?slug=...` 파라미터를 통해 데이터베이스 단에서 특정 협회/클럽 데이터만 격리하여 불러오도록 방어 로직 완비
   - `0016_organizations.sql`, `0018_auth_roles_reorg.sql` 상 성능 향상 인덱스(`slug`, `org_id`, `user_id` 등) 확인 및 구조 검증 완료

4. **🧩 3대 핵심 모듈 백엔드 API 완비 (v3.8)**
   - **(모듈 1) 회원 시스템 (Member System)**: `src/routes/orgs.ts`에 단체 소속 회원(`org_members`) 단건/목록 조회, 직책 부여, 승인 상태 관리 및 공인 급수(`official_level`) 매핑 API 추가 (`/:id/members`)
   - **(모듈 2) 회비/결제/빌링 (Billing)**: `0019_billing_and_scheduling.sql`에 `dues_payments` 테이블 추가, 연회비/월회비 납부 추적(`POST /:id/dues`) 및 `last_dues_year` 자동 갱신 트리거 로직 추가
   - **(모듈 3) 일정 관리 (Schedules)**: `schedules` 임의 일정 테이블을 통해 협회/클럽 미팅, 합동 훈련 등 자체 스케줄 생성 및 게시 API 추가 (`/:id/schedules`)

5. **🖥️ 단체 3대 모듈 중앙 관리 UI 신설**
   - 메인 대시보드(로그인 화면)의 '내 단체' 카드에 **"👥 회원", "💳 회비결제", "📅 일정관리"** 버튼 및 관리 모달 신설
   - **(모듈 1. 회원) `manageOrgMembers` 모달**: 회원 일괄 검색/추가, 권한 및 협회 급수 부여, 활동 상태(Active/Suspended) 관리 UI 완비
   - **(모듈 2. 회비) `manageOrgDues` 모달**: 회비 납부 내역 실시간 리스트 조회, 수동 납부 처리(회원 선택, 금액, 연회비/월회비 선택) 등록폼 적용
   - **(모듈 3. 일정) `manageOrgSchedules` 모달**: 조직 내 미팅, 합동 훈련 등 자체 스케줄 생성 및 게시판화 지원 (`title`, `start_time`, `location`)

6. **🎨 서브 페이지 CSS 통일 (Kinetic Brutalism 스타일 반영)**
   - 메인 랜딩 페이지 개편에 맞추어 `style.css` 전면 수정
   - 밝은 테마/단순 박스 형태에서 Neon Green(`#C8FF00`) / Dark UI / Sharp Angles 형태의 브루탈리즘 테마로 변수 변경 및 적용

4. **📷 QR 체크인 스캐너 작동 확인 및 최적화**
   - 글로벌 변수 중복 선언 버그 수정 (`html5QrcodeScanner`) 및 구동 검증 완료

---
## ✨ 최근 주요 업데이트 (v3.6 - 2026-03-01)

1. **🔄 경기 배정 변경 (Match Reassignment)**
   - 점수 모달에서 직접 코트 번호, 경기 순서, 예정 시간을 변경할 수 있는 UI 추가
   - 백엔드 `PUT /:tid/matches/:mid/reassign` API 엔드포인트 구현
   - 감사 로그(audit_logs) 기록 및 WebSocket 실시간 브로드캐스트 연동
   - 예시: 1코트 4번 경기 → 2코트 3번 경기로 손쉽게 이동

2. **📊 대시보드 완전 재구축**
   - 기존 `index.tsx` 인라인 HTML (~400줄) → 별도 `src/dashboard.html` 파일로 분리
   - `commonHead` (tosspayments 등 외부 스크립트) 의존성 완전 제거 → 독립 페이지
   - `confirm()` 다이얼로그 차단 문제 근본 해결
   - 기능: 통계 카드, 코트 현황(LIVE 뱃지), 종목별 진행률 차트(Chart.js), 이벤트 상세 펼치기, 구장 필터, WebSocket 실시간 업데이트, 30초 자동 갱신
   - 밝은 테마 통일 (차트/텍스트 색상 라이트 모드 최적화)

3. **🏟️ 다중 구장(Venue) 시스템 연동 강화**
   - 대시보드에서 구장별 코트 점수판, 대형 전광판 바로가기 링크 자동 생성
   - 구장별 코트 수 표시 (호계체육관 12면, 비산노인복지관 6면 등)

4. **🔧 서비스 워커 캐시 갱신**
   - `CACHE_NAME`: mp-v3.3 → mp-v3.4, `SW_VERSION`: v3.5 → v3.6
   - 이전 캐시 자동 정리 로직 포함

## 🔙 이전 주요 업데이트 (v3.4 - 2026-02-26)

1. **🎯 커스텀 대회 점수 규정 설정 (Score Rules)**
   - 대회 생성/수정 시 `예선 목표점수`, `본선 목표점수`, `최대 세트수` 기본값 개별 설정 기능 추가
   - KDK/리그/단판 등 특수한 상황과 동호회 맞춤 설정 가능
   - DB `tournaments` 테이블에 `score_rule_prelim`, `score_rule_final`, `max_sets` 컬럼 추가

2. **🏸 코트 점수판 UI 자동 동적 반영 (court.js)**
   - 심판용 태블릿 점수 설정 버튼에 '대회별 기본 점수'가 자동으로 뜨도록 연동
   - 변경된 목표 점수에 따라 코트체인지(절반도달) 점수 자동 계산 및 반영
   - 세트수가 1세트로 제한된 대회는 2,3세트 입력 칸을 자동으로 숨김 처리

3. **⏩ 경기 워크오버(기권/부전승) 간편 처리**
   - 관리자 점수 입력 모달에 '기권/부전승 처리' 버튼 추가
   - 한 번의 클릭으로 대상 팀을 판별하여 경기 상태를 '완료(completed)'로 변경하고 즉시 승리 처리

## 🔙 이전 주요 업데이트 (v3.3 - 2026-02-24)

1. **💸 Toss Payments 온라인 결제 시스템 구축**
   - 참가비 온/오프라인 수납 분기 설정 (`use_payment`, `participation_fee`) 추가 (DB 마이그레이션 `0009_payments_and_plans.sql`)
   - 토스 위젯 렌더링 및 `POST /api/payments/confirm` 서명/승인 프로세스 구현
   - 결제 완료자에 한해 `payment_status: 'paid'` 상태 전환

2. **🌙 다크 모드 (Dark Mode) 추가**
   - 네비게이션 우측 로컬스토리지 연동 ☀️/🌙 스위치 구현
   - 체육관 어두운 환경에 최적화된 테마 컬러 및 CSS 스왑

3. **🩻 UI/UX 퀄리티 대폭 향상 (Empty State)**
   - "데이터 없음" 빈 화면 요소에 Float Animation 적용
   - 🏆(대회), 👥(참가자), ⚔️(경기) 등 명확한 액션을 유도하는 텍스트와 CTA 버튼 강조
   - Tournament List의 로딩을 Skeleton 컴포넌트로 변경하여 체감 속도 개선


## 1. 프로젝트 개요

- **프로젝트명**: Match Point 스포츠 대회 솔루션 (배드민턴/테니스 통함)
- **대회명**: 2026 통합 리그운영 포털
- **프로젝트 경로**: `c:\new_대회운영관리시스템\minton_tennis`
- **기술 스택**: Hono + TypeScript + Cloudflare Workers (D1 SQLite) + Vanilla JS/CSS
- **배포 URL**: https://minton-tennis.pages.dev


### 기기별 역할
| 기기 | URL | 용도 |
|------|-----|------|
| 관리자 노트북 | `/` | 대회관리, 참가자등록, 종목/팀편성, 대진표 |
| 코트 태블릿 | `/court?tid={대회ID}&court={코트번호}&locked=1&autonext=true` | 코트별 실시간 점수 입력 (잠금모드) |
| 대형 모니터 | `/dashboard?tid={대회ID}` | 관중용 실시간 현황 (30초 자동갱신) |
| 참가자 스마트폰 | `/my?tid={대회ID}` | 개인 일정/결과 확인 + 푸시 알림 구독 (QR 접속) |
| 코트별 타임라인 | `/timeline?tid={대회ID}` | 전체 경기 흐름 한눈에 보기 (20초 자동갱신) |
| **인쇄 센터** | **`/print?tid={대회ID}`** | **수기 운영 대비 6종 인쇄물 (A4 PDF)** |
| 운영 매뉴얼 | `/static/manual.html` | A4 인쇄용 현장 운영 매뉴얼 |

---

## 2. 파일 구조 (총 9,968줄)

```
/home/user/webapp/
├── src/
│   ├── index.tsx                 (1,866줄) 메인 Hono 앱, 라우팅, HTML 템플릿, /court /my /timeline /print 페이지, 인쇄센터(6종 인쇄물+결선 브래킷), SW 라우트
│   ├── dashboard.html           (163줄) 대시보드 독립 페이지 (Chart.js, WebSocket, 자동갱신)
│   └── routes/
│       ├── tournaments.ts        (206줄) 대회 CRUD, 인증, 통계, merge_threshold PATCH, print-data 통합 API
│       ├── participants.ts       (200줄) 참가자 등록/수정/삭제, 일괄등록, 클럽 정보
│       ├── events.ts             (1,030줄) 종목 관리, 팀 등록, 자동팀편성, 급수합병(수동/자동/취소), 조 배정, 일괄삭제
│       ├── matches.ts            (785줄) 경기/점수/순위, 코트 점수판 API, 서명, 대시보드, 내경기, 타임라인, 알림연동, 경기 재배정
│       ├── notifications.ts      (126줄) 푸시 알림 시스템 (VAPID JWT, ECE 암호화, Web Push)
│       └── brackets.ts           (668줄) 대진표 생성 (KDK/풀리그/토너먼트), 결선 토너먼트
├── public/static/
│   ├── app.js                    (2,810줄) 메인 프론트엔드 SPA (Sport Command Center 테마, 경기 재배정 UI 포함)
│   ├── court.js                  (1,471줄) 코트 전용 점수판 프론트엔드 (승리/패배 라벨 수정 완료)
│   ├── style.css                          커스텀 스타일
│   ├── manual.html               (1,310줄+) A4 인쇄용 현장 운영 매뉴얼 (v3.1)
│   └── test_participants_100.txt          테스트 데이터 100명
├── public/
│   └── sw.js                     (77줄) Service Worker (푸시 알림 수신/클릭 처리)
├── migrations/
│   ├── 0001_initial_schema.sql            DB 스키마 (기본 테이블)
│   ├── 0002_add_signatures.sql            경기 서명 필드 추가
│   ├── 0003_add_mixed_doubles.sql         혼합복식 참가 필드
│   ├── 0004_add_club_and_groups.sql       클럽/조 번호/인덱스 추가
│   └── 0005_add_push_notifications.sql    푸시 알림 구독/로그 테이블
├── seed.sql                               실제 장년부 데이터 (177명, 18개 클럽)
├── ecosystem.config.cjs                   PM2 설정
├── wrangler.jsonc                         Cloudflare 설정
├── vite.config.ts                         Vite 빌드 설정
├── tsconfig.json                          TypeScript 설정
├── package.json                           의존성 및 스크립트
├── generate_test_data.py                  테스트 참가자 생성 스크립트
├── README.md                              개발 문서 (전체 API/스키마/로직 문서화)
└── PROJECT_HISTORY.md                     ← 이 파일
```

---

## 3. DB 스키마 (D1 SQLite) — 5개 마이그레이션

### tournaments (대회)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| name | TEXT | 대회명 |
| description | TEXT | 설명 |
| status | TEXT | draft/open/in_progress/completed/cancelled |
| format | TEXT | kdk/league/tournament |
| games_per_player | INTEGER | KDK 방식 팀당 경기수 (기본 4) |
| courts | INTEGER | 코트 수 (기본 2) |
| merge_threshold | INTEGER | 급수합병 기준 팀수 (기본 4) |
| admin_password | TEXT | 관리자 비밀번호 |
| deleted | INTEGER | 소프트삭제 (0/1) |

### events (종목)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| tournament_id | INTEGER FK | 대회 |
| category | TEXT | md(남복)/wd(여복)/xd(혼복) |
| age_group | TEXT | open/20대/30대/40대/50대이상 |
| level_group | TEXT | all/s/a/b/c/d/e 또는 합병시 "merged" |
| name | TEXT | 자동생성 예: "남자복식 오픈 A+B급" |
| status | TEXT | pending/in_progress/completed/cancelled |
| merged_from | TEXT | JSON 배열 (합병 원본 종목 ID들) |

### participants (참가자)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| tournament_id | INTEGER FK | 대회 |
| name | TEXT | 이름 |
| phone | TEXT | 연락처 |
| gender | TEXT | m(남)/f(여) |
| birth_year | INTEGER | 출생년도 |
| level | TEXT | s/a/b/c/d/e |
| paid | INTEGER | 참가비 납부 (0/1) |
| checked_in | INTEGER | 체크인 (0/1) |
| deleted | INTEGER | 소프트삭제 |
| **club** | **TEXT** | **소속 클럽 (0004 추가)** |
| **wants_mixed** | **INTEGER** | **혼복 참가 희망 (0003 추가)** |

### teams (팀 - 복식 2인)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| event_id | INTEGER FK | 종목 |
| tournament_id | INTEGER FK | 대회 |
| player1_id | INTEGER FK | 선수1 |
| player2_id | INTEGER FK | 선수2 |
| team_name | TEXT | "선수A · 선수B" 형태 |
| **group_num** | **INTEGER** | **조 번호 (0004 추가)** |

### matches (경기)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| tournament_id | INTEGER FK | 대회 |
| event_id | INTEGER FK | 종목 |
| round | INTEGER | 라운드 번호 |
| match_order | INTEGER | 경기 순서 |
| court_number | INTEGER | 코트 번호 |
| team1_id, team2_id | INTEGER FK | 대진 팀 |
| team1_set1~3, team2_set1~3 | INTEGER | 세트별 점수 |
| status | TEXT | pending/playing/completed/cancelled |
| winner_team | INTEGER | 1 또는 2 (승리팀) |
| **group_num** | **INTEGER** | **조 번호 (0004 추가)** |
| **team1_signature** | **TEXT** | **팀1 서명 데이터 (0002 추가)** |
| **team2_signature** | **TEXT** | **팀2 서명 데이터 (0002 추가)** |
| **signature_at** | **DATETIME** | **서명 시각 (0002 추가)** |

### standings (순위)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| event_id + team_id | UNIQUE | 종목별 팀 순위 |
| wins, losses, points | INTEGER | 승/패/승점 |
| score_for, score_against | INTEGER | 득점/실점 |
| goal_difference | INTEGER | 득실차 |

### audit_logs (감사로그)
- tournament_id, match_id, action, old_value, new_value, updated_by, created_at

### push_subscriptions (푸시 알림 구독 - 0005 추가)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| tournament_id | INTEGER FK | 대회 |
| participant_name | TEXT | 참가자 이름 |
| participant_phone | TEXT | 연락처 (선택) |
| endpoint | TEXT UNIQUE | 푸시 서비스 엔드포인트 |
| p256dh | TEXT | 암호화 키 |
| auth | TEXT | 인증 키 |

### notification_logs (알림 발송 로그 - 0005 추가)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 자동증가 |
| tournament_id | INTEGER FK | 대회 |
| match_id | INTEGER FK | 경기 |
| participant_name | TEXT | 수신자 이름 |
| notification_type | TEXT | match_starting / match_upcoming |
| UNIQUE | (match_id, participant_name, notification_type) | 중복 발송 방지 |

### 추가 인덱스 (0004, 0005)
- `idx_participants_club` — 클럽별 조회 최적화
- `idx_teams_group_num` — 조별 조회 최적화
- `idx_matches_group_num` — 조별 경기 조회 최적화
- `idx_push_sub_tournament` — 대회별 구독 조회
- `idx_push_sub_name` — 대회+이름별 구독 조회
- `idx_notif_log_match` — 경기별 알림 로그 조회

---

## 4. API 엔드포인트 전체 목록

모든 API는 `/api/tournaments` 아래에 마운트됩니다.

### 대회 관리 (tournaments.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tournaments` | 대회 목록 |
| GET | `/api/tournaments/:id` | 대회 상세 |
| POST | `/api/tournaments` | 대회 생성 |
| PUT | `/api/tournaments/:id` | 대회 수정 (비밀번호 필요) |
| PATCH | `/api/tournaments/:id/status` | 상태 변경 |
| DELETE | `/api/tournaments/:id` | 소프트 삭제 |
| POST | `/api/tournaments/:id/auth` | 관리자 인증 |
| GET | `/api/tournaments/:id/stats` | 통계 |

### 참가자 관리 (participants.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tournaments/:tid/participants` | 참가자 목록 (?club= 클럽 필터) |
| POST | `/api/tournaments/:tid/participants` | 개별 등록 (club 필드 포함) |
| POST | `/api/tournaments/:tid/participants/bulk` | 일괄 등록 (텍스트/CSV) |
| PUT | `/api/tournaments/:tid/participants/:pid` | 수정 |
| DELETE | `/api/tournaments/:tid/participants/:pid` | 삭제 |
| PATCH | `/api/tournaments/:tid/participants/:pid/paid` | 참가비 토글 |
| PATCH | `/api/tournaments/:tid/participants/:pid/checkin` | 체크인 토글 |

### 종목/팀 관리 (events.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tournaments/:tid/events` | 종목 목록 (팀수 포함) |
| POST | `/api/tournaments/:tid/events` | 종목 생성 |
| DELETE | `/api/tournaments/:tid/events/:eid` | 종목 삭제 |
| POST | `/api/tournaments/:tid/events/:eid/teams` | 팀 수동 등록 |
| GET | `/api/tournaments/:tid/events/:eid/teams` | 팀 목록 |
| DELETE | `/api/tournaments/:tid/events/:eid/teams/:teamId` | 팀 삭제 |
| POST | `/api/tournaments/:tid/events/:eid/auto-assign` | 단일 종목 자동 팀편성 |
| POST | `/api/tournaments/:tid/events/auto-assign-all` | 전체 자동 팀편성 |
| POST | `/api/tournaments/:tid/events/check-merge` | 급수합병 체크 |
| POST | `/api/tournaments/:tid/events/execute-merge` | 급수합병 실행 (급수균형 재조합 + 조 재편성) |
| POST | `/api/tournaments/:tid/events/:eid/unmerge` | 합병 취소 (되돌리기) |
| DELETE | `/api/tournaments/:tid/events/all/assignments` | 조편성 일괄 삭제 (팀/경기/순위, 종목 유지) |
| DELETE | `/api/tournaments/:tid/events/all/everything` | 종목 전체 삭제 (팀/경기/순위/종목 모두) |
| POST | `/api/tournaments/:tid/events/:eid/assign-groups` | 단일 종목 조 배정 |

### 경기/점수/순위 (matches.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tournaments/:tid/matches` | 경기 목록 (?event_id= 필터) |
| PUT | `/api/tournaments/:tid/matches/:mid/score` | 점수 업데이트 (감사 로그 기록) |
| PATCH | `/api/tournaments/:tid/matches/:mid/status` | 상태 변경 |
| GET | `/api/tournaments/:tid/standings` | 순위 조회 (자동 재계산) |
| GET | `/api/tournaments/:tid/court/:courtNum` | 코트별 현재 경기/대기/최근 |
| POST | `/api/tournaments/:tid/court/:courtNum/next` | 코트 다음 경기 자동 시작 |
| GET | `/api/tournaments/:tid/courts/overview` | 전체 코트 현황 |
| GET | `/api/tournaments/:tid/audit-logs` | 최근 100건 감사 로그 |
| PUT | `/api/tournaments/:tid/matches/:mid/reassign` | 경기 코트/순서/시간 재배정 (감사 로그+WebSocket) |
| PUT | `/api/tournaments/:tid/matches/:mid/signature` | 경기 서명 저장 |
| GET | `/api/tournaments/:tid/matches/:mid/signature` | 경기 서명 조회 |
| GET | `/api/tournaments/:tid/dashboard` | 통계 대시보드 (전체/종목별/클럽별) |
| GET | `/api/tournaments/:tid/my-matches?name=&phone=` | 참가자 개인 경기 조회 |
| **GET** | **`/api/tournaments/:tid/timeline`** | **코트별 타임라인 (경량 튜플 형식)** |

### 푸시 알림 (notifications.ts) — v2.3 신규
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tournaments/:tid/push/vapid-key` | VAPID 공개키 조회 |
| POST | `/api/tournaments/:tid/push/subscribe` | 푸시 구독 등록 (이름/연락처/구독정보) |
| POST | `/api/tournaments/:tid/push/unsubscribe` | 푸시 구독 해제 |
| GET | `/api/tournaments/:tid/push/status?name=` | 구독 상태 확인 |
| POST | `/api/tournaments/:tid/push/test` | 테스트 알림 발송 |

### 대진표 (brackets.ts)
| 메서드 | 경로 | 파라미터 | 설명 |
|--------|------|----------|------|
| POST | `/api/tournaments/:tid/brackets/generate` | format, event_id, groups, teamsPerGroup | 예선 대진표 생성 (KDK/풀리그/토너먼트) |
| POST | `/api/tournaments/:tid/brackets/generate-finals` | event_id, topN | 결선 토너먼트 생성 (조별 상위 N팀) |
| GET | `/api/tournaments/:tid/brackets/finals-preview` | event_id, topN | 결선 진출팀 미리보기 |

### 프론트엔드 페이지
| 경로 | 파라미터 | 대상 | 설명 |
|------|----------|------|------|
| `/` | — | 관리자 | 메인 SPA (app.js) — Sport Command Center 테마 |
| `/court` | tid, court, locked, autonext | 코트 심판 | 코트 전용 점수판 (court.js) |
| `/dashboard` | tid | 관중/대형모니터 | 실시간 통계 대시보드 |
| `/my` | tid | 참가자 | 개인 일정/결과 확인 |
| `/timeline` | tid | 운영진/관중 | 코트별 타임라인 (전체 경기 흐름) |
| `/sw.js` | — | 시스템 | Service Worker (푸시 알림 수신) |
| `/static/manual.html` | — | 운영자 | A4 인쇄용 현장 운영 매뉴얼 |
| `/api/health` | — | 시스템 | 헬스체크 |

---

## 5. 핵심 비즈니스 로직

### 종목 구분
- **종류**: 남자복식(md), 여자복식(wd), 혼합복식(xd)
- **연령대**: 오픈(전연령), 20대, 30대, 40대, 50대이상
- **급수**: S, A, B, C, D, E (6단계)

### 자동 팀편성 로직 (events.ts auto-assign)
- 남복: 남자 참가자끼리 급수 비슷한 순으로 2인 1팀
- 여복: 여자 참가자끼리 급수 비슷한 순으로 2인 1팀
- 혼복: 남 1명 + 여 1명 조합, 이미 사용된 선수도 가능 (중복 참가 허용)
- 급수 순서로 정렬 후 인접한 2명씩 묶음

### 급수합병 로직 (events.ts check-merge / execute-merge / unmerge)
- **자동 합병**: 같은 종류+연령대 내에서 팀 수가 merge_threshold 미만인 종목 탐지
- 인접 급수끼리 순차 합병 (S→A→B→C→D→E)
- 합산 팀수가 threshold 이상이 될 때까지 계속 합병
- 예: A(1팀) + B(1팀) + C(2팀) → "A+B+C급" (4팀)
- **수동 합병**: 관리자가 체크박스로 자유 선택 (카테고리/연령대 제한 없음), 커스텀 이름 지정 가능
- **연령대 간 합병**: 서로 다른 연령대도 합병 허용 (예: 50대 A급 + 55대 A급)
- **실시간 threshold 변경**: PATCH /tournaments/:id → merge_threshold 즉시 수정, 슬라이더 UI
- **합병 취소(되돌리기)**: merged_from JSON에서 원본 종목 복원, 팀은 첫 번째 원본 종목에 재배치
- **합병 후 급수균형 재조합**: 기존 팀 해체 → 전체 선수 급수 정렬 → 상위+하위 페어링 (A+E, A+D, B+C 등)
- **합병 후 자동 조 재편성**: 재조합된 팀으로 랜덤 셔플 + 클럽 회피 조 배정

### 대진표 생성 (brackets.ts)
- **KDK**: 모든 팀 대결 조합 중 랜덤 선택, 팀당 games_per_player 만큼 배정
- **풀리그**: 라운드 로빈 (모든 팀이 서로 1번씩)
- **토너먼트**: 싱글 엘리미네이션 (단판 토너먼트)
- 코트 번호 자동 배정 (라운드 로빈)
- **조별 대진**: groups 파라미터로 조 수 지정, teamsPerGroup으로 조당 팀수 제한

### 결선 토너먼트 (brackets.ts generate-finals)
1. 종목의 조별 순위 계산 (승점 → 득실차 → 득점 순)
2. 각 조에서 상위 topN 팀 추출
3. 기존 결선 경기 삭제 (round >= 900)
4. 싱글 엘리미네이션 대진표 생성 (round 900번대)
5. 같은 조 팀끼리 초반 대결 회피 (시드 배치)

### 순위 계산 알고리즘
- 승점(승리 시 2점, 패배 시 0점) → 득실차(총득점−총실점) → 총득점 순

### 코트 점수판 (court.js)
- 워크플로우: 코트선택 → 대기화면 → 경기시작 → 점수입력 → 서명확인 → 경기종료 → 자동 다음경기
- 3세트 관리, 세트 탭 전환
- 터치 최적화 (+/- 큰 버튼), 실행취소 기능
- 자동 승자 추천 (세트 승수 기반)
- 10초 자동 새로고침 (대기 화면에서)
- `locked=1`: 읽기 전용 모드 (관중/모니터용)
- `autonext=true`: 경기 종료 후 자동으로 다음 경기 시작

### 통계 대시보드 (matches.ts dashboard)
- 전체 통계: 총 경기수, 완료율, 진행중/대기/완료 수
- 종목별 통계: 각 종목의 진행 현황
- 클럽별 통계: 소속 클럽별 참가자 수, 승률
- 30초 자동 갱신

### 참가자 개인 페이지 (matches.ts my-matches)
- 이름+연락처로 본인 경기 조회
- QR 코드로 빠른 접속
- 진행중/예정/완료 경기 구분 표시

### 코트별 타임라인 (matches.ts timeline) — v2.2 신규
- 전체 경기를 코트별로 순서대로 한눈에 시각화
- 종목별 필터 (전체/남복/여복/혼복)
- 호버 툴팁: 팀명, 점수, 상태 표시
- **성능 최적화**: 튜플 형식 API (92KB→28KB, -69%), 이벤트 위임 툴팁 (DOM -67%)
- 20초 자동 갱신

### 푸시 알림 & 인앱 알림 시스템 — v2.3 신규
- **Web Push API** (VAPID JWT + ECE aes128gcm 암호화, Cloudflare Workers 순수 구현)
- Service Worker (`/sw.js`) — 푸시 수신, 알림 표시 (아이콘/진동/소리), 클릭 시 /my 이동
- `/my` 페이지에서 "경기 시작 알림 받기" 버튼으로 구독/해제
- 테스트 알림 발송 기능
- **인앱 폴링 알림**: 15초마다 상태 변경 감지 → 배너+진동+소리로 알림
- **자동 알림 발송 트리거**:
  - 경기 상태 → `playing` 전환 시 해당 선수에게 "경기 시작" 푸시
  - 경기 시작 시 같은 코트 다음 대기 경기 선수에게 "준비" 푸시
  - 코트 다음 경기 자동시작(POST /:tid/court/:courtNum/next) 시에도 동일 알림
- 중복 발송 방지 (notification_logs 테이블)

---

## 6. 개발 히스토리 (Git 커밋 순서)

### Phase 1: 기본 시스템 구축 (2026-02-15)
```
61e5496 2026-02-15 13:15 Initial commit: Badminton Tournament Management System
a9949e8 2026-02-15 13:15 Add README documentation
b4488ab 2026-02-15 13:24 Change level system from beginner/intermediate/advanced to S/A/B/C/D/E grades
5d9280e 2026-02-15 13:26 Remove 64-person cap on max participants, default to 100
785e31e 2026-02-15 13:30 Remove max_participants limit entirely
1a5737c 2026-02-15 13:44 Major feature: Event system with categories (MD/WD/XD), age groups, grade merging
ec0f1c0 2026-02-15 13:55 Add bulk participant registration (text paste + CSV upload)
fe323e1 2026-02-15 13:59 Add 100 test participants and downloadable test data file
6ec5944 2026-02-15 14:06 Add auto team assignment for events
```

### Phase 2: 코트 점수판 & 운영 시스템 (2026-02-15)
```
237b59a 2026-02-15 14:16 Feature: Court-side scoreboard for live score management on tablets
4c465f3 2026-02-15 14:30 Improve: Full operational system for tablet/mobile management
f39c184 2026-02-15 14:34 Add PROJECT_HISTORY.md for session recovery
```

### Phase 3: 점수 규칙 & 코트 UX 강화 (2026-02-15 ~ 02-16)
```
dd726c3 2026-02-15 23:24 Feature: Score rules - 25pt for preliminary (KDK/League), 21pt for finals (Tournament)
a94f6a2 2026-02-15 23:53 1세트 단판 규칙 적용 완료
5b9fb60 2026-02-16 00:09 코트 점수판 좌우 레이아웃 + 터치 점수 입력 + 전후반 교체
467b27d 2026-02-16 00:23 사이드 선택 UX 강화 + 자동 코트 교체 로직 개선
2115700 2026-02-16 00:32 경기 종료 후 점수 확인 서명 기능 추가
012d13c 2026-02-16 00:40 탁구 아이콘을 배드민턴 셔틀콕 아이콘으로 교체
dab6c06 2026-02-16 00:50 가이드북 v2.0 업데이트: 사이드선택/자동교체/서명확인/아이콘교체 반영
```

### Phase 4: 혼복 & 데이터 확장 (2026-02-16)
```
adcf946 2026-02-16 01:09 feat: 혼합복식(혼복) 참가 여부 기능 추가
9059c72 2026-02-16 05:10 data: 160명 테스트 참가자 seed 데이터 (남96/여64, 급수·혼복 분포 포함)
d1a3a8f 2026-02-16 05:52 feat: 조편성/대진표 옵션 시스템 구현
```

### Phase 5: 실전 데이터 & 결선/대시보드/참가자 (2026-02-16)
```
bd4d136 2026-02-16 09:12 feat: 실제 장년부 회원 데이터(177명, 18개 클럽) seed.sql 생성 및 대진표 응답 개선
6988785 2026-02-16 09:18 docs: README.md 전면 업데이트 - 전체 기능/API/데이터모델/사용가이드 반영
4e5822d 2026-02-16 10:31 feat: 결선 토너먼트, 통계 대시보드, 참가자 페이지 구현 (1,418 insertions)
ed9e94c 2026-02-16 10:33 docs: README 업데이트 - 결선 토너먼트, 통계, 참가자 페이지 문서화
```

### Phase 6: 개발 문서 & 운영 매뉴얼 (2026-02-16)
```
dfd2e39 2026-02-16 10:40 docs: 개발문서 전면 보강 - 전체 API 엔드포인트, DB 스키마, 비즈니스 로직 상세 문서화
f7bbc3a 2026-02-16 10:46 docs: 현장 운영 셋팅 가이드 추가 - 장비/네트워크/인력 배치, 당일 타임라인
4e32fb5 2026-02-16 10:54 feat: A4 인쇄용 현장 운영 매뉴얼 HTML 추가 (/static/manual.html)
2772f76 2026-02-16 11:10 docs: 네트워크 섹션 대폭 보강 - 체육관 환경, 대역 분리, 공유기 설치, 비상 대응
9db6648 2026-02-16 11:19 docs: 공유기 추천을 실제 구매 가능 제품으로 업데이트 (가격/링크/구매방법 포함)
ac8e09e 2026-02-16 docs: PROJECT_HISTORY.md 전면 업데이트
```

### Phase 7: UI 리디자인 & 타임라인 (2026-02-16 ~ 02-17)
```
cb6a8d9 2026-02-16 11:49 design: 메인 페이지 전면 리디자인 - Sport Command Center 테마
f6951e0 2026-02-16 feat: 코트별 타임라인 API 엔드포인트 추가 및 메인 페이지 타임라인 카드 UI 구현
5414b92 2026-02-16 perf: 타임라인 대폭 최적화 - API 응답 69% 경량화(92KB→28KB), DOM 67% 절감, 툴팁 이벤트 위임
1065a01 2026-02-17 fix: 대회 타이틀 변경 → 2026 안양시배드민턴협회 장년부 자체대회
```

### Phase 8: 푸시 알림 시스템 (2026-02-17)
```
024d98c 2026-02-17 docs: PROJECT_HISTORY.md 전면 업데이트
43b291b 2026-02-17 feat: 푸시 알림 & 인앱 알림 시스템 구현
  - DB: push_subscriptions, notification_logs 테이블
  - Backend: VAPID JWT + ECE 암호화 순수 구현 (Web Crypto API)
  - Frontend: /my 페이지 구독 UI, 인앱 배너, 15초 폴링 감지
  - Service Worker, 진동/소리 효과
  - matches.ts 연동: 경기 시작/준비 자동 발송
```

### Phase 9: 대회 삭제 & 연령대 세분화 (2026-02-18)
```
90ec34c 2026-02-18 feat: 대회 삭제 버튼 추가 + 연령대 세분화 (50대/55대/60대)
  - 관리자 전용 삭제 버튼 (이중 확인 대화상자)
  - 연령대 '50대 이상' → 50대, 55대, 60대 3개로 세분화
  - 백엔드 종목 연령대 유효성 검증 업데이트
ce5b7ac 2026-02-18 fix: 연령대 라벨에서 '55세 이상', '60세 이상' 문구 제거
```

### Phase 10: 출생년도 기반 연령대 자동 분류 (2026-02-18)
```
1b31c54 2026-02-18 feat: 출생년도 기반 연령대 자동 분류 (50대/55대/60대)
  - getAgeFilter() 함수: 출생년도 → SQL 필터 (2026년 기준)
    · 50대: 만 50~54세 (1972~1976년생)
    · 55대: 만 55~59세 (1967~1971년생)
    · 60대: 만 60세 이상 (~1966년생)
    · 40대: 1977~1986, 30대: 1987~1996, 20대: 1997~2006
  - 자동 팀편성(auto-assign) 쿼리에 연령대 필터 적용
  - 미리보기(preview-assignment) 쿼리에 연령대 필터 적용
  - 프론트엔드 참가자 목록에 연령대 컬럼 추가
  - 참가자 통계에 연령대별 인원수 표시
```

### Phase 11: 종목 일괄 생성 + 다중선택 (2026-02-18)
```
207ce5f 2026-02-18 feat: bulk event creation with multi-select categories and age groups
  - 종목/팀 탭에 "일괄 생성" 버튼 추가
  - 4단계 모달 UI:
    ① 종목 유형 다중 선택 (남복/여복/혼복 체크박스)
    ② 연령대 다중 선택 (오픈~60대, 참가자 수 표시)
    ③ 급수 선택 (전체 또는 개별 급수)
    ④ 자동 팀편성 옵션 (클럽우선/급수매칭/랜덤)
  - 백엔드 POST /events/bulk-create API
  - 선택 조합에 따라 종목 자동 생성 + 팀편성 연동
  - Cloudflare Pages 배포 완료
```

### Phase 12: 조편성/종목 일괄 삭제 (2026-02-18)
```
fd065f1 2026-02-18 feat: 조편성 일괄삭제 + 종목 전체삭제 기능 추가 (이중 확인, 삭제 건수 표시)
25dca89 2026-02-18 fix: toast → showToast 함수명 수정 (ReferenceError 해결)
bd472d2 2026-02-18 fix: api() 호출 시그니처 수정 - method를 options 객체로 전달
1318f41 2026-02-18 fix: 일괄삭제 함수 수정 - currentTournament.id 사용 + loadEvents로 갱신
  - DELETE /events/all/assignments: 모든 팀/경기/순위 삭제 (종목 유지)
  - DELETE /events/all/everything: 종목 포함 전체 삭제
  - 관리자 전용 버튼 (이중 확인 대화상자)
  - 삭제 건수 표시 (예: "42팀, 214경기, 116순위 삭제")
```

### Phase 13: 급수합병 유연화 (2026-02-18)
```
523394a 2026-02-18 feat: 급수합병 유연화 - 수동합병 모달, 연령대 간 합병 허용, threshold 실시간 변경, 합병 취소(되돌리기)
6ad4f64 2026-02-18 feat: 합병 후 자동 조 재편성 (랜덤 셔플, 클럽 회피)
9cdd338 2026-02-18 feat: 합병 시 팀 해체→급수균형 재조합 (상위급수+하위급수 페어링) + 조 재편성
  - 수동 합병 모달: 체크박스로 종목 자유 선택, 카테고리/연령대 제한 없음
  - 연령대 간 합병: 50대 A급 + 55대 A급 등 서로 다른 연령대 합병 가능
  - 실시간 threshold 변경: 슬라이더(2~20) + PATCH API → 즉시 재체크
  - 합병 취소(되돌리기): merged_from 복원, 팀 재배치
  - 급수균형 재조합: 팀 해체 → 급수 정렬 → 상위+하위 페어링 (A+E, A+D, B+C)
  - 자동 조 재편성: 재조합된 팀으로 5팀/조, 클럽 회피 + 랜덤 셔플
```

### Phase 14: 합병 후 팀원 이름 미표시 버그 수정 (2026-02-18)
```
f39ecf4 2026-02-18 fix: 합병 시 teams INSERT에 tournament_id 추가 (NOT NULL constraint 해결)
f62be92 2026-02-18 fix: 합병 후 팀원 이름 미표시 버그 수정 - INSERT에 team_name 추가 + 프론트엔드 fallback
  - 원인: 합병 시 재조합 INSERT에서 team_name 컬럼 누락 → 빈 문자열
  - 백엔드: INSERT에 team_name = "선수1 · 선수2" 추가
  - 프론트엔드: team_name 비어있을 때 p1_name · p2_name fallback 표시 (이중 안전장치)
```

### Phase 15: 인쇄 센터 구현 & 개선 (2026-02-18)
```
798fff9 2026-02-18 feat: 인쇄 센터 페이지 추가 (/print) - 수기 운영 대비 6종 인쇄물
75c9be6 2026-02-18 feat: 인쇄 센터 진입점 추가 - 홈 화면 카드 + 대회 상세 상단 인쇄 버튼
9df8f23 2026-02-18 perf: 인쇄 페이지 로딩 속도 개선 - 통합 API(/print-data) 도입
99ffe0b 2026-02-18 improve: 인쇄 센터 - Google Fonts 비차단 로드 + 경기 미생성 시 빈 양식 제공
4988e6b 2026-02-18 fix: 인쇄 센터 메뉴 토글 반응 개선 - 로딩 중 버튼 비활성화, 스크롤 이동, 취소선 표시
845f893 2026-02-18 improve: 결선 대진표 개선 - 시각적 브래킷 + 4강 크로스 시드 배치 + 라운드별 승자 흐름
aed7f54 2026-02-18 fix: 결선 대진표 누락 종목 수정 - group_num=NULL도 전체 브래킷 생성, BYE 배치
  - /print?tid={대회ID}: 수기 운영 대비 6종 A4 인쇄물
    ① 참가자 명단 (클럽별 그룹, 체크인/참가비 체크박스)
    ② 팀 편성표 (종목별 팀 목록, 조 번호)
    ③ 조별 대진표 (라운드/코트/팀 대진, 경기 미생성 시 빈 양식)
    ④ 점수 기록지 (코트별 기록용지, 경기 미생성 시 빈 양식)
    ⑤ 순위 집계표 (조별 승/패/승점/득실차)
    ⑥ 결선 대진표 (시각적 토너먼트 브래킷, 크로스 시드, BYE 자동 배치)
  - 통합 API: GET /api/tournaments/:tid/print-data (참가자+종목+경기+팀 1회 조회)
  - Google Fonts 비차단 로드 (렌더링 블로킹 해소)
  - 메뉴 토글 UX: 로딩 중 비활성화, 토글 시 해당 섹션 스크롤, 비활성 취소선
  - 결선 브래킷: 조별(크로스 시드) + 리그전(전체 시드) + 단독(부전승) 3가지 유형
  - group_num=NULL인 종목도 전체 팀을 시드 배치한 토너먼트 브래킷 자동 생성

### Phase 16: 모바일 앱 최적화 & 독립 배포 자동화 (2026-02-22)
```
[2026-02-22] feat: 완전히 독립된 신규 Minton-Tennis Cloudflare 배포 파이프라인(deploy-new.js) 구축
  - 클라우드플레어 인증 및 신규 D1 DB 스키마/시드 데이터베이스 자동 프로비저닝 로직
[2026-02-22] design: 전체 화면 모바일 반응형 100% 최적화
  - 랜딩 페이지 (app.js): 글꼴 `clamp()` 반응형 조정, 간격 및 버튼 크기 최적화 
  - 서브 메뉴 및 통계 보드: 기존 4단 레이아웃을 모바일에 최적화된 2x2 그리드 배열로 변경
  - 참가자 및 순위 테이블: 모바일 화면 깨짐 방지 `overflow-x: auto` 적용
[2026-02-22] docs: 유지보수_지침서.md 신규 작성 (AI 활용 유지보수 가이드라인 포함)
```

### Phase 17: 경기 재배정 & 대시보드 재구축 (2026-03-01)
```
[2026-03-01] feat: 경기 배정 변경(Reassignment) 기능 구현
  - 백엔드 PUT /:tid/matches/:mid/reassign API (코트번호/경기순서/예정시간 변경)
  - 감사 로그 기록 + WebSocket 실시간 브로드캐스트
  - 프론트엔드 showScoreModal에 '경기 배정 변경' 섹션 추가 (접이식 UI)
[2026-03-01] refactor: 대시보드 페이지 완전 재구축
  - index.tsx 인라인 HTML (~400줄) → 별도 src/dashboard.html 파일로 분리
  - commonHead 의존성 제거 (tosspayments 스크립트 충돌 해결)
  - confirm() 다이얼로그 차단 문제 근본 해결
  - 라이트 테마 통일, Chart.js 차트 색상 최적화
  - 구장(Venue)별 코트 점수판/전광판 바로가기 링크 자동 생성
[2026-03-01] fix: 서비스 워커 캐시 버전 업데이트 (mp-v3.4, SW v3.6)
[2026-03-01] deploy: Cloudflare Pages 배포 완료
```


---

## 7. 샘플 데이터 현황

| 항목 | 수량 |
|------|------|
| 참가자 | 177명 (남 122명, 여 55명) |
| 소속 클럽 | 18개 |
| 팀 | 116팀 |
| 조 | 25개 |
| 경기 | 214경기 (6코트 배분) |

---

## 8. 빌드 & 실행 명령어

```bash
# 전체 리셋 (DB 초기화 + 시드)
cd /home/user/webapp
rm -rf .wrangler/state/v3/d1
npm run build
npx wrangler d1 migrations apply badminton-production --local
npx wrangler d1 execute badminton-production --local --file=./seed.sql

# 서비스 시작/재시작
fuser -k 3000/tcp 2>/dev/null || true
pm2 restart badminton  (또는 pm2 start ecosystem.config.cjs)

# 빌드만 (코드 수정 후)
npm run build
pm2 restart badminton

# 로그 확인
pm2 logs badminton --nostream

# 헬스체크
curl http://localhost:3000/api/health

# npm 명령어
npm run build             # Vite 빌드
npm run db:reset          # DB 완전 초기화
npm run db:migrate:local  # 마이그레이션 적용
npm run db:seed           # 시드 데이터
```

---

## 9. 주요 설정

### wrangler.jsonc
```jsonc
{
  "name": "webapp",
  "compatibility_date": "2026-02-15",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "badminton-production",
    "database_id": "local-dev-db"
  }]
}
```

### ecosystem.config.cjs (PM2)
```javascript
{
  name: 'badminton',
  script: 'npx',
  args: 'wrangler pages dev dist --d1=badminton-production --local --ip 0.0.0.0 --port 3000'
}
```

### 의존성
- **runtime**: hono ^4.11.9
- **dev**: @hono/vite-build, @hono/vite-dev-server, vite ^6.3.5, wrangler ^4.4.0

---

## 10. 현재 상태 & 남은 작업

### ✅ 완료된 기능 (38개)
- [x] 대회 CRUD (생성/수정/삭제/상태변경)
- [x] **대회 삭제 버튼** — 관리자 전용, 이중 확인 대화상자
- [x] 참가자 관리 (개별/일괄 등록, 참가비, 체크인, 클럽)
- [x] 종목 시스템 (남복/여복/혼복, 연령대, 급수)
- [x] **연령대 세분화** — 50대(50~54), 55대(55~59), 60대(60+) 출생년도 기반 자동 분류
- [x] **종목 일괄 생성** — 종목유형/연령대/급수 다중선택 → 조합 자동 생성 + 팀편성 연동
- [x] 자동 팀편성 (성별/급수/연령대 고려, 단일/전체)
- [x] 급수합병 (인접급수 자동 합병)
- [x] 조 배정 (종목별 그룹 배정)
- [x] 대진표 생성 (KDK/풀리그/토너먼트, 조별 옵션)
- [x] 결선 토너먼트 (조별 상위팀 → 단판 싱글 엘리미네이션)
- [x] 점수 관리 (세트별 점수, 승자, 순위 자동계산)
- [x] 코트 전용 점수판 (/court) — URL 파라미터, 자동 다음경기, QR코드, 읽기전용, 전체보기
- [x] 경기 서명 확인 기능
- [x] 통계 대시보드 (/dashboard) — 전체/종목별/클럽별 실시간 통계
- [x] 참가자 개인 페이지 (/my) — 이름+연락처로 내 경기 조회, QR 접속
- [x] 스코어보드 (관중용, 자동갱신)
- [x] 결과/순위표 + PDF 출력
- [x] 감사 로그
- [x] 반응형 UI (모바일/태블릿/데스크탑)
- [x] A4 인쇄용 현장 운영 매뉴얼 (/static/manual.html)
- [x] 네트워크 구성 가이드 (공유기 추천, 구매 링크 포함)
- [x] 실제 장년부 데이터 시딩 (177명, 18개 클럽)
- [x] **메인 페이지 Sport Command Center 리디자인** (에메랄드 테마)
- [x] **코트별 타임라인** (/timeline) — 전체 경기 흐름 시각화, 성능 최적화 완료
- [x] **푸시 알림** (Web Push API, VAPID JWT, ECE 암호화, Service Worker)
- [x] **인앱 알림** (15초 폴링, 배너+진동+소리, 상태 변경 감지)
- [x] **Cloudflare Pages 배포** — https://badminton-tournament-5ny.pages.dev
- [x] **조편성 일괄 삭제** — 모든 팀/경기/순위 삭제 (종목 유지), 이중 확인
- [x] **종목 전체 삭제** — 종목 포함 전체 삭제, 삭제 건수 표시
- [x] **수동 합병 모달** — 체크박스로 종목 자유 선택, 커스텀 이름 지정
- [x] **연령대 간 합병** — 서로 다른 연령대 합병 허용
- [x] **실시간 합병 기준 변경** — 슬라이더 UI + PATCH API
- [x] **합병 취소(되돌리기)** — merged_from 복원, 팀 재배치
- [x] **합병 후 급수균형 재조합** — 팀 해체 → 급수 정렬 → 상위+하위 페어링
- [x] **인쇄 센터** (/print) — 수기 운영 대비 6종 A4 인쇄물 (참가자/팀/대진표/점수기록지/순위표/결선브래킷)
- [x] **결선 대진표 시각화** — 토너먼트 브래킷 형태, 크로스 시드, BYE 자동 배치, group_num=NULL 종목 지원
- [x] **코트 점수판 승리/패배 라벨 수정** — 라벨 반대 표시 버그 수정 + 서명 후 버튼 가시성 개선
- [x] **모바일 100% 최적화 반응형 디자인(Responsive UI)** — 랜딩 페이지 및 대시보드 2x2 카드, 테이블 스와이프 기능 적용
- [x] **독립 배포 체계 스크립트화 (`deploy-new.js`)** — 기존 DB 충돌 없이 100% 분리된 새 Cloudflare Pages 프로젝트 자동 배포 체계.
- [x] **경기 배정 변경** — 점수 모달에서 코트/경기순서/시간 직접 변경 + 감사로그 + WebSocket
- [x] **대시보드 재구축** — 독립 HTML 파일, 외부 스크립트 충돌 해결, 라이트 테마, 구장별 링크

### 🔮 향후 개선 가능 사항
- [x] ~~Cloudflare Pages 실 배포~~ ✅ 완료
- [ ] GitHub 푸시
- [ ] 실시간 WebSocket (현재는 폴링 방식)
- [ ] 다중 대회 동시 운영 최적화
- [ ] 오프라인 모드 (Service Worker 캐싱 확장)
- [ ] 대회 결과 통계 리포트 (PDF 자동 생성)

---

## 11. 세션 복원 절차

새 세션에서 이 파일을 읽은 후 아래 순서로 복원합니다:

```bash
# 1. 현재 상태 확인
cd /home/user/webapp
git log --oneline -5
pm2 list

# 2. 서비스가 죽어있으면 재시작
npm run build
fuser -k 3000/tcp 2>/dev/null || true
pm2 start ecosystem.config.cjs

# 3. DB가 초기화되었으면
npm run db:reset

# 4. 동작 확인
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tournaments

# 5. 주요 페이지 확인
# 관리자: http://localhost:3000/
# 코트 점수판: http://localhost:3000/court?tid=1&court=1
# 대시보드: http://localhost:3000/dashboard?tid=1
# 내 경기: http://localhost:3000/my?tid=1
# 타임라인: http://localhost:3000/timeline?tid=1
# 인쇄 센터: http://localhost:3000/print?tid=1
# 운영 매뉴얼: http://localhost:3000/static/manual.html

# 6. 알림 DB 마이그레이션 (최초 1회)
npx wrangler d1 migrations apply badminton-production --local
```

---

## 변경 이력 (Change Log)

### v3.2 — 2026-02-22

#### 코트 점수판 UI 개선 (`public/static/court.js`)

1. **QR 코드 모달 3탭 분리**
   - 🏸 **심판용**: `/court?tid=X&court=Y` — 잠금 없음, 터치로 점수 입력 가능
   - 📺 **관람용**: `/court?tid=X&court=Y&locked=1` — 동일한 점수판, 터치/입력 완전 비활성 (대형 모니터·관중용)
   - ⌚ **워치용**: `/watch?tid=X&court=Y` — `/watch` 페이지, 스마트워치·소형화면 최적화
   - 탭 전환 함수: `window.switchQrMode('judge'|'view'|'watch')`

2. **페이지 네비게이션 뒤로가기 버튼 추가**
   - 코트 센터 (`/court?tid=X`) 좌상단: **← 대회 관리** 버튼 → `/?tid=X` 이동
   - 코트 점수판 상단 바: **← 코트 센터** 버튼 → `/court?tid=X` 이동
   - 경기 진행 중 이동 시 confirm 다이얼로그 표시 (점수 손실 방지)
   - 이동 함수: `window.goToCourtCenter()`

#### 배포 자동화 (`deploy.ps1`)

- `public/static/` → `dist/static/` 자동 동기화 단계 추가
- Vite 빌드만으로는 static 파일이 dist에 복사되지 않는 문제 해결
- 사용법: `.\deploy.ps1` 또는 `.\deploy.ps1 -Message "설명"`

#### 백업

- 위치: `c:\new_대회운영관리시스템\backup\`
- `minton_tennis_20260301_2203.zip` (v3.6 전체 포함, ~410MB)
- `minton_tennis_backup_20...` 등 다수 백업본 존재.

### v3.7 — 2026-03-02

#### 단체 홈페이지 (Organization) 멤버/일정 통합 관리 및 고도화
1. **회원 관리 시스템 구축 (`public/static/app.js`, `src/routes/orgs.ts`)**
   - **개별 등록**: 중앙 DB에 없는 신규 유저를 직접 등록하고 단체로 즉시 편입시키는 기능 (`showCreateOrgMember` UI 및 `addOrgMemberAction` 연동).
   - **일괄 등록**: 엑셀/CSV 데이터를 텍스트 영역에 붙여넣기 하여 수십/수백 명의 회원을 이름과 전화번호 기반으로 자동 인식·검색·중앙 DB 생성 및 단체 편입까지 원클릭으로 처리 (`POST /api/orgs/:id/members/bulk`).
   - **양식 다운로드**: 엑셀/CSV 일괄 등록을 위한 템플릿 파일 다운로드 프론트엔드 기능.
   - **전체 삭제**: 단체 내 모든 회원을 중앙 서버에 손상 없이 일괄 추방/초기화시키는 엔드포인트 (`DELETE /api/orgs/:id/members`).
   - **명부 저장**: 현재 단체의 전체 소속 회원 목록을 로컬에서 엑셀(CSV 형태)로 저장하는 내장 기능 (`exportOrgMembers`).
   - **검색 기능**: 회원 관리 모달 내에서 이름, 클럽, 전화번호 등을 조건으로 즉시 필터링되는 로컬 검색창 추가 (`orgMemberSearch`).
   - 단체 개별 회원 수정 및 삭제 UI/로직 다이얼로그와 연동 강화.

2. **일정 관리 고도화 및 반복 생성**
   - **반복 생성**: 일정을 월 단위로 여러 번 생성할 수 있도록 `POST /api/orgs/:id/schedules`에 `repeat_months` 옵션 부여. 2개월, 5개월, 11개월(1년 치) 반복 생성을 UI 스위치로 제공.
   - **수정 기능**: 이미 등록된 일정을 수정할 수 있는 `PUT /api/orgs/:id/schedules/:scheduleId` 엔드포인트와 수정 UI 프론트 (`editOrgSchedule`).
   - 일정 삭제 기능 UI 정비.

3. **출석 체크 및 통계**
   - **출석 테이블 구축**: `schedule_attendances` 마이그레이션 적용 (`0020_org_schedule_attendances.sql`).
   - **개별 일정 출석 체크**: 특정 일정 카드의 "✅ 출석체크" 버튼을 누르면 단체 전체 회원이 로드되며, 체크박스로 간편하게 참석/결석 여부 일괄 저장 (`manageOrgScheduleAttendance` 및 `POST /api/orgs/:id/schedules/:scheduleId/attendance`).
   - **출석 통계 랭킹보드**: 출석 횟수를 기준으로 단체 내 회원들의 개인별 출석 랭킹(Top 50)과 최근 12개월간의 월별 행사 참석 연인원 그래프를 확인할 수 있는 통계 팝업 추가 (`showOrgAttendanceStats`).

4. **종합 재무 관리 (수입/지출/정산/통계)**
   - **지출 테이블 구축**: 카테고리별 지출내역 저장을 위한 `org_expenses` 마이그레이션 적용 (`0021_org_finances.sql`).
   - **수입/청구 (회비)**: 연회비, 월회비 외에 회차별 참가비, 특별회비를 완납/미납 상태로 등록 (`POST /api/orgs/:id/dues`).
   - **지출 관리**: 코트/구장 임대료, 용품비, 유니폼, 식대 등 카테고리별로 금액을 등록하고 지출 흐름 모니터링 (`POST /api/orgs/:id/expenses`).
   - **N빵 정산 (자동 청구)**: 회식이나 단체 대관 등 총 금액을 입력하고 대상 회원을 다중 선택하면, 1/N 금액을 10원 단위로 올림 계산해 해당 회원들에게 각각 **'미납 청구(참가비)'** 형태로 자동 발행하는 스마트 정산 시스템 (`POST /api/orgs/:id/finances/settlement`).
   - **재무 현황 통계**: 실시간 재무 잔액, 총 수입/지출 비교, 그리고 누적 지출 카테고리별 총액 등을 직관적인 UI로 제공 (`GET /api/orgs/:id/finance-stats`).

5. **단체 소통 커뮤니티 (게시판 관리)**
   - **게시판 테이블 설계**: `org_boards`, `org_posts`, `org_comments` 다중 테이블 마이그레이션 적용 (`0022_org_boards.sql`).
   - **다중 게시판 생성**: 공지사항, 자유게시판, 갤러리 등 용도(유형)에 따른 게시판 스레드를 관리자가 다수 생성 가능 (`POST /api/orgs/:id/boards`).
   - **게시글 및 댓글**: 게시물 목록 및 조회수 체크, 댓글 작성/삭제 등 체계적인 정보 교환 기능 구현 (`GET /api/orgs/:id/boards/:id/posts` 등).
   - **UI 통합**: 관리자 대시보드 및 각 단체 카드의 `📋 게시판 관리`를 통해 즉각적으로 접근 및 관리 가능 (`manageOrgBoards`).

6. **단체 물품 재고 관리**
   - **재고 테이블 설계**: `org_inventory_items` (품목 마스터), `org_inventory_logs` (수량 변동 내역) 다중 테이블 마이그레이션 적용 (`0023_org_inventory.sql`).
   - **품목 등록 및 카테고리화**: 셔틀콕, 공, 유니폼, 음료, 기타 비품 등 카테고리 구분이 가능한 자산 관리 체계 구현. (`POST /api/orgs/:id/inventory`).
   - **입/출고/조정**: 변동 사항을 명확히 추적하기 위한 입고(+), 사용/출고(-), 실사조정 로직 구현 및 변경 사유 메모(`POST /api/orgs/:id/inventory/:itemId/logs`).
   - **대시보드 통합**: `📦 물품 재고관리` 버튼을 통해 품목 리스트와 재고 변동 내역 모달을 호출하는 UI (`manageOrgInventory`).

7. **단체 회원 SMS/알림톡 발송 기능**
   - **선택/전체 대상 발송**: 단체 회원 관리 모달에서 개별 체크박스 또는 전체 체크박스로 발송 대상을 선택 가능.
   - **결측값 알림**: 체크한 회원 중 연락처가 누락된 인원을 감지해 발송 전 관리자에게 명시적 동의 확인(안전장치).
   - **Solapi 연동**: 기존 매치 알림용으로 등록된 SolAPI SDK를 활용하여 커스텀 단체 메시지 (`[단체명] 아무개님, <내용>`)를 문자 서버로 비동기 전송하는 엔드포인트 마련 (`POST /api/orgs/:id/members/sms`).
   - **발송 기록 피드백**: `N건 성공, N건 실패/누락` 피드백 토스트로 직관적 결과 안내.