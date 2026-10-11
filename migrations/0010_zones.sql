-- Privacy zones: addresses (home, school, ...) whose photos are shown only as the surrounding suburb.
-- Zones are owner-only; viewers only ever see a zone's suburb name and the suburb's centre.
CREATE TABLE zones (
  id          INTEGER PRIMARY KEY,
  label       TEXT NOT NULL,        -- "home"
  address     TEXT NOT NULL,        -- as typed
  lat         REAL NOT NULL,        -- the address's position
  lng         REAL NOT NULL,
  radius_m    REAL NOT NULL,
  area_name   TEXT,                 -- suburb shown instead ("Palm Beach")
  area_lat    REAL NOT NULL,        -- suburb centre, where zoned photos appear on the map
  area_lng    REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Which zone a moment falls in (if any). Its display position is then the zone's area centre.
ALTER TABLE moments ADD COLUMN zone_id INTEGER;

-- Everything viewers see goes through this view: zoned moments show the zone's suburb name instead of
-- their own place name (which may be a street or venue). Exact lat/lng are deliberately not included.
CREATE VIEW moments_public AS
SELECT m.id, m.kind, m.taken_at, m.display_lat, m.display_lng,
       CASE WHEN m.zone_id IS NOT NULL THEN z.area_name ELSE m.place_name END AS place_name,
       m.category, m.caption, m.visibility, m.source, m.media_key, m.youtube_id, m.thumb_key,
       m.width, m.height, m.duration, m.set_id, m.created_at, m.source_ref,
       (m.zone_id IS NOT NULL) AS zoned
FROM moments m LEFT JOIN zones z ON z.id = m.zone_id;
