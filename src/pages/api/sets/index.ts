import type { APIRoute } from 'astro';
import { findOrCreateSet } from '../../../lib/sets';
import { UploadError } from '../../../lib/ingest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Create a set, or get the existing one with the same title: { title, caption? } -> { id, created }.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { title?: unknown; caption?: unknown } | null;
  if (!body) return json({ error: 'expected JSON' }, 400);
  try {
    const r = await findOrCreateSet(body.title, body.caption);
    return json(r, r.created ? 201 : 200);
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, e.status);
    throw e;
  }
};
