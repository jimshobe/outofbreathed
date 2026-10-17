import type { APIRoute } from 'astro';
import { aboutPlace } from '../../lib/about';
import { spotLookupPoint } from '../../lib/moments';
import { isVenue, splitVenue, googleSearchUrl } from '../../lib/maps-link';

// Viewer endpoint behind a place's Wikipedia ↗ (?lat=&lng= is the spot key, &name= the full place name):
// redirects to the article the map's about panel shows (sharing its cache), which for a venue is its
// suburb's, or to a Google Maps search when there is none.
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  const name = url.searchParams.get('name');
  const fallback = googleSearchUrl((name && isVenue(name) ? splitVenue(name).area : name) || `${lat},${lng}`);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.redirect(fallback, 302);
  const lookup = (await spotLookupPoint(lat, lng)) ?? { lat, lng };
  const about = (await (await aboutPlace({ lat, lng }, lookup, name)).json().catch(() => null)) as { url?: string } | null;
  return Response.redirect(about?.url ?? fallback, 302);
};
