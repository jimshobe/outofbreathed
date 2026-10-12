import type { APIRoute } from 'astro';
import { moderate } from '../../../lib/comments';
import { UploadError } from '../../../lib/ingest';

// Owner-only (middleware): approve or reject a pending comment.
export const PATCH: APIRoute = async ({ params, request }) => {
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (!body) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try {
    return (await moderate(params.id!, body.status)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
