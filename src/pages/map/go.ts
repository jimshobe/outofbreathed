import type { APIRoute } from 'astro';
import { aboutPlace } from '../../lib/about';
import { spotLookupPoint } from '../../lib/moments';
import { googleMapsUrl, googleSearchUrl } from '../../lib/maps-link';

// Viewer endpoint behind a place's ↗ (?lat=&lng= is the spot key, &name=): redirects to the place's
// Wikipedia article, found the same way as the map's about panel (and sharing its cache), or to a Google
// Maps search when there is no article.
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  const name = url.searchParams.get('name');
  const venue = googleMapsUrl(name);
  if (venue) return Response.redirect(venue, 302);
  const fallback = googleSearchUrl(name || `${lat},${lng}`);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.redirect(fallback, 302);
  const lookup = (await spotLookupPoint(lat, lng)) ?? { lat, lng };
  const about = (await (await aboutPlace({ lat, lng }, lookup, name)).json().catch(() => null)) as { url?: string } | null;
  return Response.redirect(about?.url ?? fallback, 302);
};
