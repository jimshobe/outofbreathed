// Google Maps link for a named venue ("STABLE, Tugun"), so a restaurant or shop can be looked up.
// Plain suburb names get no link, and neither does anything inside a privacy zone (whose name is only
// the zone's suburb anyway). Shared by server pages and the map script.

export function googleMapsUrl(name: string | null | undefined, zoned: number | boolean = 0): string | null {
  if (!name || zoned || !name.includes(', ')) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}
