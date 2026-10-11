import type { APIRoute } from 'astro';
import { updateSet, ungroupSet, type SetEdit } from '../../../lib/sets';
import { UploadError } from '../../../lib/ingest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ params, request }) => {
  const edit = (await request.json().catch(() => null)) as SetEdit | null;
  if (!edit) return json({ error: 'expected JSON' }, 400);
  try {
    return (await updateSet(params.id!, edit)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, e.status);
    throw e;
  }
};

// Ungroups: the set goes away, its photos stay.
export const DELETE: APIRoute = async ({ params }) =>
  (await ungroupSet(params.id!)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
