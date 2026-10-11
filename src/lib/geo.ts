// Map positions and place names.
//
// The map shows where each photo was actually taken. display_lat/lng are kept separate from the
// stored lat/lng so a position can be shown differently later (e.g. a home zone) without losing the
// original. Location metadata is still stripped from the image files themselves (see exif.ts).

// Nominatim's usage policy asks for an identifying User-Agent.
const NOMINATIM_HEADERS = { 'User-Agent': 'outofbreathed.com family photo site' };

/** Map position for a stored position: the same place, to ~1 m. */
export function mapPosition(lat: number, lng: number) {
  return { display_lat: Math.round(lat * 1e5) / 1e5, display_lng: Math.round(lng * 1e5) / 1e5 };
}

// The nearest OSM object's name is a venue ("Burleigh Beach Pavillion") unless it's a road or an area.
const NOT_VENUES = new Set(['highway', 'place', 'boundary', 'landuse', 'railway', 'route']);
// When the nearest object is unnamed (a bin, a toilet), the address often names what it's inside.
const VENUE_ADDRESS_KEYS = ['amenity', 'tourism', 'leisure', 'shop', 'historic', 'natural', 'building'];

/**
 * "Venue, Suburb" (or just the suburb/town) for a position, from OpenStreetMap's Nominatim. Looked up
 * once per upload, well inside Nominatim's 1 request/second policy. Returns null if the lookup fails.
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const r = (await res.json()) as { name?: string; category?: string; address?: Record<string, string> };
    const a = r.address ?? {};
    const area = a.suburb ?? a.town ?? a.village ?? a.city_district ?? a.city ?? a.hamlet ?? a.county ?? null;
    const named = (v?: string) => (v && !/^[\d\s/-]+$/.test(v) ? v : null); // skip house numbers
    const venue = (r.category && !NOT_VENUES.has(r.category) ? named(r.name) : null)
      ?? VENUE_ADDRESS_KEYS.map((k) => named(a[k])).find(Boolean) ?? null;
    if (venue && area && venue !== area) return `${venue}, ${area}`;
    return venue ?? area;
  } catch {
    return null;
  }
}

/** Position for a typed place name ("Springbrook, QLD"), for posts without GPS such as YouTube videos. */
export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
