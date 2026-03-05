-- Migration number: 0021_org_finances.sql

-- 지출 관리 테이블 (Expenses)
CREATE TABLE IF NOT EXISTS org_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE, -- 클럽별 지출일 경우
    category TEXT NOT NULL, -- 코트대관료, 용품비, 대회참가비, 회식비, 기타
    amount INTEGER NOT NULL,
    description TEXT,
    receipt_url TEXT, -- 영수증 이미지 URL
    expense_date DATETIME NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_expenses_org ON org_expenses(org_id);
