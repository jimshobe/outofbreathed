// Map positions and place names.
//
// The map shows where each photo was actually taken, except inside privacy zones (zone-math.ts), where
// it shows the surrounding suburb. Location metadata is always stripped from image files (exif.ts).

// Nominatim's usage policy asks for an identifying User-Agent.
const NOMINATIM_HEADERS = { 'User-Agent': 'outofbreathed.com family photo site' };

// The nearest OSM object's name is a venue ("Burleigh Beach Pavillion") unless it's a road or an area.
const NOT_VENUES = new Set(['highway', 'place', 'boundary', 'landuse', 'railway', 'route']);
// When the nearest object is unnamed (a bin, a toilet), the address often names what it's inside.
const VENUE_ADDRESS_KEYS = ['amenity', 'tourism', 'leisure', 'shop', 'historic', 'natural', 'building'];

interface Reverse { venue: string | null; kind: string | null; area: string | null }

/** Nominatim's nearest named venue (with its OSM type) and the suburb/town, or null if the lookup fails. */
async function reverse(lat: number, lng: number): Promise<Reverse | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const r = (await res.json()) as { name?: string; category?: string; type?: string; address?: Record<string, string> };
    const a = r.address ?? {};
    const area = a.suburb ?? a.town ?? a.village ?? a.city_district ?? a.city ?? a.hamlet ?? a.county ?? null;
    const own = r.category && !NOT_VENUES.has(r.category) ? named(r.name) : null;
    const venue = own ?? VENUE_ADDRESS_KEYS.map((k) => named(a[k])).find(Boolean) ?? null;
    return { venue, kind: own ? r.type ?? null : null, area };
  } catch {
    return null;
  }
}

const named = (v?: string) => (v && !/^[\d\s/-]+$/.test(v) ? v : null); // skip house numbers
export const joinPlace = (venue: string | null, area: string | null) => (venue && area && venue !== area ? `${venue}, ${area}` : venue ?? area);

/**
 * "Venue, Suburb" (or just the suburb/town) for a position, from OpenStreetMap's Nominatim. Used when
 * an upload doesn't say where it was (the post form usually does; see nearbyPlaces). Null on failure.
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const r = await reverse(lat, lng);
  return r ? joinPlace(r.venue, r.area) : null;
}

// Venue kinds worth offering, from OSM tags. Food and drink are preferred over plain buildings, since
// GPS indoors drifts and a café's photos often land on the building next door.
const FOOD = /^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten)$/;
const NEAR_M = 80, FOOD_PREFERRED_M = 60;
const BUILDINGISH = /^(community_centre|library|townhall|office|school|college|university|place_of_worship|social_facility|parking|building|yes|commercial|retail|public)$/;
// Two sources, used together. Public Overpass servers list every kind of named place but are often slow
// or down, so they're raced with a cap. Nominatim's search ("restaurant" within a small box) is quick
// and reliable for food, its policy allows 1 request a second, so its categories are asked in turn.
const OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const FOOD_SEARCHES = ['restaurant', 'cafe', 'bar', 'fast food'];
type Venue = { name: string; kind: string; lat: number; lng: number };
type OsmElement = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };

async function overpassVenues(query: string): Promise<Venue[]> {
  const one = async (url: string) => {
    const res = await fetch(url, { method: 'POST', headers: NOMINATIM_HEADERS, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(6_000) });
    if (!res.ok) throw new Error(String(res.status));
    return (((await res.json()) as { elements?: OsmElement[] }).elements ?? []).map((e) => {
      const c = e.center ?? { lat: e.lat!, lon: e.lon! };
      const t = e.tags;
      return { name: t.name, kind: t.amenity ?? t.shop ?? t.tourism ?? t.leisure ?? t.historic ?? t.natural ?? '', lat: c.lat, lng: c.lon };
    });
  };
  return Promise.any(OVERPASS.map(one)).catch(() => []);
}

async function nominatimFood(lat: number, lng: number): Promise<Venue[]> {
  const d = NEAR_M / 111_000; // a box about NEAR_M each way
  const box = `${lng - d * 1.15},${lat + d},${lng + d * 1.15},${lat - d}`;
  const out: Venue[] = [];
  for (const [i, q] of FOOD_SEARCHES.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 1_050));
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=20&bounded=1&accept-language=en&viewbox=${box}&q=${encodeURIComponent(q)}`,
        { headers: NOMINATIM_HEADERS, signal: AbortSignal.timeout(4_000) });
      if (!res.ok) continue;
      for (const h of (await res.json()) as { name?: string; type?: string; lat: string; lon: string }[]) {
        if (h.name) out.push({ name: h.name, kind: h.type ?? '', lat: Number(h.lat), lng: Number(h.lon) });
      }
    } catch { /* skip this category */ }
  }
  return out;
}

export interface NearbyPlaces {
  /** The name to start with: Nominatim's pick, or the nearest food place when that pick is just a building. */
  suggested: string | null;
  /** Names to choose from ("Venue, Suburb"), suggested first, ending with the suburb on its own. */
  choices: string[];
  area: string | null;
}

/** Candidate place names for a photo's position, for the post form's place picker. */
export async function nearbyPlaces(lat: number, lng: number): Promise<NearbyPlaces> {
  const near = `(around:${NEAR_M},${lat},${lng})[name]`;
  const q = `[out:json][timeout:8];(${['amenity', 'shop', 'tourism', 'leisure', 'historic', 'natural'].map((k) => `nwr${near}[${k}];`).join('')});out center tags 40;`;
  const [rev, venues] = await Promise.all([
    reverse(lat, lng),
    Promise.all([overpassVenues(q), nominatimFood(lat, lng)]).then(([a, b]) => {
      const seen = new Set<string>();
      return [...a, ...b]
        .map((v) => ({ ...v, m: distanceM(lat, lng, v.lat, v.lng) }))
        .filter((v) => named(v.name) && v.kind !== 'parking' && v.m <= NEAR_M * 1.2 && !seen.has(v.name) && seen.add(v.name))
        .sort((x, y) => x.m - y.m);
    }),
  ]);
  const area = rev?.area ?? null;
  let first = rev?.venue ?? null;
  const food = venues.find((v) => FOOD.test(v.kind) && v.m <= FOOD_PREFERRED_M);
  if (food && (!first || (rev?.kind && BUILDINGISH.test(rev.kind)))) first = food.name;
  const suggested = joinPlace(first, area);
  const names = [suggested, joinPlace(rev?.venue ?? null, area), ...venues.map((v) => joinPlace(v.name, area)), area].filter((n): n is string => !!n);
  return { suggested, choices: [...new Set(names)].slice(0, 10), area };
}

/** Metres between two points (equirectangular; fine at these distances). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const k = Math.PI / 180;
  return Math.hypot((lat2 - lat1) * k, (lng2 - lng1) * k * Math.cos(((lat1 + lat2) / 2) * k)) * 6_371_000;
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
