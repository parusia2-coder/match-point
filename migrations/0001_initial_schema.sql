-- Migration number: 0001 	 2024-02-19T00:00:00.000Z
CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  format TEXT DEFAULT 'kdk',
  games_per_player INTEGER DEFAULT 4,
  courts INTEGER DEFAULT 2,
  merge_threshold INTEGER DEFAULT 4,
  admin_password TEXT,
  deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participants (
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
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('md', 'wd', 'xd')),
  age_group TEXT NOT NULL,
  level_group TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  merged_from TEXT, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  tournament_id INTEGER NOT NULL,
  player1_id INTEGER NOT NULL,
  player2_id INTEGER NOT NULL,
  team_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (player1_id) REFERENCES participants(id),
  FOREIGN KEY (player2_id) REFERENCES participants(id)
);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  match_order INTEGER NOT NULL,
  court_number INTEGER,
  team1_id INTEGER,
  team2_id INTEGER,
  team1_set1 INTEGER DEFAULT 0,
  team1_set2 INTEGER DEFAULT 0,
  team1_set3 INTEGER DEFAULT 0,
  team2_set1 INTEGER DEFAULT 0,
  team2_set2 INTEGER DEFAULT 0,
  team2_set3 INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  winner_team INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (team1_id) REFERENCES teams(id),
  FOREIGN KEY (team2_id) REFERENCES teams(id)
);

CREATE TABLE standings (
  event_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  score_for INTEGER DEFAULT 0,
  score_against INTEGER DEFAULT 0,
  goal_difference INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, team_id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  match_id INTEGER,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  updated_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (match_id) REFERENCES matches(id)
);
