-- A set (usually a moto ride) can carry the route ridden, from a GPX file.
-- route: the public line as JSON ([[lng, lat], ...] segments), simplified and with every point inside a
--        privacy zone removed. Recomputed from the private original whenever zones change.
-- route_gpx_key: the original GPX in R2 under private/, which the media route never serves.
-- Stats are for the whole ride, measured before trimming.
ALTER TABLE sets ADD COLUMN route TEXT;
ALTER TABLE sets ADD COLUMN route_gpx_key TEXT;
ALTER TABLE sets ADD COLUMN route_km REAL;
ALTER TABLE sets ADD COLUMN route_secs INTEGER;
ALTER TABLE sets ADD COLUMN route_climb_m REAL;
