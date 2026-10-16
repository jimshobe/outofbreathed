-- Categories are optional tags for filtering: "misc" is gone, and a moment may have none.
-- moments.category (the primary tag) becomes nullable; misc moments keep any other tag they had.
-- SQLite can't change column constraints in place, so rebuild both tables (and the view on moments).

DROP VIEW moments_public;

CREATE TABLE moments_new (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  taken_at      TEXT NOT NULL,
  lat           REAL,
  lng           REAL,
  display_lat   REAL,
  display_lng   REAL,
  place_name    TEXT,
  category      TEXT CHECK (category IS NULL OR category IN ('family', 'travel', 'moto', 'food')),
  caption       TEXT,
  visibility    TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'private', 'family', 'just_us')),
  source        TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'youtube')),
  media_key     TEXT,
  youtube_id    TEXT,
  thumb_key     TEXT,
  width         INTEGER,
  height        INTEGER,
  duration      REAL,
  set_id        TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source_ref    TEXT,
  zone_id       INTEGER
);

INSERT INTO moments_new
SELECT id, kind, taken_at, lat, lng, display_lat, display_lng, place_name,
       CASE WHEN category = 'misc'
            THEN (SELECT c.category FROM moment_categories c WHERE c.moment_id = moments.id AND c.category != 'misc' LIMIT 1)
            ELSE category END,
       caption, visibility, source, media_key, youtube_id, thumb_key, width, height, duration, set_id,
       created_at, source_ref, zone_id
FROM moments;

DROP TABLE moments;
ALTER TABLE moments_new RENAME TO moments;

CREATE INDEX moments_taken_at ON moments (taken_at DESC);
CREATE INDEX moments_category_taken_at ON moments (category, taken_at DESC);
CREATE UNIQUE INDEX moments_source_ref ON moments (source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX moments_set ON moments (set_id, taken_at) WHERE set_id IS NOT NULL;
CREATE INDEX moments_display ON moments (display_lat, display_lng) WHERE display_lat IS NOT NULL;

CREATE TABLE moment_categories_new (
  moment_id  TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('family', 'travel', 'moto', 'food')),
  PRIMARY KEY (moment_id, category)
) WITHOUT ROWID;
INSERT INTO moment_categories_new SELECT moment_id, category FROM moment_categories WHERE category != 'misc';
DROP TABLE moment_categories;
ALTER TABLE moment_categories_new RENAME TO moment_categories;
CREATE INDEX moment_categories_category ON moment_categories (category, moment_id);

-- Unchanged from 0010_zones.sql: everything viewers see goes through this view.
CREATE VIEW moments_public AS
SELECT m.id, m.kind, m.taken_at, m.display_lat, m.display_lng,
       CASE WHEN m.zone_id IS NOT NULL THEN z.area_name ELSE m.place_name END AS place_name,
       m.category, m.caption, m.visibility, m.source, m.media_key, m.youtube_id, m.thumb_key,
       m.width, m.height, m.duration, m.set_id, m.created_at, m.source_ref,
       (m.zone_id IS NOT NULL) AS zoned
FROM moments m LEFT JOIN zones z ON z.id = m.zone_id;
