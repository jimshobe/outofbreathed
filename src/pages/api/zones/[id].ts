import type { APIRoute } from 'astro';
import { updateZone, deleteZone } from '../../../lib/zones';
import { UploadError } from '../../../lib/ingest';

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = (await request.json().catch(() => null)) as { label?: unknown; radius_m?: unknown } | null;
  if (!body) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try {
    return (await updateZone(Number(params.id), body)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};

export const DELETE: APIRoute = async ({ params }) =>
  (await deleteZone(Number(params.id))) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
