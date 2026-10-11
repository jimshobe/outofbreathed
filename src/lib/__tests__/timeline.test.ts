import { describe, it, expect } from 'vitest';
import { buildEntries, groupEntriesByMonth, fmtRange } from '../timeline';

const m = (id: string, taken_at: string, set_id: string | null = null, place_name: string | null = 'Perth') => ({ id, taken_at, set_id, place_name });
const perth = { id: 's1', title: 'Perth', caption: 'Long weekend', cover_id: null };

describe('buildEntries', () => {
  it('collapses a set into one entry at its first date, among singles in newest-first order', () => {
    const entries = buildEntries([
      m('a', '2026-10-05T10:00:00+10:00'),
      m('p3', '2026-10-02T09:00:00+08:00', 's1', 'West Perth'),
      m('p1', '2026-09-30T16:52:33+08:00', 's1'),
      m('b', '2026-10-01T08:00:00+10:00'),
      m('p2', '2026-10-01T14:22:47+08:00', 's1'),
      m('c', '2026-09-20T08:00:00+10:00'),
    ], [perth]);
    expect(entries.map((e) => (e.type === 'set' ? `set:${e.set.title}` : e.moment.id))).toEqual(['a', 'b', 'set:Perth', 'c']);
    const set = entries[2];
    if (set.type !== 'set') throw new Error('expected a set');
    expect(set.moments.map((x) => x.id)).toEqual(['p1', 'p2', 'p3']);
    expect(set.cover.id).toBe('p1');
    expect(set.places).toEqual(['Perth', 'West Perth']);
    expect(fmtRange(set.start, set.end)).toBe('30 sept – 2 oct');
  });

  it('uses the chosen cover, and treats moments of unknown or empty sets as singles', () => {
    const entries = buildEntries([m('p1', '2026-09-30T10:00:00', 's1'), m('p2', '2026-10-01T10:00:00', 's1'), m('x', '2026-08-01T10:00:00', 'gone')],
      [{ ...perth, cover_id: 'p2' }, { id: 'empty', title: 'Empty', caption: null, cover_id: null }]);
    expect(entries).toHaveLength(2);
    const set = entries.find((e) => e.type === 'set');
    expect(set?.type === 'set' && set.cover.id).toBe('p2');
    expect(entries.some((e) => e.type === 'moment' && e.moment.id === 'x')).toBe(true);
  });

  it('places a set spanning two months under its first month', () => {
    const months = groupEntriesByMonth(buildEntries([m('p1', '2026-09-30T10:00:00', 's1'), m('p2', '2026-10-02T10:00:00', 's1')], [perth]));
    expect(months.map((g) => g.label)).toEqual(['september 2026']);
  });
});

describe('fmtRange', () => {
  it('shows one day, a range, or a range across years', () => {
    expect(fmtRange('2026-09-14T08:00:00', '2026-09-14T20:00:00')).toBe('14 sept');
    expect(fmtRange('2025-12-30T08:00:00', '2026-01-02T08:00:00')).toBe('30 dec 2025 – 2 jan 2026');
  });
});
