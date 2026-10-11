import { env } from 'cloudflare:workers';
import { ISO_LOCAL, UploadError } from './ingest';
import { parseCategories, type Category } from './categories';
import { generalLocation, geocodePlace } from './geo';

export interface MomentEdit {
  caption?: string | null;
  categories?: string[];
  place_name?: string | null;
  taken_at?: string;
}

export async function updateMoment(id: string, e: MomentEdit): Promise<boolean> {
  const row = await env.DB.prepare('SELECT lat FROM moments WHERE id = ?').bind(id).first<{ lat: number | null }>();
  if (!row) return false;

  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };

  if (e.caption !== undefined) set('caption', e.caption?.trim() || null);
  if (e.place_name !== undefined) {
    const place = e.place_name?.trim() || null;
    set('place_name', place);
    // A post without GPS (YouTube, stripped photo) gets its map position from the typed place.
    // Posts with GPS keep their real position; the typed name only relabels them.
    if (row.lat == null && place) {
      const hit = await geocodePlace(place);
      if (hit) {
        const g = generalLocation(hit.lat, hit.lng);
        set('lat', hit.lat); set('lng', hit.lng); set('display_lat', g.display_lat); set('display_lng', g.display_lng);
      }
    }
  }
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
