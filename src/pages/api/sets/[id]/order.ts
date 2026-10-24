import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Owner-only (middleware): { ids } is the set's photos in their new order. Ids not in this set are ignored;
// photos left out keep no position and follow the ordered ones by time.
export const PUT: APIRoute = async ({ params, request }) => {
  const b = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b.ids.filter((x): x is string => typeof x === 'string') : null;
  if (!ids) return Response.json({ error: 'expected { ids: [...] }' }, { status: 400 });
  if (!(await env.DB.prepare('SELECT 1 FROM sets WHERE id = ?').bind(params.id).first())) return Response.json({ error: 'not found' }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare('UPDATE moments SET set_pos = NULL WHERE set_id = ?').bind(params.id),
    ...ids.map((id, i) => env.DB.prepare('UPDATE moments SET set_pos = ? WHERE id = ? AND set_id = ?').bind(i, id, params.id)),
  ]);
  return Response.json({ ok: true });
};
