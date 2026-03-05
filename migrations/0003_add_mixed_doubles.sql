-- Migration number: 0003 	 2024-02-19T00:00:00.000Z
ALTER TABLE participants ADD COLUMN wants_mixed INTEGER DEFAULT 0;
