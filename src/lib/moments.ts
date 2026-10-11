import { env } from 'cloudflare:workers';

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
}

export async function listMoments(limit = 200): Promise<MomentView[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, kind, taken_at, place_name, category, caption, media_key, thumb_key, youtube_id, source, width, height,
            (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS categories
       FROM moments ORDER BY taken_at DESC LIMIT ?`,
  ).bind(limit).all<Omit<MomentView, 'categories'> & { categories: string | null }>();
  return results.map((m) => ({
    ...m,
    categories: [m.category, ...(m.categories ?? '').split(',').filter((c) => c && c !== m.category)],
  }));
}

// taken_at is the camera's local wall-clock time with its offset (e.g. 2026-10-10T09:12:00+10:00).
// Show the date as the photographer saw it, so read the date part directly instead of converting zones.
const localDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export function groupByMonth(list: MomentView[]) {
  const groups: { label: string; items: MomentView[] }[] = [];
  for (const m of list) {
    const label = localDate(m.taken_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toLowerCase();
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}

export const fmtDay = (iso: string) =>
  localDate(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
