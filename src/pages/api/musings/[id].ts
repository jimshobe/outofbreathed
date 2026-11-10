import type { APIRoute } from 'astro';
import { updateMusing, deleteMusing, type MusingEdit } from '../../../lib/musings';
import { UploadError } from '../../../lib/ingest';

// Owner-only (middleware): edit a musing (any of title, body, written_at, set_id, published), or delete it.
export const PATCH: APIRoute = async ({ params, request }) => {
  const edit = (await request.json().catch(() => null)) as MusingEdit | null;
  if (!edit) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try {
    return (await updateMusing(params.id!, edit)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};

export const DELETE: APIRoute = async ({ params }) =>
  (await deleteMusing(params.id!)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
