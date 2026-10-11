-- Every photo or video is a "moment". See PLAN.md > Data model.
CREATE TABLE moments (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  taken_at      TEXT NOT NULL,                 -- local wall-clock time with offset, from the photo's metadata
  lat           REAL,                          -- exact; never sent to viewers for private or zoned moments
  lng           REAL,
  display_lat   REAL,                          -- what the map shows (rounded when needed)
  display_lng   REAL,
  place_name    TEXT,
  category      TEXT NOT NULL CHECK (category IN ('kids', 'rides', 'travel', 'food', 'everyday')),
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
  -- Private moments never leave the site, so they can't be YouTube embeds.
  CHECK (NOT (visibility = 'private' AND source = 'youtube'))
);

-- The timeline and category filters always read newest-first; keep those reads indexed
-- so normal traffic stays far below D1's free daily limits.
CREATE INDEX moments_taken_at ON moments (taken_at DESC);
CREATE INDEX moments_category_taken_at ON moments (category, taken_at DESC);
