-- Migration: 0025_match_records.sql
-- 내부 경기 기록 테이블

CREATE TABLE IF NOT EXISTS org_match_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    match_date TEXT NOT NULL,
    match_type TEXT DEFAULT 'singles', -- singles, doubles
    player1_name TEXT NOT NULL,
    player2_name TEXT NOT NULL,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    player3_name TEXT, -- 복식 파트너
    player4_name TEXT, -- 복식 파트너
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
