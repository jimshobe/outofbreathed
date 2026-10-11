-- Uploads: make retries idempotent, and record places whose moments are always shown coarsely.

-- What the uploader says this item is (e.g. the Photos asset id + capture time from the Shortcut).
-- A retried upload with the same ref returns the existing moment instead of duplicating it.
ALTER TABLE moments ADD COLUMN source_ref TEXT;
CREATE UNIQUE INDEX moments_source_ref ON moments (source_ref) WHERE source_ref IS NOT NULL;

-- Home, school, regular spots: anything taken inside one is shown at ~suburb level on the map,
-- even if it isn't marked Private. Managed from the owner page (later phase).
CREATE TABLE private_zones (
  id        INTEGER PRIMARY KEY,
  label     TEXT NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  radius_m  REAL NOT NULL DEFAULT 1000
);
