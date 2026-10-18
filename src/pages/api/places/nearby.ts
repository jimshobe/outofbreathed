import type { APIRoute } from 'astro';
import { nearbyPlaces } from '../../../lib/geo';

// Owner-only (middleware): place names to choose from for a photo's position (?lat=&lng=), for the post form.
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: 'lat and lng required' }, { status: 400 });
  return Response.json(await nearbyPlaces(lat, lng));
};
