import type { APIRoute } from 'astro';
import { aboutPlace } from '../../lib/about';
import { spotLookupPoint } from '../../lib/moments';

// Viewer endpoint: Wikipedia "about" for one map spot (?lat=&lng= is the spot key, &name=).
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: 'lat and lng required' }, { status: 400 });
  const lookup = (await spotLookupPoint(lat, lng)) ?? { lat, lng };
  return aboutPlace({ lat, lng }, lookup, url.searchParams.get('name'));
};
