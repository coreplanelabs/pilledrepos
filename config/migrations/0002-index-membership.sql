ALTER TABLE repos ADD COLUMN indexed INTEGER NOT NULL DEFAULT 0 CHECK(indexed IN (0,1));
CREATE INDEX IF NOT EXISTS repos_indexed ON repos(indexed,name);
