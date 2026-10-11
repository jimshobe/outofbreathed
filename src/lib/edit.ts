import { env } from 'cloudflare:workers';
import { CATEGORIES, ISO_LOCAL, UploadError, type Category } from './ingest';
import { displayLocation, type Zone } from './geo';

export interface MomentEdit {
  caption?: string | null;
  category?: string;
  food_type?: string | null;
  visibility?: string;
  place_name?: string | null;
  taken_at?: string;
}

interface Row { lat: number | null; lng: number | null; category: string; source: string; visibility: string }

export async function updateMoment(id: string, e: MomentEdit): Promise<boolean> {
  const row = await env.DB.prepare('SELECT lat, lng, category, source, visibility FROM moments WHERE id = ?').bind(id).first<Row>();
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
  const category = e.category ?? row.category;
  if (e.category !== undefined) {
    if (!CATEGORIES.includes(category as Category)) throw new UploadError(`category must be one of ${CATEGORIES.join(', ')}`);
    set('category', category);
  }
  if (e.food_type !== undefined || e.category !== undefined) {
    const ft = e.food_type ?? null;
    set('food_type', category === 'food' && (ft === 'home' || ft === 'out') ? ft : null);
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
  if (!sets.length) return true;
  await env.DB.prepare(`UPDATE moments SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return true;
}

export async function deleteMoment(id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT media_key, thumb_key FROM moments WHERE id = ?').bind(id).first<{ media_key: string | null; thumb_key: string | null }>();
  if (!row) return false;
  await env.DB.prepare('DELETE FROM moments WHERE id = ?').bind(id).run();
  const keys = [row.media_key, row.thumb_key].filter((k): k is string => !!k);
  if (keys.length) await env.MEDIA.delete(keys);
  return true;
}
