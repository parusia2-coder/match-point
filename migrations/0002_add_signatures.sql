-- Migration number: 0002 	 2024-02-19T00:00:00.000Z
ALTER TABLE matches ADD COLUMN team1_signature TEXT;
ALTER TABLE matches ADD COLUMN team2_signature TEXT;
ALTER TABLE matches ADD COLUMN signature_at DATETIME;
