-- Migration number: 0008   2026-02-22T00:00:00.000Z
-- 통합 회원 관리 시스템 (Member Master System)
-- 기존 테이블을 건드리지 않고 새 테이블 추가

-- ============================================================
-- 1. 마스터 회원 테이블 (대회와 독립적으로 존재)
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  phone        TEXT,                          -- 연락처 (중복 허용: 같은 번호 가족 가입 가능)
  gender       TEXT    NOT NULL CHECK (gender IN ('m', 'f')),
  birth_year   INTEGER NOT NULL,
  level        TEXT    NOT NULL DEFAULT 'D',  -- S/A/B/C/D
  club         TEXT,                          -- 소속 클럽
  memo         TEXT,                          -- 관리자 메모
  active       INTEGER NOT NULL DEFAULT 1,   -- 0: 탈퇴/비활성
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. 대회 참가 이력 테이블 (회원 ↔ 대회 연결)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_tournament_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL,
  tournament_id   INTEGER NOT NULL,
  participant_id  INTEGER,                   -- participants 테이블과 연결 (nullable: 레거시 대회)
  event_name      TEXT,                      -- 참가 종목명
  result_rank     INTEGER,                   -- 최종 순위 (1위=1, 2위=2, ...)
  wins            INTEGER DEFAULT 0,
  losses          INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id)     REFERENCES members(id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- ============================================================
-- 3. 인덱스 (검색 성능 최적화)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_members_name       ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_phone      ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_club       ON members(club);
CREATE INDEX IF NOT EXISTS idx_members_level      ON members(level);
CREATE INDEX IF NOT EXISTS idx_members_active     ON members(active);

CREATE INDEX IF NOT EXISTS idx_mth_member_id     ON member_tournament_history(member_id);
CREATE INDEX IF NOT EXISTS idx_mth_tournament_id ON member_tournament_history(tournament_id);

-- ============================================================
-- 4. participants 테이블에 member_id 연결 컬럼 추가
--    (대회 등록 시 기존 회원과 연결 가능)
-- ============================================================
ALTER TABLE participants ADD COLUMN member_id INTEGER REFERENCES members(id);
CREATE INDEX IF NOT EXISTS idx_participants_member_id ON participants(member_id);
