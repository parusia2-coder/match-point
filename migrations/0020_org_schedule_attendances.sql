-- Migration number: 0020_org_schedule_attendances.sql

-- 일정 참석 인원 체크를 위한 테이블
CREATE TABLE IF NOT EXISTS schedule_attendances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE, -- 출석 통계 집계를 쉽게 하기 위함
    status TEXT DEFAULT 'present', -- 'present' (출석), 'absent' (결석), 'late' (지각), 'excused' (공결/사유)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_attendances_schedule ON schedule_attendances(schedule_id);
CREATE INDEX IF NOT EXISTS idx_attendances_member ON schedule_attendances(member_id);
CREATE INDEX IF NOT EXISTS idx_attendances_org ON schedule_attendances(org_id);
