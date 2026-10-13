import { env } from 'cloudflare:workers';
import { assemblePage, monthStart, fmtDay, type SetInfo, type Entry } from './timeline';

/** The fields a viewer may see. Exact lat/lng are deliberately never selected. */
export interface MomentView {
  id: string;
  kind: 'photo' | 'video';
  taken_at: string;
  place_name: string | null;
  category: string;
  /** All categories, primary first. */
  categories: string[];
  caption: string | null;
  media_key: string | null;
  thumb_key: string | null;
  youtube_id: string | null;
  source: 'site' | 'youtube';
  width: number | null;
  height: number | null;
  set_id: string | null;
  /** Where the photo was taken, as shown on the map. */
  display_lat: number | null;
  display_lng: number | null;
  /** The ~100 m map spot it belongs to (see Place). */
  spot_lat: number | null;
  spot_lng: number | null;
  /** Inside a privacy zone: place and position are the zone's suburb. */
  zoned: number;
}

// Viewer-facing queries read moments_public (see migrations/0010_zones.sql): zoned moments show their
// zone's suburb name, and exact lat/lng aren't available at all.
const PUBLIC = 'moments_public AS moments';

const MOMENT_COLUMNS = `id, kind, taken_at, place_name, category, caption, media_key, thumb_key, youtube_id, source, width, height, set_id,
  display_lat, display_lng, round(display_lat, 3) AS spot_lat, round(display_lng, 3) AS spot_lng, zoned,
  (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS categories`;

/** Newest first; or every moment of one set, oldest first. */
export async function listMoments(opts: { limit?: number; setId?: string } = {}): Promise<MomentView[]> {
  const stmt = opts.setId
    ? env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM ${PUBLIC} WHERE set_id = ? ORDER BY taken_at`).bind(opts.setId)
    : env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM ${PUBLIC} ORDER BY taken_at DESC LIMIT ?`).bind(opts.limit ?? 200);
  return withCategories((await stmt.all<Row>()).results);
}

export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export { fmtDay } from './timeline';

/** What the lightbox needs for one photo (YouTube videos play inline instead). */
export const lbItem = (m: MomentView) => ({
  id: m.id,
  src: mediaUrl(m.media_key!),
  caption: m.caption,
  meta: [`${fmtDay(m.taken_at)} ${m.taken_at.slice(0, 4)}`, m.place_name?.toLowerCase()].filter(Boolean).join(' · '),
});

export async function listSets(): Promise<SetInfo[]> {
  const { results } = await env.DB.prepare('SELECT id, title, caption, cover_id, route_km, route_secs, route_climb_m FROM sets ORDER BY title').all<SetInfo>();
  return results;
}

/** Number of moments in each set, by set id. */
export async function setCounts(): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare('SELECT set_id, count(*) AS n FROM moments WHERE set_id IS NOT NULL GROUP BY set_id').all<{ set_id: string; n: number }>();
  return new Map(results.map((r) => [r.set_id, r.n]));
}

/** A set's public route (zone-trimmed JSON), if it has one. */
export async function getSetRoute(id: string): Promise<[number, number][][] | null> {
  const r = await env.DB.prepare('SELECT route FROM sets WHERE id = ?').bind(id).first<{ route: string | null }>();
  return r?.route ? JSON.parse(r.route) : null;
}

export async function getSet(id: string): Promise<SetInfo | null> {
  return env.DB.prepare('SELECT id, title, caption, cover_id, route_km, route_secs, route_climb_m FROM sets WHERE id = ?').bind(id).first<SetInfo>();
}

// ---- Timeline pages ----

const PAGE_SIZE = 120;

/** Moments matching a category: tagged with it, or in a set where any moment is (so sets stay whole). */
const CATEGORY_FILTER = `(id IN (SELECT moment_id FROM moment_categories WHERE category = ?)
  OR set_id IN (SELECT m2.set_id FROM moments m2 JOIN moment_categories c ON c.moment_id = m2.id WHERE c.category = ? AND m2.set_id IS NOT NULL))`;

type Row = Omit<MomentView, 'categories'> & { categories: string | null };
const withCategories = (results: Row[]): MomentView[] =>
  results.map((m) => ({ ...m, categories: [m.category, ...(m.categories ?? '').split(',').filter((c) => c && c !== m.category)] }));

export interface TimelinePage {
  entries: Entry<MomentView>[];
  /** Cursor for the next (older) page, or null at the end. */
  older: string | null;
}

/** Up to ~PAGE_SIZE moments older than `before`, extended to whole months, with sets kept whole. */
export async function timelinePage(opts: { before?: string; category?: string }): Promise<TimelinePage> {
  const before = opts.before ?? '9999';
  const where = (extra: string) => `WHERE taken_at < ? ${extra} ${opts.category ? `AND ${CATEGORY_FILTER}` : ''}`;
  const args = (...a: unknown[]) => [...a, ...(opts.category ? [opts.category, opts.category] : [])];

  // The PAGE_SIZE-th moment decides which month the page ends in; then take that whole month.
  const nth = await env.DB.prepare(`SELECT taken_at FROM moments ${where('')} ORDER BY taken_at DESC LIMIT 1 OFFSET ?`)
    .bind(before, ...args(), PAGE_SIZE - 1).first<{ taken_at: string }>();
  const oldestAll = nth ? null : await env.DB.prepare(`SELECT min(taken_at) AS t FROM moments ${where('')}`).bind(before, ...args()).first<{ t: string | null }>();
  const boundaryFrom = nth?.taken_at ?? oldestAll?.t;
  if (!boundaryFrom) return { entries: [], older: null };
  const boundary = monthStart(boundaryFrom);

  const { results: page } = await env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM ${PUBLIC} ${where('AND taken_at >= ?')} ORDER BY taken_at DESC`)
    .bind(before, boundary, ...args()).all<Row>();
  const setIds = [...new Set(page.map((m) => m.set_id).filter((x): x is string => !!x))];
  const [members, sets, more] = await Promise.all([
    setIds.length
      ? env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM ${PUBLIC} WHERE set_id IN (${setIds.map(() => '?').join(',')})`).bind(...setIds).all<Row>().then((r) => r.results)
      : Promise.resolve([] as Row[]),
    setIds.length
      ? env.DB.prepare(`SELECT id, title, caption, cover_id, route_km, route_secs, route_climb_m FROM sets WHERE id IN (${setIds.map(() => '?').join(',')})`).bind(...setIds).all<SetInfo>().then((r) => r.results)
      : Promise.resolve([] as SetInfo[]),
    env.DB.prepare(`SELECT 1 FROM moments ${where('')} LIMIT 1`).bind(boundary, ...args()).first(),
  ]);
  return { entries: assemblePage(withCategories(page), withCategories(members), sets, boundary), older: more ? boundary : null };
}

/** Years that have moments (for the jump row), newest first. */
export async function yearIndex(category?: string): Promise<string[]> {
  const filter = category ? `WHERE ${CATEGORY_FILTER}` : '';
  const { results } = await env.DB.prepare(`SELECT DISTINCT substr(taken_at, 1, 4) AS y FROM moments ${filter} ORDER BY y DESC`)
    .bind(...(category ? [category, category] : [])).all<{ y: string }>();
  return results.map((r) => r.y);
}

// ---- Map ----

/**
 * A place on the map: a ~100 m spot (positions rounded to 3 decimals) where photos were taken, so
 * photos from the same beach or restaurant share a pin. Pinned at their average position and named
 * after their most common place name.
 */
export interface Place { spot_lat: number; spot_lng: number; lat: number; lng: number; n: number; name: string | null; latest: string; zoned: number }

// The spot key is computed by SQLite's round() everywhere (here and in MOMENT_COLUMNS), so it always
// matches; compare with a hair of tolerance rather than exact floats.
const SPOT = 'abs(round(display_lat, 3) - ?) < 1e-9 AND abs(round(display_lng, 3) - ?) < 1e-9';

export async function listPlaces(): Promise<Place[]> {
  const { results } = await env.DB.prepare(
    `SELECT round(display_lat, 3) AS spot_lat, round(display_lng, 3) AS spot_lng,
            round(avg(display_lat), 5) AS lat, round(avg(display_lng), 5) AS lng, count(*) AS n, max(taken_at) AS latest, max(zoned) AS zoned,
            (SELECT place_name FROM moments_public p
              WHERE round(p.display_lat, 3) = round(m.display_lat, 3) AND round(p.display_lng, 3) = round(m.display_lng, 3) AND p.place_name IS NOT NULL
              GROUP BY place_name ORDER BY count(*) DESC LIMIT 1) AS name
       FROM moments_public m WHERE display_lat IS NOT NULL GROUP BY spot_lat, spot_lng`,
  ).all<Place>();
  return results;
}

/** Moments at one spot, newest first, with the titles of any sets they're in. */
export async function placeMoments(spotLat: number, spotLng: number) {
  const { results } = await env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM ${PUBLIC} WHERE ${SPOT} ORDER BY taken_at DESC LIMIT 300`)
    .bind(spotLat, spotLng).all<Row>();
  const moments = withCategories(results);
  const setIds = [...new Set(moments.map((m) => m.set_id).filter((x): x is string => !!x))];
  const sets = setIds.length
    ? (await env.DB.prepare(`SELECT id, title FROM sets WHERE id IN (${setIds.map(() => '?').join(',')})`).bind(...setIds).all<{ id: string; title: string }>()).results
    : [];
  return { moments, sets };
}

/** Where to look a spot up on OpenStreetMap/Wikipedia: its shown position (a zone's suburb centre, never the address). */
export async function spotLookupPoint(spotLat: number, spotLng: number): Promise<{ lat: number; lng: number } | null> {
  const r = await env.DB.prepare(`SELECT avg(display_lat) AS lat, avg(display_lng) AS lng FROM moments WHERE ${SPOT}`)
    .bind(spotLat, spotLng).first<{ lat: number | null; lng: number | null }>();
  return r?.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
}
