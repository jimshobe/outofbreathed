import type { APIRoute } from 'astro';
import { addZone, listZones } from '../../../lib/zones';
import { UploadError } from '../../../lib/ingest';

// Owner-only (middleware): privacy zones. Never exposed to viewers.
export const GET: APIRoute = async () => Response.json(await listZones());

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { label?: unknown; address?: unknown; radius_m?: unknown } | null;
  if (!body) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try {
    return Response.json(await addZone(body.label, body.address, body.radius_m), { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
