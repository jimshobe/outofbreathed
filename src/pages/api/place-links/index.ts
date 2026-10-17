import type { APIRoute } from 'astro';
import { setPlaceLink } from '../../../lib/place-links';
import { UploadError } from '../../../lib/ingest';

// Owner-only (middleware): { name, gmaps_url, wiki_url } sets a place's link overrides; both empty clears them.
export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => null)) as { name?: unknown; gmaps_url?: unknown; wiki_url?: unknown } | null;
  if (!b) return Response.json({ error: 'expected JSON' }, { status: 400 });
  try {
    return Response.json(await setPlaceLink(b.name, b.gmaps_url, b.wiki_url));
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};
