import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';

const newSetId = () => 's' + Date.now().toString(36) + crypto.getRandomValues(new Uint8Array(4)).reduce((s, x) => s + x.toString(36).padStart(2, '0'), '');

const cleanTitle = (t: unknown) => {
  const title = typeof t === 'string' ? t.trim() : '';
  if (!title) throw new UploadError('a set needs a title');
  if (title.length > 80) throw new UploadError('set title is too long (80 characters max)');
  return title;
};

export async function setExists(id: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM sets WHERE id = ?').bind(id).first());
}

/** Returns the existing set with this title (case-insensitive), or creates it. */
export async function findOrCreateSet(title: unknown, caption?: unknown): Promise<{ id: string; created: boolean }> {
  const t = cleanTitle(title);
  const existing = await env.DB.prepare('SELECT id FROM sets WHERE lower(title) = lower(?)').bind(t).first<{ id: string }>();
  if (existing) return { id: existing.id, created: false };
  const id = newSetId();
  const c = typeof caption === 'string' && caption.trim() ? caption.trim() : null;
  await env.DB.prepare('INSERT INTO sets (id, title, caption) VALUES (?, ?, ?)').bind(id, t, c).run();
  return { id, created: true };
}

export interface SetEdit { title?: string; caption?: string | null; cover_id?: string | null }

export async function updateSet(id: string, e: SetEdit): Promise<boolean> {
  if (!(await setExists(id))) return false;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (e.title !== undefined) { sets.push('title = ?'); vals.push(cleanTitle(e.title)); }
  if (e.caption !== undefined) { sets.push('caption = ?'); vals.push(e.caption?.trim() || null); }
  if (e.cover_id !== undefined) {
    if (e.cover_id && !(await env.DB.prepare('SELECT 1 FROM moments WHERE id = ? AND set_id = ?').bind(e.cover_id, id).first())) {
      throw new UploadError('the cover must be a photo in this set');
    }
    sets.push('cover_id = ?'); vals.push(e.cover_id || null);
  }
  if (sets.length) await env.DB.prepare(`UPDATE sets SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return true;
}

/** Removes the set (and its ride route file); its moments stay on the timeline as singles. */
export async function ungroupSet(id: string): Promise<boolean> {
  const set = await env.DB.prepare('SELECT route_gpx_key FROM sets WHERE id = ?').bind(id).first<{ route_gpx_key: string | null }>();
  if (!set) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE moments SET set_id = NULL WHERE set_id = ?').bind(id),
    env.DB.prepare('DELETE FROM comments WHERE set_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sets WHERE id = ?').bind(id),
  ]);
  if (set.route_gpx_key) await env.MEDIA.delete(set.route_gpx_key);
  return true;
}
