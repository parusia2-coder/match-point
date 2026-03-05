-- Add custom score rules to tournaments
ALTER TABLE tournaments ADD COLUMN score_rule_prelim INTEGER DEFAULT 25;
ALTER TABLE tournaments ADD COLUMN score_rule_final INTEGER DEFAULT 21;
ALTER TABLE tournaments ADD COLUMN max_sets INTEGER DEFAULT 1;
