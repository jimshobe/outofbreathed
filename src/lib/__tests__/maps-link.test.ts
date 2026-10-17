import { describe, it, expect } from 'vitest';
import { googleMapsUrl } from '../maps-link';

describe('googleMapsUrl', () => {
  it('links venue names', () => {
    expect(googleMapsUrl('STABLE, Tugun')).toBe('https://www.google.com/maps/search/?api=1&query=STABLE%2C%20Tugun');
  });
  it('skips plain suburbs, missing names and privacy zones', () => {
    expect(googleMapsUrl('Natural Bridge')).toBeNull();
    expect(googleMapsUrl(null)).toBeNull();
    expect(googleMapsUrl('Okanui, Burleigh Heads', 1)).toBeNull();
  });
});
