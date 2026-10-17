import { describe, it, expect } from 'vitest';
import { googleMapsUrl, placeInfoUrl } from '../maps-link';

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

describe('placeInfoUrl', () => {
  it('sends venues to Google Maps and other places to Wikipedia via /map/go', () => {
    expect(placeInfoUrl('STABLE, Tugun', 0, -28.137, 153.487)).toMatch(/^https:\/\/www\.google\.com\/maps/);
    expect(placeInfoUrl('Natural Bridge', 0, -28.23, 153.243)).toBe('/map/go?lat=-28.23&lng=153.243&name=Natural%20Bridge');
  });
  it('treats a zoned name as a suburb, and needs a name', () => {
    expect(placeInfoUrl('Okanui, Burleigh Heads', 1, -28.089, 153.452)).toMatch(/^\/map\/go/);
    expect(placeInfoUrl(null, 0, 1, 2)).toBeNull();
  });
});
