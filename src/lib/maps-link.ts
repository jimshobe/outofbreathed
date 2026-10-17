// Where a place's ↗ leads. Venues ("STABLE, Tugun") go straight to a Google Maps search; any other
// named place goes through /map/go, which redirects to its Wikipedia article (or Google Maps when there
// isn't one). Shared by server pages and the map script.

const GMAPS = 'https://www.google.com/maps/search/?api=1&query=';

/** A name in "Venue, Suburb" form, outside a privacy zone (where the name is only the suburb). */
export const isVenue = (name: string | null | undefined, zoned: number | boolean = 0) => !!name && !zoned && name.includes(', ');

export function googleMapsUrl(name: string | null | undefined, zoned: number | boolean = 0): string | null {
  return isVenue(name, zoned) ? GMAPS + encodeURIComponent(name!) : null;
}

/** Google Maps search for any text (the fallback when Wikipedia has nothing). */
export const googleSearchUrl = (q: string) => GMAPS + encodeURIComponent(q);

/** The ↗ for a place at a map spot: Google Maps for venues, else Wikipedia via /map/go. */
export function placeInfoUrl(name: string | null | undefined, zoned: number | boolean, spotLat: number | null, spotLng: number | null): string | null {
  if (!name) return null;
  const venue = googleMapsUrl(name, zoned);
  if (venue) return venue;
  if (spotLat == null || spotLng == null) return googleSearchUrl(name);
  return `/map/go?lat=${spotLat}&lng=${spotLng}&name=${encodeURIComponent(name)}`;
}
