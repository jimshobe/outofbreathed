import { useState, useEffect, useRef } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import { getRoutes, saveRoute, deleteRoute, newRouteId } from '../../../lib/travel/trips';
import { uploadGpx } from '../../../lib/travel/storage';
import type { Route, RouteCoord } from '../../../types/travel';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function parseGpx(text: string): RouteCoord[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Invalid XML in GPX file.');

  let pts = Array.from(xml.querySelectorAll('trkpt'));
  if (!pts.length) pts = Array.from(xml.querySelectorAll('rtept'));
  if (!pts.length) pts = Array.from(xml.querySelectorAll('wpt'));

  const all = pts
    .map((p) => ({
      lat: parseFloat(p.getAttribute('lat') ?? ''),
      lng: parseFloat(p.getAttribute('lon') ?? ''),
    }))
    .filter((c) => isFinite(c.lat) && isFinite(c.lng));

  if (all.length < 2) throw new Error('No valid GPS track found in this file.');

  // Downsample to max 1000 points, always keeping first and last
  if (all.length <= 1000) return all;
  const step = Math.ceil(all.length / 999);
  const sampled = all.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== all[all.length - 1]) {
    sampled.push(all[all.length - 1]);
  }
  return sampled;
}

function getBounds(coords: RouteCoord[]): [[number, number], [number, number]] {
  const lngs = coords.map((c) => c.lng);
  const lats = coords.map((c) => c.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function formatTs(ts: any): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Route List ────────────────────────────────────────────────────────────────

function RouteList({
  routes,
  loading,
  onUploadClick,
  onDelete,
}: {
  routes: Route[];
  loading: boolean;
  onUploadClick: () => void;
  onDelete: (route: Route) => void;
}) {
  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">Routes</h2>
        <button className="btn-primary" onClick={onUploadClick}>Upload GPX</button>
      </div>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : routes.length === 0 ? (
        <p className="admin-muted">No routes yet. Upload a GPX file to get started.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Points</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="admin-muted" style={{ fontSize: '0.8rem' }}>{r.pointCount.toLocaleString()}</td>
                <td className="admin-muted" style={{ fontSize: '0.8rem' }}>{formatTs(r.createdAt)}</td>
                <td className="admin-actions">
                  <button className="btn-sm btn-danger" onClick={() => onDelete(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Upload Flow ───────────────────────────────────────────────────────────────

function UploadView({
  coords,
  name,
  onNameChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  coords: RouteCoord[];
  name: string;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const bounds = getBounds(coords);
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords.map((c) => [c.lng, c.lat]),
        },
      },
    ],
  };

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">New route</h2>
        <button className="btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <div className="travel-map-wrap" style={{ marginBottom: '1.25rem' }}>
        <Map
          initialViewState={{ bounds, fitBoundsOptions: { padding: 30 } }}
          style={{ width: '100%', height: '300px' }}
          mapStyle={MAP_STYLE}
          scrollZoom={false}
        >
          <Source id="preview-route" type="geojson" data={geojson}>
            <Layer
              id="preview-route-line"
              type="line"
              paint={{ 'line-color': '#c96a2e', 'line-width': 3, 'line-opacity': 0.85 }}
            />
          </Source>
        </Map>
      </div>

      <p className="admin-muted" style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        {coords.length.toLocaleString()} GPS points
      </p>

      <div className="form-field">
        <label className="form-label">Route name</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Great Ocean Road"
          autoFocus
        />
      </div>

      {error && <p className="form-hint" style={{ color: '#e05c6a', marginBottom: '1rem' }}>{error}</p>}

      <div className="form-actions">
        <button
          className="btn-primary"
          onClick={onSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Save route'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main RouteAdmin ───────────────────────────────────────────────────────────

export default function RouteAdmin() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<{ file: File; coords: RouteCoord[]; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRoutes()
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError(null);
    try {
      const text = await file.text();
      const coords = parseGpx(text);
      setUpload({ file, coords, name: file.name.replace(/\.gpx$/i, '').replace(/[-_]/g, ' ') });
    } catch (err: any) {
      setParseError(err.message ?? 'Failed to parse GPX file.');
    }
  }

  async function handleSave() {
    if (!upload || !upload.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const routeId = newRouteId();
      const { storagePath } = await uploadGpx(routeId, upload.file);
      await saveRoute(routeId, {
        name: upload.name.trim(),
        gpxStoragePath: storagePath,
        coordinates: upload.coords,
        pointCount: upload.coords.length,
      });
      const updated = await getRoutes();
      setRoutes(updated);
      setUpload(null);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save route.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(route: Route) {
    if (!confirm(`Delete route "${route.name}"? This cannot be undone.`)) return;
    await deleteRoute(route.id);
    setRoutes((prev) => prev.filter((r) => r.id !== route.id));
  }

  if (upload) {
    return (
      <UploadView
        coords={upload.coords}
        name={upload.name}
        onNameChange={(name) => setUpload((u) => u ? { ...u, name } : u)}
        onSave={handleSave}
        onCancel={() => { setUpload(null); setSaveError(null); }}
        saving={saving}
        error={saveError}
      />
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {parseError && (
        <p className="form-hint" style={{ color: '#e05c6a', marginBottom: '1rem' }}>{parseError}</p>
      )}
      <RouteList
        routes={routes}
        loading={loading}
        onUploadClick={() => { setParseError(null); fileInputRef.current?.click(); }}
        onDelete={handleDelete}
      />
    </>
  );
}
