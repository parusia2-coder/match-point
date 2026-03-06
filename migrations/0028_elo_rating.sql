-- Migration: 0028_elo_rating.sql
-- Elo 레이팅 시스템: 개인 Elo 점수 + 히스토리 추적
-- Phase 3: AI 강화 로드맵

-- ============================================================
-- 1. members 테이블에 Elo 레이팅 필드 추가
-- ============================================================
ALTER TABLE members ADD COLUMN elo_rating INTEGER DEFAULT 1500;      -- 초기 Elo 값
ALTER TABLE members ADD COLUMN elo_peak INTEGER DEFAULT 1500;         -- 역대 최고 Elo
ALTER TABLE members ADD COLUMN elo_updated_at DATETIME;               -- 마지막 Elo 업데이트 시각

-- ============================================================
-- 2. Elo 히스토리 테이블 (변동 추적 → 그래프용)
-- ============================================================
CREATE TABLE IF NOT EXISTS elo_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL REFERENCES members(id),
    match_id        INTEGER REFERENCES matches(id),
    tournament_id   INTEGER REFERENCES tournaments(id),
    old_elo         INTEGER NOT NULL,
    new_elo         INTEGER NOT NULL,
    delta           INTEGER NOT NULL,              -- 변동량 (±)
    opponent_elo    INTEGER,                       -- 상대 Elo (당시)
    result          TEXT CHECK(result IN ('win','loss','draw')),
    event_name      TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_elo_history_member ON elo_history(member_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_date   ON elo_history(created_at);
CREATE INDEX IF NOT EXISTS idx_elo_history_match  ON elo_history(match_id);
