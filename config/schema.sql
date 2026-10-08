CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL,
  seeded INTEGER NOT NULL DEFAULT 0,
  fit_score INTEGER,
  fit_evidence TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS repos_seed ON repos(seeded, name);
