-- Migration number: 0019_billing_and_scheduling.sql

-- 1. 회비 납부 추적 (Billing/Dues)
CREATE TABLE IF NOT EXISTS dues_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id),
    club_id INTEGER REFERENCES clubs(id), -- 클럽 단위 회비인 경우
    member_id INTEGER REFERENCES members(id),
    amount INTEGER NOT NULL,
    payment_type TEXT NOT NULL, -- 'annual_fee', 'monthly_dues', 'join_fee'
    target_year INTEGER, -- 연회비일 경우 해당 연도
    target_month INTEGER, -- 월회비일 경우 해당 월 (1~12)
    payment_method TEXT, -- 'card', 'transfer', 'cash'
    payment_status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'refunded'
    toss_payment_key TEXT, -- 온라인 카드결제시
    memo TEXT,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 단체/클럽 통합 일정 (Scheduling)
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER REFERENCES organizations(id),
    club_id INTEGER REFERENCES clubs(id), 
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    event_type TEXT DEFAULT 'meeting', -- 'meeting', 'training', 'tournament_prep', 'etc'
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_dues_org_member ON dues_payments(org_id, member_id);
CREATE INDEX IF NOT EXISTS idx_schedules_org ON schedules(org_id);
