-- The map groups moments by their (rounded, ~2 km) display position.
CREATE INDEX moments_display ON moments (display_lat, display_lng) WHERE display_lat IS NOT NULL;
