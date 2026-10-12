-- People who sign in with Google. Only the first name and avatar are ever shown publicly.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,                -- Google's stable account id ("sub")
  email       TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  avatar_url  TEXT,
  trusted     INTEGER NOT NULL DEFAULT 0,      -- set when the owner approves their first comment
  blocked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen   TEXT
);

-- A comment is on one moment or one set. New users' comments wait for approval.
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  moment_id   TEXT,
  set_id      TEXT,
  user_id     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((moment_id IS NULL) <> (set_id IS NULL))
);
CREATE INDEX comments_moment ON comments (moment_id, created_at) WHERE moment_id IS NOT NULL;
CREATE INDEX comments_set ON comments (set_id, created_at) WHERE set_id IS NOT NULL;
CREATE INDEX comments_pending ON comments (created_at) WHERE status = 'pending';
