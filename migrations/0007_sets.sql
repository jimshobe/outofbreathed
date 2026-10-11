-- Sets group moments into one event ("Perth", "Mum's 70th"). A moment belongs to at most one set.
-- A set's dates and places are derived from its moments, so only its own words are stored here.
CREATE TABLE sets (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  caption     TEXT,
  cover_id    TEXT,                 -- moment shown largest; defaults to the set's first moment
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The plan's trip_id was reserved for this; sets are the general form of a trip.
ALTER TABLE moments RENAME COLUMN trip_id TO set_id;
CREATE INDEX moments_set ON moments (set_id, taken_at) WHERE set_id IS NOT NULL;
