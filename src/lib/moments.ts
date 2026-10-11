import { env } from 'cloudflare:workers';
import type { SetInfo } from './timeline';

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
}

const MOMENT_COLUMNS = `id, kind, taken_at, place_name, category, caption, media_key, thumb_key, youtube_id, source, width, height, set_id,
  (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS categories`;

/** Newest first; or every moment of one set, oldest first. */
export async function listMoments(opts: { limit?: number; setId?: string } = {}): Promise<MomentView[]> {
  const stmt = opts.setId
    ? env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM moments WHERE set_id = ? ORDER BY taken_at`).bind(opts.setId)
    : env.DB.prepare(`SELECT ${MOMENT_COLUMNS} FROM moments ORDER BY taken_at DESC LIMIT ?`).bind(opts.limit ?? 200);
  const { results } = await stmt.all<Omit<MomentView, 'categories'> & { categories: string | null }>();
  return results.map((m) => ({
    ...m,
    categories: [m.category, ...(m.categories ?? '').split(',').filter((c) => c && c !== m.category)],
  }));
}

export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export { fmtDay } from './timeline';

export async function listSets(): Promise<SetInfo[]> {
  const { results } = await env.DB.prepare('SELECT id, title, caption, cover_id FROM sets ORDER BY title').all<SetInfo>();
  return results;
}

/** Number of moments in each set, by set id. */
export async function setCounts(): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare('SELECT set_id, count(*) AS n FROM moments WHERE set_id IS NOT NULL GROUP BY set_id').all<{ set_id: string; n: number }>();
  return new Map(results.map((r) => [r.set_id, r.n]));
}

export async function getSet(id: string): Promise<SetInfo | null> {
  return env.DB.prepare('SELECT id, title, caption, cover_id FROM sets WHERE id = ?').bind(id).first<SetInfo>();
}
