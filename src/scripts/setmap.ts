// The small route map on a set page: the ride's (zone-trimmed) route plus the set's photos as dots.
// Tapping a dot opens that photo in the lightbox.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { darkStyle, addRouteLayers } from './map-style';

const el = document.getElementById('setmap');
const data = JSON.parse(document.getElementById('setmap-data')?.textContent ?? 'null') as
  | { id: string; title: string; route: [number, number][][]; photos: { id: string; lng: number; lat: number }[] }
  | null;

if (el && data?.route.length) {
  const bounds = new maplibregl.LngLatBounds();
  for (const line of data.route) for (const p of line) bounds.extend(p);
  const map = new maplibregl.Map({
    container: el, style: darkStyle({ globe: false }), bounds, fitBoundsOptions: { padding: 28 },
    attributionControl: { compact: true }, cooperativeGestures: true, // one finger scrolls the page, two move the map
  });
  map.on('load', () => {
    el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    addRouteLayers(map, [data]);
    map.addSource('photos', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: data.photos.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) },
    });
    map.addLayer({ id: 'photos', type: 'circle', source: 'photos', paint: { 'circle-radius': 3.5, 'circle-color': '#f2f2f2', 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } });
    map.on('click', 'photos', (e) => {
      const id = e.features?.[0]?.properties?.id;
      // The set page's thumbnails are lightbox openers; reuse them.
      if (id) (document.querySelector(`[data-lb-open][data-lb-id="${id}"]`) as unknown as HTMLElement | null)?.click();
    });
    map.on('mouseenter', 'photos', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'photos', () => { map.getCanvas().style.cursor = ''; });
  });
}
