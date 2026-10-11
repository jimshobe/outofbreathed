-- Categories renamed: everyday -> misc, kids -> family, rides -> moto (travel and food unchanged).
-- SQLite can't change a CHECK constraint in place, so rebuild the table.

CREATE TABLE moments_new (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  taken_at      TEXT NOT NULL,                 -- local wall-clock time with offset, from the photo's metadata
  lat           REAL,                          -- exact; never sent to viewers for private or zoned moments
  lng           REAL,
  display_lat   REAL,                          -- what the map shows (rounded when needed)
  display_lng   REAL,
  place_name    TEXT,
  category      TEXT NOT NULL CHECK (category IN ('misc', 'family', 'travel', 'moto', 'food')),
  food_type     TEXT CHECK (food_type IN ('home', 'out')),
  caption       TEXT,
  visibility    TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'private', 'family', 'just_us')),
  source        TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'youtube')),
  media_key     TEXT,                          -- R2 key for site media
  youtube_id    TEXT,
  thumb_key     TEXT,                          -- R2 key for the small preview
  width         INTEGER,
  height        INTEGER,
  duration      REAL,
  trip_id       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source_ref    TEXT,
  CHECK (NOT (visibility = 'private' AND source = 'youtube'))
);

INSERT INTO moments_new
SELECT id, kind, taken_at, lat, lng, display_lat, display_lng, place_name,
       CASE category WHEN 'everyday' THEN 'misc' WHEN 'kids' THEN 'family' WHEN 'rides' THEN 'moto' ELSE category END,
       food_type, caption, visibility, source, media_key, youtube_id, thumb_key, width, height, duration, trip_id,
       created_at, source_ref
FROM moments;

DROP TABLE moments;
ALTER TABLE moments_new RENAME TO moments;

CREATE INDEX moments_taken_at ON moments (taken_at DESC);
CREATE INDEX moments_category_taken_at ON moments (category, taken_at DESC);
CREATE UNIQUE INDEX moments_source_ref ON moments (source_ref) WHERE source_ref IS NOT NULL;
