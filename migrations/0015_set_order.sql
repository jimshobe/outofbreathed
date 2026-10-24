-- Photos in a set can be put in any order: set_pos is a moment's position within its set (0 = first).
-- NULL (the default, and after moving into another set) sorts after positioned photos, by time.
ALTER TABLE moments ADD COLUMN set_pos INTEGER;

-- Same view as 0013_optional_categories.sql, plus set_pos.
DROP VIEW moments_public;
CREATE VIEW moments_public AS
SELECT m.id, m.kind, m.taken_at, m.display_lat, m.display_lng,
       CASE WHEN m.zone_id IS NOT NULL THEN z.area_name ELSE m.place_name END AS place_name,
       m.category, m.caption, m.visibility, m.source, m.media_key, m.youtube_id, m.thumb_key,
       m.width, m.height, m.duration, m.set_id, m.created_at, m.source_ref,
       (m.zone_id IS NOT NULL) AS zoned, m.set_pos
FROM moments m LEFT JOIN zones z ON z.id = m.zone_id;
