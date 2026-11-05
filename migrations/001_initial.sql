CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE resumes (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','done','failed')),
  result TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX resumes_status ON resumes(status,created_at);
CREATE TABLE imports (source TEXT PRIMARY KEY, imported_at TEXT NOT NULL);
