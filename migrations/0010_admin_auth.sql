-- Migration number: 0010   2026-02-22T00:00:00.000Z
-- 관리자 계정 시스템 (JWT 기반 인증)

-- ============================================================
-- 1. 관리자 계정 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_accounts (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  username        TEXT     NOT NULL UNIQUE,          -- 로그인 ID
  email           TEXT     UNIQUE,                   -- 이메일
  password_hash   TEXT     NOT NULL,                 -- PBKDF2 해시
  password_salt   TEXT     NOT NULL,                 -- 솔트
  organization    TEXT,                              -- 클럽명 / 협회명
  plan            TEXT     NOT NULL DEFAULT 'free',  -- free/club/premium
  active          INTEGER  NOT NULL DEFAULT 1,
  last_login_at   DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. JWT 갱신 토큰 저장 (선택 - 로그아웃/강제만료 지원)
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER  NOT NULL REFERENCES admin_accounts(id),
  token_hash  TEXT     NOT NULL UNIQUE,   -- SHA-256(refresh_token)
  expires_at  DATETIME NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. tournaments 테이블에 owner_id 추가
--    (어느 관리자 계정의 대회인지)
-- ============================================================
ALTER TABLE tournaments ADD COLUMN owner_id INTEGER REFERENCES admin_accounts(id);

-- ============================================================
-- 4. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_aa_username   ON admin_accounts(username);
CREATE INDEX IF NOT EXISTS idx_aa_email      ON admin_accounts(email);
CREATE INDEX IF NOT EXISTS idx_rt_admin_id   ON refresh_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires    ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_trn_owner     ON tournaments(owner_id);
