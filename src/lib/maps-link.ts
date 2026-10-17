// Where a place's ↗ leads. A venue name ("STABLE, Tugun") is two links: the venue → a Google Maps
// search, and its suburb → Wikipedia. Any other named place → Wikipedia. Wikipedia links go through
// /map/go, which finds the article (as the map's about panel does) and falls back to Google Maps.
// Shared by server pages and the map script.

const GMAPS = 'https://www.google.com/maps/search/?api=1&query=';

/** A name in "Venue, Suburb" form, outside a privacy zone (where the name is only the suburb). */
export const isVenue = (name: string | null | undefined, zoned: number | boolean = 0) => !!name && !zoned && name.includes(', ');

/** "STABLE, Tugun" → { venue: 'STABLE', area: 'Tugun' }. */
export function splitVenue(name: string) {
  const i = name.lastIndexOf(', ');
  return { venue: name.slice(0, i), area: name.slice(i + 2) };
}

export function googleMapsUrl(name: string | null | undefined, zoned: number | boolean = 0): string | null {
  return isVenue(name, zoned) ? GMAPS + encodeURIComponent(name!) : null;
}

/** Google Maps search for any text (the fallback when Wikipedia has nothing). */
export const googleSearchUrl = (q: string) => GMAPS + encodeURIComponent(q);

export interface PlacePart { text: string; href: string; label: string }

/**
 * The linked parts of a place name: [venue → Google Maps, suburb → Wikipedia] for venues, otherwise
 * [place → Wikipedia]. Wikipedia links pass the full name; /map/go looks up a venue's suburb itself.
 */
export function placeParts(name: string | null | undefined, zoned: number | boolean, spotLat: number | null, spotLng: number | null): PlacePart[] {
  if (!name) return [];
  const wiki = (text: string) => ({
    text,
    href: spotLat != null && spotLng != null ? `/map/go?lat=${spotLat}&lng=${spotLng}&name=${encodeURIComponent(name)}` : googleSearchUrl(text),
    label: `Read about ${text}`,
  });
  if (!isVenue(name, zoned)) return [wiki(name)];
  const { venue, area } = splitVenue(name);
  return [{ text: venue, href: googleMapsUrl(name, zoned)!, label: `${venue} on Google Maps` }, wiki(area)];
}
