// The site's dark map style, shared by the globe (map.ts) and the set page's route map (setmap.ts).
import type maplibregl from 'maplibre-gl';

export const fade = (from: number, to: number, a = 1, b = 0) =>
  ['interpolate', ['linear'], ['zoom'], from, a, to, b] as maplibregl.ExpressionSpecification;

function graticule(step = 30) {
  const lines: [number, number][][] = [];
  for (let lng = -180; lng < 180; lng += step) lines.push(Array.from({ length: 33 }, (_, i) => [lng, -80 + i * 5]));
  for (let lat = -60; lat <= 60; lat += step) lines.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: lines } };
}

/** Coastline outlines when zoomed out; detailed dark vector tiles (water, parks, main roads) up close. */
export function darkStyle(opts: { globe: boolean }): maplibregl.StyleSpecification {
  return {
    version: 8,
    ...(opts.globe ? { projection: { type: 'globe' } } : {}),
    sources: {
      // GeoJSON is parsed in a worker, which can't resolve relative URLs.
      land: { type: 'geojson', data: new URL('/map/land-50m.geojson', location.href).href, attribution: 'Natural Earth' },
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      grat: { type: 'geojson', data: graticule() },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#080808' } },
      { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': '#1c1c1c', 'line-width': 1 } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#161616', 'fill-opacity': fade(4, 6) } },
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#777', 'line-width': 0.7, 'line-opacity': fade(4, 6) } },
      // Up close, switch to detailed vector tiles: land as dark fill, water cut out of it.
      { id: 'd-land', type: 'background', minzoom: 4, paint: { 'background-color': '#161616', 'background-opacity': fade(4, 6, 0, 1) } },
      { id: 'd-water', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 4, paint: { 'fill-color': '#080808', 'fill-opacity': fade(4, 6, 0, 1) } },
      { id: 'd-water-edge', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 5, filter: ['!=', ['get', 'class'], 'ocean'], paint: { 'line-color': '#333', 'line-width': 0.5 } },
      { id: 'd-park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 7, paint: { 'fill-color': '#111', 'fill-outline-color': '#1c1c1c' } },
      {
        id: 'd-roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        paint: { 'line-color': '#262626', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.4] },
      },
      {
        id: 'd-coast', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 5, filter: ['==', ['get', 'class'], 'ocean'],
        paint: { 'line-color': '#5a5a5a', 'line-width': 0.7, 'line-opacity': fade(5, 6, 0, 1) },
      },
    ],
  };
}

/** Ride routes as a dotted white line, with a wider invisible line on top so they're easy to tap. */
export function addRouteLayers(map: maplibregl.Map, routes: { id: string; title: string; route: [number, number][][] }[]) {
  map.addSource('routes', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: routes.map((r) => ({ type: 'Feature', properties: { id: r.id, title: r.title }, geometry: { type: 'MultiLineString', coordinates: r.route } })),
    },
  });
  map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#f2f2f2', 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [1, 2] } });
  map.addLayer({ id: 'routes-hit', type: 'line', source: 'routes', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } });
}
