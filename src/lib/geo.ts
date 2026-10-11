// Location privacy and place names.

export interface Zone { lat: number; lng: number; radius_m: number }

const R_EARTH_M = 6371000;
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(h));
}

/** About 2 km: coarse enough to say "this suburb", never "this street". */
const GRID_DEG = 0.02;
const snap = (v: number) => Math.round((Math.floor(v / GRID_DEG) + 0.5) * GRID_DEG * 1e4) / 1e4;

/**
 * What the map may show. Private moments, and anything inside a private zone, are snapped to the
 * centre of a ~2 km grid cell. Everything else keeps its exact position.
 */
export function displayLocation(lat: number, lng: number, isPrivate: boolean, zones: Zone[]) {
  const zoned = zones.some((z) => distanceM(lat, lng, z.lat, z.lng) <= z.radius_m);
  if (!isPrivate && !zoned) return { display_lat: lat, display_lng: lng, rounded: false };
  return { display_lat: snap(lat), display_lng: snap(lng), rounded: true };
}

/**
 * Suburb or town name for a position, from OpenStreetMap's Nominatim. Looked up once per upload
 * (well inside Nominatim's 1 request/second policy). Returns null if the lookup fails.
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'outofbreathed.com family photo site' } });
    if (!res.ok) return null;
    const { address = {} } = (await res.json()) as { address?: Record<string, string> };
    return address.suburb ?? address.town ?? address.village ?? address.city_district ?? address.city ?? address.hamlet ?? address.county ?? null;
  } catch {
    return null;
  }
}
