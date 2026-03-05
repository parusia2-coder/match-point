-- Migration number: 0011   2026-02-22T00:00:00.000Z
-- 멀티 테넌시: members 테이블에 owner_id 추가

-- members 테이블에 소유자 연결
ALTER TABLE members ADD COLUMN owner_id INTEGER REFERENCES admin_accounts(id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_members_owner ON members(owner_id);

-- member_tournament_history에도 owner_id (선택)
-- (members.owner_id로 조인하면 되므로 별도 추가 불요)
