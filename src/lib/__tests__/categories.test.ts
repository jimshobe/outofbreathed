import { describe, it, expect } from 'vitest';
import { parseCategories } from '../categories';

describe('parseCategories', () => {
  it('accepts the newline-joined list the iOS Shortcut sends', () => {
    expect(parseCategories(['misc\nfood'])).toEqual(['misc', 'food']);
    expect(parseCategories(['family\r\ntravel\r\n'])).toEqual(['family', 'travel']);
  });

  it('accepts repeated fields and comma-separated text, keeping order and dropping duplicates', () => {
    expect(parseCategories(['moto', 'travel, moto', ' FOOD '])).toEqual(['moto', 'travel', 'food']);
  });

  it('returns nothing for empty input and rejects unknown names', () => {
    expect(parseCategories([undefined, '', '\n'])).toEqual([]);
    expect(() => parseCategories(['misc\npets'])).toThrow(/unknown category "pets"/);
  });
});
