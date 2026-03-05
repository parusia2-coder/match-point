PRAGMA foreign_keys=OFF;

CREATE TABLE participants_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('m', 'f')),
  birth_year INTEGER NOT NULL,
  level TEXT NOT NULL,
  paid INTEGER DEFAULT 0,
  checked_in INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  club TEXT,
  wants_mixed INTEGER DEFAULT 0,
  partner TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

INSERT INTO participants_new (id, tournament_id, name, phone, gender, birth_year, level, paid, checked_in, deleted, created_at, updated_at, club, wants_mixed, partner)
SELECT id, tournament_id, name, phone, gender, birth_year, level, paid, checked_in, deleted, created_at, updated_at, club, wants_mixed, partner
FROM participants;

DROP TABLE participants;

ALTER TABLE participants_new RENAME TO participants;

PRAGMA foreign_keys=ON;
