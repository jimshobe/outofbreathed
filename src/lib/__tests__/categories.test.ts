import { describe, it, expect } from 'vitest';
import { parseCategories } from '../categories';

describe('parseCategories', () => {
  it('accepts the newline-joined list the iOS Shortcut sends', () => {
    expect(parseCategories(['moto\nfood'])).toEqual(['moto', 'food']);
    expect(parseCategories(['family\r\ntravel\r\n'])).toEqual(['family', 'travel']);
  });

  it('accepts repeated fields and comma-separated text, keeping order and dropping duplicates', () => {
    expect(parseCategories(['moto', 'travel, moto', ' FOOD '])).toEqual(['moto', 'travel', 'food']);
  });

  it('returns nothing for empty input and rejects unknown names', () => {
    expect(parseCategories([undefined, '', '\n'])).toEqual([]);
    expect(() => parseCategories(['moto\npets'])).toThrow(/unknown category "pets"/);
    expect(() => parseCategories(['misc'])).toThrow(/unknown category "misc"/);
  });
});
