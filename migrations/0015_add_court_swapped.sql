-- Migration number: 0015 	 2026-02-28T03:00:00.000Z
ALTER TABLE matches ADD COLUMN court_swapped INTEGER DEFAULT 0;
