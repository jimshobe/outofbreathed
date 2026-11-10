-- Musings: occasional written pieces on the timeline, in Markdown. Photos are placed in the text by
-- reference (![caption](photo:<moment id>)), so they stay in the library, on the timeline and the map.
CREATE TABLE musings (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  written_at  TEXT NOT NULL,                   -- local time with offset, like moments.taken_at
  set_id      TEXT,                            -- optional: the set it's about
  published   INTEGER NOT NULL DEFAULT 0,      -- drafts are seen only by the owner
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX musings_published ON musings (written_at) WHERE published = 1;
CREATE INDEX musings_set ON musings (set_id) WHERE set_id IS NOT NULL;

-- Comments can also be on a musing. SQLite can't change a CHECK, so the table is rebuilt.
CREATE TABLE comments_new (
  id          TEXT PRIMARY KEY,
  moment_id   TEXT,
  set_id      TEXT,
  musing_id   TEXT,
  user_id     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((moment_id IS NOT NULL) + (set_id IS NOT NULL) + (musing_id IS NOT NULL) = 1)
);
INSERT INTO comments_new (id, moment_id, set_id, user_id, body, status, created_at)
  SELECT id, moment_id, set_id, user_id, body, status, created_at FROM comments;
DROP TABLE comments;
ALTER TABLE comments_new RENAME TO comments;
CREATE INDEX comments_moment ON comments (moment_id, created_at) WHERE moment_id IS NOT NULL;
CREATE INDEX comments_set ON comments (set_id, created_at) WHERE set_id IS NOT NULL;
CREATE INDEX comments_musing ON comments (musing_id, created_at) WHERE musing_id IS NOT NULL;
CREATE INDEX comments_pending ON comments (created_at) WHERE status = 'pending';
