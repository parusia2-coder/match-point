-- Migration number: 0005 	 2024-02-19T00:00:00.000Z
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  participant_phone TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

CREATE TABLE notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id, participant_name, notification_type),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (match_id) REFERENCES matches(id)
);

CREATE INDEX idx_push_sub_tournament ON push_subscriptions(tournament_id);
CREATE INDEX idx_push_sub_name ON push_subscriptions(tournament_id, participant_name);
CREATE INDEX idx_notif_log_match ON notification_logs(match_id);
