-- Owner-chosen link targets for a place name (as viewers see it), replacing the automatic ones:
-- gmaps_url for a venue's ↗, wiki_url for the suburb's / place's ↗. Either may be NULL (= automatic).
CREATE TABLE place_links (
  name        TEXT PRIMARY KEY,
  gmaps_url   TEXT,
  wiki_url    TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
