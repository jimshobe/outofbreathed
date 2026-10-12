import type { APIRoute } from 'astro';
import { listComments, addComment } from '../lib/comments';
import { UploadError } from '../lib/ingest';

const fail = (e: unknown) => {
  if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
  throw e;
};

// Anyone can read a thread (?on=m:<moment> or s:<set>); signed-in people can add to it.
export const GET: APIRoute = async ({ url, locals }) => {
  try { return Response.json(await listComments(url.searchParams.get('on') ?? '', locals.viewer)); } catch (e) { return fail(e); }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as { on?: unknown; body?: unknown } | null;
  if (!body) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try { return Response.json(await addComment(body.on, body.body, locals.viewer), { status: 201 }); } catch (e) { return fail(e); }
};
