// Pure zone logic (no Worker imports, so it's unit-testable).

export interface ZoneArea { id: number; lat: number; lng: number; radius_m: number; area_lat: number; area_lng: number }

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** The zone a position falls in (the nearest one if zones overlap), or null. */
export function zoneFor<Z extends ZoneArea>(lat: number, lng: number, zones: Z[]): Z | null {
  let best: Z | null = null, bestD = Infinity;
  for (const z of zones) {
    const d = distanceM(lat, lng, z.lat, z.lng);
    if (d <= z.radius_m && d < bestD) { best = z; bestD = d; }
  }
  return best;
}

/** What the map shows for a stored position: the zone's area centre inside a zone, else the position (to ~1 m). */
export function displayFor(lat: number, lng: number, zones: ZoneArea[]) {
  const z = zoneFor(lat, lng, zones);
  if (z) return { display_lat: z.area_lat, display_lng: z.area_lng, zone_id: z.id };
  return { display_lat: Math.round(lat * 1e5) / 1e5, display_lng: Math.round(lng * 1e5) / 1e5, zone_id: null };
}
