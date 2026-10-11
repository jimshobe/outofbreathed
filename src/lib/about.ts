// "About" panel content for a map place: a Wikipedia summary plus a few Wikimedia Commons photos.
// Fetched by the Worker (visitors' browsers never call Wikipedia for text) and kept in Cloudflare's edge
// cache for a week, so it stays current without being stored in D1. Images load from Wikimedia by URL.

export interface AboutPhoto { src: string; thumb: string; page: string; caption: string; credit: string }
export interface About { title: string; description: string | null; extract: string; url: string; photos: AboutPhoto[] }

// Wikimedia and Nominatim both ask API clients to identify themselves.
const HEADERS = { 'User-Agent': 'outofbreathed.com family photo site (https://outofbreathed.com)' };
const WIKI = 'https://en.wikipedia.org';
const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json';
const CACHE_SECONDS = 7 * 24 * 3600;
// Wikimedia serves thumbnails in standard widths; asking for others is slower and can be refused.
const FULL_PX = 1280, THUMB_PX = 330;

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json() as Promise<T>;
};
type GeoSearch = { query?: { geosearch?: { title: string }[] } };
type ImageInfo = { title: string; imageinfo?: { thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] };
type ImageInfoResponse = { query?: { pages?: Record<string, ImageInfo> } };

const stripTags = (h?: string) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** The English Wikipedia article for the place at a point, via OpenStreetMap's own links. */
async function articleTitle(lat: number, lng: number, name: string | null): Promise<string | null> {
  const osm = await getJson<{ extratags?: Record<string, string>; address?: Record<string, string> }>(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&extratags=1&accept-language=en&lat=${lat}&lon=${lng}`,
  ).catch(() => null);
  const wp = osm?.extratags?.wikipedia;
  if (wp?.startsWith('en:')) return wp.slice(3);
  const qid = osm?.extratags?.wikidata;
  if (qid) {
    const wd = await getJson<{ entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids=${qid}`,
    ).catch(() => null);
    const t = wd?.entities?.[qid]?.sitelinks?.enwiki?.title;
    if (t) return t;
  }
  // Fallback: the nearest article, preferring one whose title starts with the place's name.
  const near = await getJson<GeoSearch>(
    `${WIKI}/w/api.php?action=query&list=geosearch&format=json&gsradius=5000&gslimit=10&gscoord=${lat}|${lng}`,
  ).catch(() => null);
  const hits = near?.query?.geosearch ?? [];
  const n = name?.toLowerCase();
  return (n && hits.find((h) => h.title.toLowerCase().startsWith(n))?.title) ?? hits[0]?.title ?? null;
}

const SKIP = /map|locator|logo|flag|coat.of.arms|seal|diagram|chart|icon|\.svg|\.tif|\.pdf/i;
// Nearby uploads include plenty of non-scenery; skip the usual suspects.
const DULL = /library|workshop|meeting|car.?park|parking|church|school|station|office|interior|plaque|sign\b|memorial|grave|council/i;

/** Article images first, then nearby photos naming the place, then other nearby ones; max two per numbered series. */
export function rankPhotos(articleTitles: string[], nearbyTitles: string[], placeName: string | null): string[] {
  const name = (placeName ?? '').toLowerCase().split(',')[0];
  const nearby = nearbyTitles.filter((t) => !DULL.test(t));
  const named = name ? nearby.filter((t) => t.toLowerCase().includes(name)) : [];
  const rest = nearby.filter((t) => !named.includes(t));
  const perSeries: Record<string, number> = {};
  return [...new Set([...articleTitles, ...named, ...rest])]
    .filter((t) => /\.(jpe?g|png|webp)$/i.test(t) && !SKIP.test(t))
    .filter((t) => {
      const k = t.replace(/[\s_]*\d+\.\w+$/, '');
      return (perSeries[k] = (perSeries[k] ?? 0) + 1) <= 2;
    })
    .slice(0, 6);
}

async function build(lat: number, lng: number, name: string | null): Promise<About | null> {
  const title = await articleTitle(lat, lng, name);
  if (!title) return null;
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  const [sum, media, near] = await Promise.all([
    getJson<{ title: string; description?: string; extract?: string; content_urls?: { desktop: { page: string } }; type?: string }>(`${WIKI}/api/rest_v1/page/summary/${t}`),
    getJson<{ items?: { type: string; title: string }[] }>(`${WIKI}/api/rest_v1/page/media-list/${t}`).catch(() => ({ items: [] })),
    getJson<GeoSearch>(`${COMMONS}&action=query&list=geosearch&gsnamespace=6&gslimit=30&gsradius=4000&gscoord=${lat}|${lng}`).catch((): GeoSearch => ({})),
  ]);
  if (!sum.extract || sum.type === 'disambiguation') return null;

  const titles = rankPhotos(
    (media.items ?? []).filter((i) => i.type === 'image').map((i) => i.title),
    (near.query?.geosearch ?? []).map((g) => g.title),
    name,
  );
  let photos: AboutPhoto[] = [];
  if (titles.length) {
    const ii = await getJson<ImageInfoResponse>(
      `${COMMONS}&action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${FULL_PX}&titles=${encodeURIComponent(titles.join('|'))}`,
    ).catch((): ImageInfoResponse => ({}));
    photos = Object.values(ii.query?.pages ?? {})
      .filter((p) => p.imageinfo?.[0]?.thumburl)
      .sort((a, b) => titles.indexOf(a.title) - titles.indexOf(b.title))
      .map((p) => {
        const info = p.imageinfo![0], md = info.extmetadata ?? {};
        const artist = stripTags(md.Artist?.value) || 'unknown';
        const license = stripTags(md.LicenseShortName?.value);
        return {
          src: info.thumburl,
          thumb: info.thumburl.replace(`/${FULL_PX}px-`, `/${THUMB_PX}px-`),
          page: info.descriptionurl,
          caption: stripTags(md.ImageDescription?.value).slice(0, 140) || p.title.replace(/^File:|\.\w+$/g, ''),
          credit: `${artist.slice(0, 40)}${license ? ` · ${license.toLowerCase()}` : ''} · wikimedia commons`,
        };
      });
  }
  return { title: sum.title, description: sum.description ?? null, extract: sum.extract, url: sum.content_urls?.desktop.page ?? `${WIKI}/wiki/${t}`, photos };
}

/**
 * About content for a map cell, from the edge cache when fresh. `lookup` is where to look the place up
 * (the cell's average exact position, server-only); the cache is keyed by the public cell position.
 * (The Cache API only works on a custom domain; on workers.dev every call fetches fresh.)
 */
export async function aboutPlace(cell: { lat: number; lng: number }, lookup: { lat: number; lng: number }, name: string | null): Promise<Response> {
  const key = new Request(`https://cache.outofbreathed.internal/about/v1/${cell.lat},${cell.lng}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;
  let body: About | { error: string };
  try {
    body = (await build(lookup.lat, lookup.lng, name)) ?? { error: 'no wikipedia article found for this place' };
  } catch (e) {
    // Don't cache failures: Wikipedia or OSM may just be slow right now.
    return Response.json({ error: `couldn't reach wikipedia (${e instanceof Error ? e.message : e})` }, { status: 502 });
  }
  const res = Response.json(body, { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } });
  await cache.put(key, res.clone());
  return res;
}
