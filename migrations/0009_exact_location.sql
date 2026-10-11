-- The map now shows where photos were actually taken (see src/lib/geo.ts mapPosition):
-- replace the old ~2 km rounding with the stored position, to 5 decimals (~1 m).
UPDATE moments SET display_lat = round(lat, 5), display_lng = round(lng, 5) WHERE lat IS NOT NULL AND lng IS NOT NULL;
