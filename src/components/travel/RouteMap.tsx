import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { RouteCoord } from '../../types/travel';

interface Props {
  coordinates: RouteCoord[];
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function getBounds(coords: RouteCoord[]): [[number, number], [number, number]] {
  const lngs = coords.map((c) => c.lng);
  const lats = coords.map((c) => c.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export default function RouteMap({ coordinates }: Props) {
  if (coordinates.length < 2) return null;

  const bounds = getBounds(coordinates);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates.map((c) => [c.lng, c.lat]),
        },
      },
    ],
  };

  return (
    <div className="travel-map-wrap">
      <Map
        initialViewState={{ bounds, fitBoundsOptions: { padding: 40 } }}
        style={{ width: '100%', height: '360px' }}
        mapStyle={MAP_STYLE}
        scrollZoom={false}
      >
        <Source id="route" type="geojson" data={geojson}>
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': '#c96a2e',
              'line-width': 3,
              'line-opacity': 0.85,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
