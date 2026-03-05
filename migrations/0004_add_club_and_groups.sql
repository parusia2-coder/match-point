-- Migration number: 0004 	 2024-02-19T00:00:00.000Z
ALTER TABLE participants ADD COLUMN club TEXT;
ALTER TABLE teams ADD COLUMN group_num INTEGER;
ALTER TABLE matches ADD COLUMN group_num INTEGER;

CREATE INDEX idx_participants_club ON participants(club);
CREATE INDEX idx_teams_group_num ON teams(group_num);
CREATE INDEX idx_matches_group_num ON matches(group_num);
