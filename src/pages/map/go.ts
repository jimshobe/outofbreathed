import type { APIRoute } from 'astro';
import { articleUrl } from '../../lib/wikipedia';
import { spotLookupPoint } from '../../lib/moments';
import { isVenue, splitVenue, googleSearchUrl } from '../../lib/maps-link';

// Viewer endpoint behind a place's Wikipedia ↗ (?lat=&lng= is the spot key, &name= the full place name):
// redirects to the place's article (a venue's suburb's), or to a Google Maps search when there is none.
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  const name = url.searchParams.get('name');
  const fallback = googleSearchUrl((name && isVenue(name) ? splitVenue(name).area : name) || `${lat},${lng}`);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.redirect(fallback, 302);
  const lookup = (await spotLookupPoint(lat, lng)) ?? { lat, lng };
  return Response.redirect((await articleUrl({ lat, lng }, lookup, name)) ?? fallback, 302);
};
