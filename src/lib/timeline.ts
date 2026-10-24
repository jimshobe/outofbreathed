// Pure timeline logic (no Worker imports, so it's unit-testable): turns moments and sets into the
// entries the timeline shows. A set appears once, at its first moment's date, instead of its moments.

export interface TimelineMoment {
  id: string;
  taken_at: string;
  place_name: string | null;
  set_id: string | null;
  /** Position within its set (owner-chosen order); null sorts after positioned ones, by time. */
  set_pos?: number | null;
}

/** A set's moments in display order: owner-chosen position first, then time. */
export function setOrder<M extends TimelineMoment>(list: M[]): M[] {
  const pos = (m: M) => m.set_pos ?? Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => pos(a) - pos(b) || a.taken_at.localeCompare(b.taken_at));
}

export interface SetInfo {
  id: string;
  title: string;
  caption: string | null;
  cover_id: string | null;
  /** Ride stats when the set has a route. */
  route_km?: number | null;
  route_secs?: number | null;
  route_climb_m?: number | null;
}

export type Entry<M extends TimelineMoment> =
  | { type: 'moment'; date: string; moment: M }
  | { type: 'set'; date: string; set: SetInfo; moments: M[]; cover: M; start: string; end: string; places: string[] };

// taken_at is the camera's local wall-clock time with its offset (e.g. 2026-10-10T09:12:00+10:00).
// Show the date as the photographer saw it: read the date part directly instead of converting zones.
/** dd-mm-yy, e.g. "17-10-26". */
export const fmtDay = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}`;

/** "30-09-26 – 02-10-26", or one date when the range is a single day. */
export function fmtRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return fmtDay(start);
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** Newest-first entries. `moments` may be in any order; sets without loaded moments are skipped. */
export function buildEntries<M extends TimelineMoment>(moments: M[], sets: SetInfo[]): Entry<M>[] {
  const members = new Map<string, M[]>();
  const entries: Entry<M>[] = [];
  for (const m of moments) {
    if (m.set_id && sets.some((s) => s.id === m.set_id)) {
      const list = members.get(m.set_id) ?? [];
      list.push(m);
      members.set(m.set_id, list);
    } else {
      entries.push({ type: 'moment', date: m.taken_at, moment: m });
    }
  }
  for (const set of sets) {
    const found = members.get(set.id);
    if (!found?.length) continue;
    const list = setOrder(found);
    const times = list.map((m) => m.taken_at).sort();
    const places = [...new Set(list.map((m) => m.place_name).filter((p): p is string => !!p))];
    entries.push({
      type: 'set', date: times[0], set, moments: list,
      cover: list.find((m) => m.id === set.cover_id) ?? list[0],
      start: times[0], end: times[times.length - 1], places,
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** Start of the month containing a local timestamp, in the same sortable form as taken_at. */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01T00:00:00`;

/**
 * One page of the timeline. `page` holds every (filtered) moment from `boundary` (a month start) up to
 * the cursor, so pages always break between months. `members` holds every moment of any set touched by
 * the page, wherever they fall. A set is shown whole on the page that holds its first moment; on newer
 * pages its moments are left out, because the set appears further down, on an older page.
 */
export function assemblePage<M extends TimelineMoment>(page: M[], members: M[], sets: SetInfo[], boundary: string): Entry<M>[] {
  const firstOf = new Map<string, string>();
  for (const m of [...page, ...members]) {
    if (!m.set_id) continue;
    const f = firstOf.get(m.set_id);
    if (!f || m.taken_at < f) firstOf.set(m.set_id, m.taken_at);
  }
  const shown = sets.filter((s) => (firstOf.get(s.id) ?? '') >= boundary);
  const shownIds = new Set(shown.map((s) => s.id));
  const seen = new Set<string>();
  const moments: M[] = [];
  for (const m of [...page, ...members]) {
    if (seen.has(m.id)) continue;
    const inSet = !!m.set_id && sets.some((s) => s.id === m.set_id);
    if (inSet && !shownIds.has(m.set_id!)) continue; // deferred to the page with the set's first moment
    if (!inSet && !page.includes(m)) continue; // members only matter for sets shown here
    seen.add(m.id);
    moments.push(m);
  }
  return buildEntries(moments, shown);
}
