// Owner-side reads for /manage. Unlike viewer queries these read the moments table directly, so a photo
// inside a privacy zone shows its real place name (viewers see the zone's suburb via moments_public).
import { env } from 'cloudflare:workers';
import { setOrder } from './timeline';

export interface OwnerMoment {
  id: string;
  kind: 'photo' | 'video';
  source: 'site' | 'youtube';
  taken_at: string;
  place_name: string | null;
  caption: string | null;
  media_key: string | null;
  thumb_key: string | null;
  youtube_id: string | null;
  set_id: string | null;
  set_pos: number | null;
  lat: number | null;
  lng: number | null;
  zoned: number;
  categories: string[];
}

const COLS = `id, kind, source, taken_at, place_name, caption, media_key, thumb_key, youtube_id, set_id, set_pos, lat, lng,
  (zone_id IS NOT NULL) AS zoned,
  (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS cats, category`;
type Row = Omit<OwnerMoment, 'categories'> & { cats: string | null; category: string | null };
const shape = (r: Row): OwnerMoment => {
  const { cats, category, ...m } = r;
  return { ...m, categories: [...new Set([category, ...(cats ?? '').split(',')].filter((c): c is string => !!c))] };
};

export type LibraryFilter = 'all' | 'noplace' | 'noset';
export const LIBRARY_PAGE = 120;

/** A page of the photo library, newest first. `ids` limits it to those photos (e.g. just posted). */
export async function libraryPage(o: { filter?: LibraryFilter; tag?: string; before?: string; ids?: string[]; excludeSet?: string; limit?: number }): Promise<OwnerMoment[]> {
  const where: string[] = ['taken_at < ?'];
  const vals: unknown[] = [o.before ?? '9999'];
  if (o.filter === 'noplace') where.push("(place_name IS NULL OR place_name = '')");
  if (o.filter === 'noset') where.push('set_id IS NULL');
  if (o.tag) { where.push('(category = ? OR EXISTS (SELECT 1 FROM moment_categories c WHERE c.moment_id = moments.id AND c.category = ?))'); vals.push(o.tag, o.tag); }
  if (o.ids?.length) { where.push(`id IN (${o.ids.map(() => '?').join(',')})`); vals.push(...o.ids); }
  if (o.excludeSet) { where.push('(set_id IS NULL OR set_id != ?)'); vals.push(o.excludeSet); }
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM moments WHERE ${where.join(' AND ')} ORDER BY taken_at DESC LIMIT ?`)
    .bind(...vals, o.limit ?? LIBRARY_PAGE).all<Row>();
  return results.map(shape);
}

export async function ownerMoment(id: string): Promise<OwnerMoment | null> {
  const r = await env.DB.prepare(`SELECT ${COLS} FROM moments WHERE id = ?`).bind(id).first<Row>();
  return r ? shape(r) : null;
}

export interface ManagedSet {
  id: string; title: string; caption: string | null; cover_id: string | null;
  route_km: number | null; route_secs: number | null; route_climb_m: number | null;
  moments: OwnerMoment[];
}

/** Every set with its photos in display order, newest set first. */
export async function managedSets(): Promise<ManagedSet[]> {
  const [{ results: sets }, { results: rows }] = await Promise.all([
    env.DB.prepare('SELECT id, title, caption, cover_id, route_km, route_secs, route_climb_m FROM sets').all<Omit<ManagedSet, 'moments'>>(),
    env.DB.prepare(`SELECT ${COLS} FROM moments WHERE set_id IS NOT NULL`).all<Row>(),
  ]);
  const by = new Map<string, OwnerMoment[]>();
  for (const r of rows) { const m = shape(r); by.set(m.set_id!, [...(by.get(m.set_id!) ?? []), m]); }
  const first = (s: ManagedSet) => s.moments.map((m) => m.taken_at).sort()[0] ?? '';
  return sets.map((s) => ({ ...s, moments: setOrder(by.get(s.id) ?? []) }))
    .sort((a, b) => first(b).localeCompare(first(a)));
}

export async function managedSet(id: string): Promise<ManagedSet | null> {
  const s = await env.DB.prepare('SELECT id, title, caption, cover_id, route_km, route_secs, route_climb_m FROM sets WHERE id = ?').bind(id).first<Omit<ManagedSet, 'moments'>>();
  if (!s) return null;
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM moments WHERE set_id = ?`).bind(id).all<Row>();
  return { ...s, moments: setOrder(results.map(shape)) };
}
