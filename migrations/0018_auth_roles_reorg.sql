-- Migration number: 0017_auth_roles_reorg.sql   2026-03-01
-- [사용자 및 인증 모듈 재정립] 
-- 통합 계정 테이블(users) 및 다차원 권한(user_roles), 클럽(clubs) 도입

-- 1. 통합 유저 테이블
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  username        TEXT     NOT NULL UNIQUE,    
  email           TEXT     UNIQUE,             
  password_hash   TEXT     NOT NULL,           
  password_salt   TEXT     NOT NULL,           
  global_role     TEXT     DEFAULT 'user',     -- super_admin, user
  name            TEXT,                        -- 가입자 실명
  phone           TEXT,                        
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 협회 산하 클럽 테이블
CREATE TABLE IF NOT EXISTS clubs (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  org_id          INTEGER  REFERENCES organizations(id),
  name            TEXT     NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 다차원 역할(Role) 매핑 테이블 (RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type     TEXT     NOT NULL,       -- 'organization', 'club', 'tournament'
  target_id       INTEGER  NOT NULL,       -- org_id, club_id, tournament_id
  role            TEXT     NOT NULL,       -- 'admin', 'manager', 'staff' 등
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, target_type, target_id)
);

-- 4. 기존 데이터 마이그레이션 (admin_accounts -> users)
-- (plan이 premium/club 인 경우 슈퍼어드민으로 간주하거나, 기본적으로 전부 일단 등록)
INSERT INTO users (id, username, email, password_hash, password_salt, global_role)
SELECT id, username, email, password_hash, password_salt,
       CASE WHEN username = 'admin' THEN 'super_admin' ELSE 'user' END
FROM admin_accounts
WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = admin_accounts.id);

-- (기존 관리자들의 대회를 다 user_roles 에 매핑)
INSERT INTO user_roles (user_id, target_type, target_id, role)
SELECT owner_id, 'tournament', id, 'admin' 
FROM tournaments
WHERE owner_id IS NOT NULL;

-- 5. 기존 테이블에 user_id 컬럼 추가
-- (동호인 선수 프로필과 웹사이트 로그인 계정을 연결)
ALTER TABLE members ADD COLUMN user_id INTEGER REFERENCES users(id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_target ON user_roles(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_clubs_org ON clubs(org_id);
