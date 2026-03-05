-- Migration number: 0009   2026-02-22T00:00:00.000Z
-- 개인 경기 기록 테이블 (회원 ↔ 완료된 경기 1:1 매핑)
-- 경기 완료(status=completed) 시 자동 INSERT

CREATE TABLE IF NOT EXISTS member_match_records (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,

  -- 회원 연결
  member_id         INTEGER  NOT NULL REFERENCES members(id),
  partner_member_id INTEGER  REFERENCES members(id),   -- 복식 파트너 (없으면 NULL)

  -- 경기 연결
  match_id          INTEGER  NOT NULL REFERENCES matches(id),
  tournament_id     INTEGER  NOT NULL REFERENCES tournaments(id),
  event_name        TEXT,
  round             INTEGER,
  court_number      INTEGER,

  -- 결과
  my_score          INTEGER  DEFAULT 0,   -- 내 팀 총 점수 합
  opp_score         INTEGER  DEFAULT 0,   -- 상대 팀 총 점수 합
  my_set1           INTEGER  DEFAULT 0,
  my_set2           INTEGER  DEFAULT 0,
  my_set3           INTEGER  DEFAULT 0,
  opp_set1          INTEGER  DEFAULT 0,
  opp_set2          INTEGER  DEFAULT 0,
  opp_set3          INTEGER  DEFAULT 0,
  result            TEXT     CHECK(result IN ('win','loss','draw')),

  -- 상대 팀 정보 (스냅샷 — 조회 편의)
  opp_names         TEXT,   -- "김철수 · 이영희"

  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_mmr_member_id     ON member_match_records(member_id);
CREATE INDEX IF NOT EXISTS idx_mmr_match_id      ON member_match_records(match_id);
CREATE INDEX IF NOT EXISTS idx_mmr_tournament_id ON member_match_records(tournament_id);
CREATE INDEX IF NOT EXISTS idx_mmr_result        ON member_match_records(result);

-- 중복 방지 (동일 회원+경기 조합 1건만)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mmr_unique ON member_match_records(member_id, match_id);
