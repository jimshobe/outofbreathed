// Location privacy and place names.
//
// Viewers only ever see a general location: every moment's map position is snapped to the centre of
// a ~2 km grid cell (suburb level, never a street or a house). The exact position is kept in the
// database so the rounding can be changed later, but it is never sent to viewers.

/** About 2 km. */
const GRID_DEG = 0.02;
const snap = (v: number) => Math.round((Math.floor(v / GRID_DEG) + 0.5) * GRID_DEG * 1e4) / 1e4;

export function generalLocation(lat: number, lng: number) {
  return { display_lat: snap(lat), display_lng: snap(lng) };
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
