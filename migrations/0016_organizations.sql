-- Migration number: 0016_organizations.sql   2026-02-28
-- [통합 플랫폼 + 블록형 분양] 구조를 위한 B2B/협회(Organization) 뼈대 구축

-- 1. 단체(협회/구/시 체육회/대형클럽) 코어 테이블
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER REFERENCES admin_accounts(id), -- 시스템 개설자/소유자
    slug TEXT UNIQUE NOT NULL, -- 접속 서브도메인 URL 경로 (예: songpa, seoul)
    name TEXT NOT NULL, -- 단체 공식 명칭
    sport_type TEXT DEFAULT 'badminton', -- 종목 (badminton, tennis)
    logo_url TEXT, -- 단체 로고 이미지 URL
    theme_color TEXT DEFAULT '#f97316', -- 브랜드 컬러 (프론트엔드 전체 UI 테마 강제 조정)
    contact_email TEXT,
    contact_phone TEXT,
    bank_account TEXT, -- 연회비 및 공통 참가비 납부용 계좌
    site_layout TEXT, -- JSON: 드래그앤드롭 홈페이지 블록/위젯 배치 정보 (인사말, 랭킹표 등)
    custom_rules TEXT, -- JSON: 이 협회만의 승급 룰, 랭킹 포인트 등 특수 엔진 설정
    plan_tier TEXT DEFAULT 'standard', -- 요금제 (standard, premium, enterprise)
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 협회 소속 회원 매핑 및 행정 데이터 (연회비, 공인 급수 등)
CREATE TABLE IF NOT EXISTS org_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id),
    member_id INTEGER REFERENCES members(id), -- 중앙 회원DB의 ID
    role TEXT DEFAULT 'member', -- 권한 (member, admin, staff 등)
    affiliated_club TEXT, -- 협회 내 세부 소속 클럽명 (ex: 올림픽동호회)
    official_level TEXT, -- 협회에서 발급/인증한 공인 급수(A, B, C 등)
    total_points INTEGER DEFAULT 0, -- 협회 연간 누적 통합 포인트 (별도 랭킹 산정용)
    last_dues_year INTEGER, -- 마지막으로 협회비/연회비를 납부한 연도 (미납시 신청 차단용)
    status TEXT DEFAULT 'active',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, member_id)
);

-- 3. 대회 테이블을 단체(org)에 종속시킴
-- 만약 org_id가 NULL이면 특정 단체 종속이 아닌 개인(일반) 개설 대회로 취급됨
ALTER TABLE tournaments ADD COLUMN org_id INTEGER REFERENCES organizations(id);

-- 성능 최적화 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_member ON org_members(member_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_org ON tournaments(org_id);
