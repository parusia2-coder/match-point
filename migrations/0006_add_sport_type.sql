-- Migration number: 0006 	 2026-02-21T05:58:00.000Z
ALTER TABLE tournaments ADD COLUMN sport_type TEXT DEFAULT 'badminton';
