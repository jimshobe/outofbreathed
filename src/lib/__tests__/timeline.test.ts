import { describe, it, expect } from 'vitest';
import { buildEntries, fmtRange, fmtDay, assemblePage } from '../timeline';

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
    expect(fmtRange(set.start, set.end)).toBe('30-09-26 – 02-10-26');
  });

  it('uses the chosen cover, and treats moments of unknown or empty sets as singles', () => {
    const entries = buildEntries([m('p1', '2026-09-30T10:00:00', 's1'), m('p2', '2026-10-01T10:00:00', 's1'), m('x', '2026-08-01T10:00:00', 'gone')],
      [{ ...perth, cover_id: 'p2' }, { id: 'empty', title: 'Empty', caption: null, cover_id: null }]);
    expect(entries).toHaveLength(2);
    const set = entries.find((e) => e.type === 'set');
    expect(set?.type === 'set' && set.cover.id).toBe('p2');
    expect(entries.some((e) => e.type === 'moment' && e.moment.id === 'x')).toBe(true);
  });

});

describe('fmtRange', () => {
  it('shows one day, a range, or a range across years', () => {
    expect(fmtRange('2026-09-14T08:00:00', '2026-09-14T20:00:00')).toBe('14-09-26');
    expect(fmtRange('2025-12-30T08:00:00', '2026-01-02T08:00:00')).toBe('30-12-25 – 02-01-26');
  });
  it('reads the date as written, ignoring the offset', () => {
    expect(fmtDay('2026-10-17T23:30:00+10:00')).toBe('17-10-26');
  });
});

describe('assemblePage', () => {
  const ids = (entries: ReturnType<typeof assemblePage>) => entries.map((e) => (e.type === 'set' ? `set:${e.set.id}:${e.moments.length}` : e.moment.id));
  // A set spanning 28 Sep – 3 Oct, and pages that break at 1 Oct.
  const s = { id: 's1', title: 'Perth', caption: null, cover_id: null };
  const set = [m('p1', '2026-09-28T10:00:00', 's1'), m('p2', '2026-09-30T10:00:00', 's1'), m('p3', '2026-10-03T10:00:00', 's1')];
  const oct = [m('a', '2026-10-05T10:00:00'), set[2], m('b', '2026-10-01T09:00:00')];
  const sep = [set[1], m('c', '2026-09-29T10:00:00'), set[0]];

  it('leaves a set out of the newer page when it starts on an older one', () => {
    expect(ids(assemblePage(oct, set, [s], '2026-10-01T00:00:00'))).toEqual(['a', 'b']);
  });

  it('shows the whole set on the page holding its first moment, including members from newer pages', () => {
    expect(ids(assemblePage(sep, set, [s], '2026-09-01T00:00:00'))).toEqual(['c', 'set:s1:3']);
  });

  it('never shows a moment twice across pages', () => {
    const shown = [...ids(assemblePage(oct, set, [s], '2026-10-01T00:00:00')), ...ids(assemblePage(sep, set, [s], '2026-09-01T00:00:00'))];
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toEqual(['a', 'b', 'c', 'set:s1:3']);
  });
});
