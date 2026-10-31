import { describe, it, expect } from 'vitest';
import { googleMapsUrl, placeParts, splitVenue, placeFields, withParts } from '../maps-link';

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

describe('placeParts', () => {
  it('splits a venue into Google Maps for the venue and Wikipedia for its suburb', () => {
    const [venue, area] = placeParts('STABLE, Tugun', 0, -28.137, 153.487);
    expect(venue.text).toBe('STABLE');
    expect(venue.href).toMatch(/^https:\/\/www\.google\.com\/maps/);
    expect(area).toMatchObject({ text: 'Tugun', href: '/map/go?lat=-28.137&lng=153.487&name=STABLE%2C%20Tugun' });
  });
  it('links other places to Wikipedia, zoned names included', () => {
    expect(placeParts('Natural Bridge', 0, -28.23, 153.243)).toEqual([
      { text: 'Natural Bridge', href: '/map/go?lat=-28.23&lng=153.243&name=Natural%20Bridge', label: 'Read about Natural Bridge' },
    ]);
    expect(placeParts('Okanui, Burleigh Heads', 1, -28.089, 153.452)).toHaveLength(1);
    expect(placeParts(null, 0, 1, 2)).toEqual([]);
  });
  it('splits on the last comma', () => {
    expect(splitVenue('Bar, Grill, Southport')).toEqual({ venue: 'Bar, Grill', area: 'Southport' });
  });
  it('uses owner overrides where given, automatic links elsewhere', () => {
    const gm = 'https://maps.app.goo.gl/abc', wp = 'https://en.wikipedia.org/wiki/Tugun,_Queensland';
    const [venue, area] = placeParts('STABLE, Tugun', 0, -28.137, 153.487, { gmaps_url: gm, wiki_url: null });
    expect(venue.href).toBe(gm);
    expect(area.href).toMatch(/^\/map\/go/);
    expect(placeParts('Tugun', 0, 1, 2, { gmaps_url: null, wiki_url: wp })[0].href).toBe(wp);
  });
});

describe('withParts', () => {
  it('reads a name as business and suburb', () => {
    expect(placeFields('STABLE, Tugun')).toEqual({ venue: 'STABLE', area: 'Tugun' });
    expect(placeFields('Tugun')).toEqual({ venue: null, area: 'Tugun' });
    expect(placeFields(null)).toEqual({ venue: null, area: null });
  });
  it('changes only the part given', () => {
    expect(withParts('Wrong Cafe, Miami', { venue: 'Barber Co' })).toBe('Barber Co, Miami');
    expect(withParts('Barber Co, Miami', { area: 'Burleigh Heads' })).toBe('Barber Co, Burleigh Heads');
    expect(withParts('Miami', { venue: 'Barber Co' })).toBe('Barber Co, Miami');
    expect(withParts(null, { venue: 'Barber Co', area: 'Miami' })).toBe('Barber Co, Miami');
  });
  it('clears a part with an empty string', () => {
    expect(withParts('Barber Co, Miami', { venue: ' ' })).toBe('Miami');
    expect(withParts('Barber Co, Miami', { area: '' })).toBe('Barber Co');
    expect(withParts('Miami', { area: '' })).toBeNull();
  });
});
