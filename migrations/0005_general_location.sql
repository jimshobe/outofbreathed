-- Viewers only ever see a general (~2 km, suburb-level) location; there is no Private flag or
-- private zones any more. Re-round every stored map position to match src/lib/geo.ts
-- (centre of a 0.02 degree grid cell). floor(x) = CAST(x AS INTEGER) - (x < CAST(x AS INTEGER)).
UPDATE moments
SET display_lat = round(((CAST(lat / 0.02 AS INTEGER) - (lat / 0.02 < CAST(lat / 0.02 AS INTEGER))) + 0.5) * 0.02, 4),
    display_lng = round(((CAST(lng / 0.02 AS INTEGER) - (lng / 0.02 < CAST(lng / 0.02 AS INTEGER))) + 0.5) * 0.02, 4)
WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- The visibility column stays (unused, always 'everyone') in case audience levels are wanted later.
UPDATE moments SET visibility = 'everyone';

DROP TABLE private_zones;
