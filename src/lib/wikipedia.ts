// The Wikipedia article behind a place's ↗ (via /map/go). Found from OpenStreetMap's own links at the
// spot (for a venue: its suburb's), else the nearest article. Fetched by the Worker and kept in
// Cloudflare's edge cache for a week (the Cache API only works on a custom domain).
import { isVenue, splitVenue } from './maps-link';

// Wikimedia and Nominatim both ask API clients to identify themselves.
const HEADERS = { 'User-Agent': 'outofbreathed.com family photo site (https://outofbreathed.com)' };
const WIKI = 'https://en.wikipedia.org';
const CACHE_SECONDS = 7 * 24 * 3600;

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json() as Promise<T>;
};
type GeoSearch = { query?: { geosearch?: { title: string }[] } };

/** Wikipedia title from an OSM object's tags (its `wikipedia`, else its Wikidata item's English article). */
async function titleFromTags(tags: Record<string, string> | undefined): Promise<string | null> {
  const wp = tags?.wikipedia;
  if (wp?.startsWith('en:')) return wp.slice(3);
  const qid = tags?.wikidata;
  if (!qid) return null;
  const wd = await getJson<{ entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids=${qid}`,
  ).catch(() => null);
  return wd?.entities?.[qid]?.sitelinks?.enwiki?.title ?? null;
}

/** The article for a named suburb near a point: OSM's own object for that name, searched within ~15 km. */
async function areaTitle(lat: number, lng: number, area: string): Promise<string | null> {
  const d = 0.15;
  const hits = await getJson<{ extratags?: Record<string, string> }[]>(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&limit=5&accept-language=en&bounded=1`
      + `&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&q=${encodeURIComponent(area)}`,
  ).catch(() => []);
  for (const h of hits) {
    const t = await titleFromTags(h.extratags);
    if (t) return t;
  }
  return null;
}

/** The English Wikipedia article for the place at a point, via OpenStreetMap's own links. */
async function articleTitle(lat: number, lng: number, name: string | null): Promise<string | null> {
  const osm = await getJson<{ extratags?: Record<string, string>; address?: Record<string, string> }>(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&extratags=1&accept-language=en&lat=${lat}&lon=${lng}`,
  ).catch(() => null);
  const tagged = await titleFromTags(osm?.extratags);
  if (tagged) return tagged;
  // Fallback: the nearest article, preferring one whose title starts with the place's name.
  const near = await getJson<GeoSearch>(
    `${WIKI}/w/api.php?action=query&list=geosearch&format=json&gsradius=5000&gslimit=10&gscoord=${lat}|${lng}`,
  ).catch(() => null);
  const hits = near?.query?.geosearch ?? [];
  const n = name?.toLowerCase();
  return (n && hits.find((h) => h.title.toLowerCase().startsWith(n))?.title) ?? hits[0]?.title ?? null;
}

/**
 * The article URL for a map spot, or null. `lookup` is where to look the place up (the spot's average
 * position); the cache is keyed by the spot and, for venues, the suburb.
 */
export async function articleUrl(spot: { lat: number; lng: number }, lookup: { lat: number; lng: number }, name: string | null): Promise<string | null> {
  const area = isVenue(name) ? splitVenue(name!).area : null;
  const key = new Request(`https://cache.outofbreathed.internal/article/v1/${spot.lat},${spot.lng}/${encodeURIComponent(area ?? '')}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return ((await hit.json()) as { url: string | null }).url;
  let title: string | null;
  try {
    title = area
      ? (await areaTitle(lookup.lat, lookup.lng, area)) ?? (await articleTitle(lookup.lat, lookup.lng, area))
      : await articleTitle(lookup.lat, lookup.lng, name);
  } catch {
    return null; // don't cache failures: Wikipedia or OSM may just be slow right now
  }
  const url = title ? `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null;
  await cache.put(key, Response.json({ url }, { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }));
  return url;
}
