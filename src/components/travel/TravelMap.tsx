import { useState, useCallback } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { TripJSON, TripStopJSON } from '../../types/travel';
import LocationPanel from './LocationPanel';

interface Props {
  trips: TripJSON[];
  stops: TripStopJSON[];
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Group stops by tripId and sort by order for route lines
function buildRouteFeatures(trips: TripJSON[], stops: TripStopJSON[]) {
  const features: GeoJSON.Feature[] = [];
  for (const trip of trips) {
    const tripStops = stops
      .filter((s) => s.tripId === trip.id)
      .sort((a, b) => a.order - b.order);
    if (tripStops.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { tripId: trip.id, tripName: trip.name },
      geometry: {
        type: 'LineString',
        coordinates: tripStops.map((s) => [s.lng, s.lat]),
      },
    });
  }
  return features;
}

export default function TravelMap({ trips, stops }: Props) {
  const [selectedStop, setSelectedStop] = useState<TripStopJSON | null>(null);

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: buildRouteFeatures(trips, stops),
  };

  // Default viewport: centre on the mean of all stop coordinates, or a sensible world view
  const defaultLng = stops.length
    ? stops.reduce((sum, s) => sum + s.lng, 0) / stops.length
    : 134;
  const defaultLat = stops.length
    ? stops.reduce((sum, s) => sum + s.lat, 0) / stops.length
    : -25;
  const defaultZoom = stops.length > 1 ? 3 : stops.length === 1 ? 8 : 2;

  const handleMarkerClick = useCallback(
    (e: React.MouseEvent, stop: TripStopJSON) => {
      e.stopPropagation();
      setSelectedStop(stop);
    },
    []
  );

  return (
    <div className="travel-map-wrap">
      <Map
        initialViewState={{ longitude: defaultLng, latitude: defaultLat, zoom: defaultZoom }}
        style={{ width: '100%', height: '420px' }}
        mapStyle={MAP_STYLE}
        onClick={() => setSelectedStop(null)}
      >
        {/* Route lines */}
        <Source id="routes" type="geojson" data={routeGeoJSON}>
          <Layer
            id="route-lines"
            type="line"
            paint={{
              'line-color': '#c96a2e',
              'line-width': 2,
              'line-opacity': 0.7,
              'line-dasharray': [3, 2],
            }}
          />
        </Source>

        {/* Stop markers */}
        {stops.map((stop) => (
          <Marker
            key={stop.id}
            longitude={stop.lng}
            latitude={stop.lat}
            anchor="bottom"
          >
            <button
              className="map-pin"
              onClick={(e) => handleMarkerClick(e, stop)}
              title={stop.name}
              aria-label={stop.name}
            >
              <svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M11 0C4.925 0 0 4.925 0 11c0 7.667 11 17 11 17s11-9.333 11-17c0-6.075-4.925-11-11-11z"
                  fill={selectedStop?.id === stop.id ? '#e07a38' : '#c96a2e'}
                />
                <circle cx="11" cy="11" r="4" fill="white" />
              </svg>
            </button>
          </Marker>
        ))}
      </Map>

      {selectedStop && (
        <LocationPanel
          stop={selectedStop}
          tripName={trips.find((t) => t.id === selectedStop.tripId)?.name ?? null}
          onClose={() => setSelectedStop(null)}
        />
      )}
    </div>
  );
}
