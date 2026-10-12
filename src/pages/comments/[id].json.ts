import type { APIRoute } from 'astro';
import { deleteComment } from '../../lib/comments';
import { UploadError } from '../../lib/ingest';

// The comment's author or the owner can delete it.
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    return (await deleteComment(params.id!, locals.viewer)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
