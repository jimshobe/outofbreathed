import { env } from 'cloudflare:workers';
import { ISO_LOCAL, UploadError } from './ingest';
import { parseCategories, type Category } from './categories';
import { displayLocation, type Zone } from './geo';

export interface MomentEdit {
  caption?: string | null;
  categories?: string[];
  food_type?: string | null;
  visibility?: string;
  place_name?: string | null;
  taken_at?: string;
}

interface Row { lat: number | null; lng: number | null; source: string; visibility: string; categories: string | null }

export async function updateMoment(id: string, e: MomentEdit): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT lat, lng, source, visibility, (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS categories
       FROM moments WHERE id = ?`,
  ).bind(id).first<Row>();
  if (!row) return false;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };

  if (e.caption !== undefined) set('caption', e.caption?.trim() || null);
  if (e.place_name !== undefined) set('place_name', e.place_name?.trim() || null);
  if (e.taken_at !== undefined) {
    if (!ISO_LOCAL.test(e.taken_at)) throw new UploadError('taken_at must be ISO 8601, e.g. 2026-10-10T09:12:00+10:00');
    set('taken_at', e.taken_at);
  }
  let newCategories: Category[] | undefined;
  if (e.categories !== undefined) {
    try {
      newCategories = parseCategories(e.categories);
    } catch (err) {
      throw new UploadError((err as Error).message);
    }
    if (!newCategories.length) throw new UploadError('pick at least one category');
    set('category', newCategories[0]);
  }
  const categories = newCategories ?? parseCategories([row.categories]);
  if (e.food_type !== undefined || e.categories !== undefined) {
    const ft = e.food_type ?? null;
    set('food_type', categories.includes('food') && (ft === 'home' || ft === 'out') ? ft : null);
  }
  if (e.visibility !== undefined) {
    if (!['everyone', 'private'].includes(e.visibility)) throw new UploadError('visibility must be everyone or private');
    if (e.visibility === 'private' && row.source === 'youtube') throw new UploadError("a YouTube video can't be private; private moments stay on the site");
    set('visibility', e.visibility);
    // Recompute what the map shows from the exact position we kept.
    if (row.lat != null && row.lng != null) {
      const { results: zones } = await env.DB.prepare('SELECT lat, lng, radius_m FROM private_zones').all<Zone>();
      const d = displayLocation(row.lat, row.lng, e.visibility === 'private', zones);
      set('display_lat', d.display_lat);
      set('display_lng', d.display_lng);
    }
  }
  const statements = sets.length ? [env.DB.prepare(`UPDATE moments SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id)] : [];
  if (newCategories) {
    statements.push(env.DB.prepare('DELETE FROM moment_categories WHERE moment_id = ?').bind(id));
    for (const c of newCategories) statements.push(env.DB.prepare('INSERT INTO moment_categories (moment_id, category) VALUES (?, ?)').bind(id, c));
  }
  if (statements.length) await env.DB.batch(statements);
  return true;
}

export async function deleteMoment(id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT media_key, thumb_key FROM moments WHERE id = ?').bind(id).first<{ media_key: string | null; thumb_key: string | null }>();
  if (!row) return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM moment_categories WHERE moment_id = ?').bind(id),
    env.DB.prepare('DELETE FROM moments WHERE id = ?').bind(id),
  ]);
  const keys = [row.media_key, row.thumb_key].filter((k): k is string => !!k);
  if (keys.length) await env.MEDIA.delete(keys);
  return true;
}
