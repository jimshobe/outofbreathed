// Joining map spots (~100 m cells, see listPlaces) into the places the globe map shows. Pure, shared by
// src/scripts/map.ts and its tests.

export interface Spot { spot_lat: number; spot_lng: number; lat: number; lng: number; n: number; name: string | null; latest: string; zoned: number }
export type Joined<T extends Spot> = T & { spots?: T[] };

/** GPS indoors drifts more than a cell, so one café's photos can land in two or three of them. */
export const SAME_PLACE_M = 300;

const DEG = Math.PI / 180;
/** Metres between two points (equirectangular; fine at these distances). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = (b.lng - a.lng) * DEG * Math.cos(((a.lat + b.lat) / 2) * DEG), y = (b.lat - a.lat) * DEG;
  return Math.hypot(x, y) * 6_371_000;
}

/** Several neighbouring spots as one place: named after the biggest, photos from all of them. */
export function merge<T extends Spot>(ps: Joined<T>[]): Joined<T> {
  const n = ps.reduce((s, p) => s + p.n, 0);
  const top = [...ps].sort((a, b) => b.n - a.n)[0];
  return {
    ...top, n, spots: ps.flatMap((p) => p.spots ?? [p]),
    lat: ps.reduce((s, p) => s + p.lat * p.n, 0) / n,
    lng: ps.reduce((s, p) => s + p.lng * p.n, 0) / n,
    latest: ps.map((p) => p.latest).sort().at(-1)!,
    zoned: Math.max(...ps.map((p) => p.zoned)),
  };
}

/** Spots with the same place name within SAME_PLACE_M of each other (in a chain) become one place. */
export function joinSameName<T extends Spot>(spots: T[]): Joined<T>[] {
  const groups: T[][] = [];
  for (const s of spots) {
    const near = s.name ? groups.filter((g) => g[0].name === s.name && g.some((o) => metres(o, s) <= SAME_PLACE_M)) : [];
    if (!near.length) { groups.push([s]); continue; }
    // A spot can link two groups that were apart until now.
    near[0].push(s, ...near.slice(1).flat());
    for (const g of near.slice(1)) groups.splice(groups.indexOf(g), 1);
  }
  return groups.map((g) => (g.length === 1 ? g[0] : merge(g)));
}
