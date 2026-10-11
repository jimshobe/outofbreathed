// Pure timeline logic (no Worker imports, so it's unit-testable): turns moments and sets into the
// entries the timeline shows. A set appears once, at its first moment's date, instead of its moments.

export interface TimelineMoment {
  id: string;
  taken_at: string;
  place_name: string | null;
  set_id: string | null;
}

export interface SetInfo {
  id: string;
  title: string;
  caption: string | null;
  cover_id: string | null;
}

export type Entry<M extends TimelineMoment> =
  | { type: 'moment'; date: string; moment: M }
  | { type: 'set'; date: string; set: SetInfo; moments: M[]; cover: M; start: string; end: string; places: string[] };

// taken_at is the camera's local wall-clock time with its offset (e.g. 2026-10-10T09:12:00+10:00).
// Show the date as the photographer saw it: read the date part directly instead of converting zones.
const localDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => localDate(iso).toLocaleDateString('en-AU', { ...o, timeZone: 'UTC' }).toLowerCase();

export const fmtDay = (iso: string) => fmt(iso, { day: 'numeric', month: 'short' });
export const fmtMonth = (iso: string) => fmt(iso, { month: 'long', year: 'numeric' });

/** "30 sep – 2 oct", "14 sep", or with years when they differ: "30 dec 2025 – 2 jan 2026". */
export function fmtRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return fmtDay(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${fmt(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** Newest-first entries. `moments` may be in any order; sets without loaded moments are skipped. */
export function buildEntries<M extends TimelineMoment>(moments: M[], sets: SetInfo[]): Entry<M>[] {
  const byDate = (a: { taken_at: string }, b: { taken_at: string }) => a.taken_at.localeCompare(b.taken_at);
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
    const list = members.get(set.id)?.sort(byDate);
    if (!list?.length) continue;
    const places = [...new Set(list.map((m) => m.place_name).filter((p): p is string => !!p))];
    entries.push({
      type: 'set', date: list[0].taken_at, set, moments: list,
      cover: list.find((m) => m.id === set.cover_id) ?? list[0],
      start: list[0].taken_at, end: list[list.length - 1].taken_at, places,
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function groupEntriesByMonth<M extends TimelineMoment>(entries: Entry<M>[]) {
  const months: { label: string; entries: Entry<M>[] }[] = [];
  for (const e of entries) {
    const label = fmtMonth(e.date);
    const last = months[months.length - 1];
    if (last?.label === label) last.entries.push(e);
    else months.push({ label, entries: [e] });
  }
  return months;
}
