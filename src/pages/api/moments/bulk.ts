import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { updateMoment, deleteMoment } from '../../../lib/edit';
import { UploadError } from '../../../lib/ingest';
import { CATEGORIES, type Category } from '../../../lib/categories';

// Owner-only (middleware): one change applied to several moments, using the same rules as single edits.
//   { ids, action: 'set', set_id: string | null }   put into a set, or take out of their set
//   { ids, action: 'tag-add' | 'tag-remove', category }
//   { ids, action: 'place', place_name }            rename (photos with GPS keep their position)
//   { ids, action: 'delete' }
const MAX = 200;

export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => null)) as { ids?: unknown; action?: unknown; set_id?: unknown; category?: unknown; place_name?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b.ids.filter((x): x is string => typeof x === 'string') : [];
  if (!b || !ids.length) return Response.json({ error: 'choose some photos first' }, { status: 400 });
  if (ids.length > MAX) return Response.json({ error: `at most ${MAX} at a time` }, { status: 400 });

  try {
    let changed = 0;
    if (b.action === 'set') {
      const setId = typeof b.set_id === 'string' && b.set_id ? b.set_id : null;
      for (const id of ids) if (await updateMoment(id, { set_id: setId })) changed++;
    } else if (b.action === 'tag-add' || b.action === 'tag-remove') {
      if (!CATEGORIES.includes(b.category as Category)) return Response.json({ error: 'unknown tag' }, { status: 400 });
      const { results } = await env.DB.prepare(
        `SELECT id, (SELECT group_concat(category) FROM moment_categories WHERE moment_id = moments.id) AS cats
           FROM moments WHERE id IN (${ids.map(() => '?').join(',')})`,
      ).bind(...ids).all<{ id: string; cats: string | null }>();
      for (const m of results) {
        const cats = (m.cats ?? '').split(',').filter(Boolean);
        const next = b.action === 'tag-add' ? [...new Set([...cats, b.category as string])] : cats.filter((c) => c !== b.category);
        if (next.length !== cats.length && (await updateMoment(m.id, { categories: next }))) changed++;
      }
    } else if (b.action === 'place') {
      if (typeof b.place_name !== 'string' || !b.place_name.trim()) return Response.json({ error: 'type a place' }, { status: 400 });
      for (const id of ids) if (await updateMoment(id, { place_name: b.place_name })) changed++;
    } else if (b.action === 'delete') {
      for (const id of ids) if (await deleteMoment(id)) changed++;
    } else {
      return Response.json({ error: 'unknown action' }, { status: 400 });
    }
    return Response.json({ ok: true, changed });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
