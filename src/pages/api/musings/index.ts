import type { APIRoute } from 'astro';
import { createMusing } from '../../../lib/musings';

// Owner-only (middleware): start a new draft musing: { written_at } (the browser's local time) -> { id }.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { written_at?: unknown };
  return Response.json({ id: await createMusing(body.written_at) }, { status: 201 });
};
