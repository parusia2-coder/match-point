-- Migration number: 0007 	 2026-02-21T09:20:00.000Z
ALTER TABLE tournaments ADD COLUMN theme_color TEXT DEFAULT '#10b981';
ALTER TABLE tournaments ADD COLUMN custom_logo TEXT;
