import { useState, useEffect } from 'react';
import { getAllTrips, getTripStops, deleteTrip, deleteStop } from '../../../lib/travel/trips';
import type { Trip, TripStop } from '../../../types/travel';
import TripForm from './TripForm';
import StopForm from './StopForm';
import MediaUploader from './MediaUploader';

type View =
  | { kind: 'list' }
  | { kind: 'trip-form'; trip: Trip | 'new' }
  | { kind: 'trip-detail'; trip: Trip }
  | { kind: 'stop-form'; trip: Trip; stop: TripStop | 'new' }
  | { kind: 'stop-media'; trip: Trip; stop: TripStop };

function formatDate(ts: any): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Trip List ─────────────────────────────────────────────────────────────────

function TripList({ onSelect, onNew, onEdit }: {
  onSelect: (trip: Trip) => void;
  onNew: () => void;
  onEdit: (trip: Trip) => void;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllTrips()
      .then((t) => setTrips(t))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(trip: Trip) {
    if (!confirm(`Delete trip "${trip.name}"? This cannot be undone.`)) return;
    await deleteTrip(trip.id);
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">Trips</h2>
        <button className="btn-primary" onClick={onNew}>New trip</button>
      </div>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : trips.length === 0 ? (
        <p className="admin-muted">No trips yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Dates</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>
                  <button
                    className="admin-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
                    onClick={() => onSelect(t)}
                  >
                    {t.name}
                  </button>
                </td>
                <td className="admin-muted" style={{ fontSize: '0.8rem' }}>{formatDate(t.startDate)} – {formatDate(t.endDate)}</td>
                <td>
                  <span className={`status-badge ${t.published ? 'published' : 'draft'}`}>
                    {t.published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="admin-actions">
                  <button className="btn-sm" onClick={() => onEdit(t)}>Edit</button>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(t)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Trip Detail (stops) ───────────────────────────────────────────────────────

function TripDetail({ trip, onBack, onAddStop, onEditStop, onManageMedia }: {
  trip: Trip;
  onBack: () => void;
  onAddStop: () => void;
  onEditStop: (stop: TripStop) => void;
  onManageMedia: (stop: TripStop) => void;
}) {
  const [stops, setStops] = useState<TripStop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTripStops(trip.id)
      .then((s) => setStops(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trip.id]);

  async function handleDeleteStop(stop: TripStop) {
    if (!confirm(`Delete stop "${stop.name}"?`)) return;
    await deleteStop(trip.id, stop.id);
    setStops((prev) => prev.filter((s) => s.id !== stop.id));
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">{trip.name}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={onAddStop}>+ Stop</button>
          <button className="btn-sm" onClick={onBack}>← All trips</button>
        </div>
      </div>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : stops.length === 0 ? (
        <p className="admin-muted">No stops yet. Add the first location for this trip.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>#</th><th>Location</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {stops.map((s) => (
              <tr key={s.id}>
                <td className="admin-muted" style={{ width: '2rem' }}>{s.order}</td>
                <td>{s.name}</td>
                <td className="admin-muted" style={{ fontSize: '0.8rem' }}>{formatDate(s.date)}</td>
                <td className="admin-actions">
                  <button className="btn-sm" onClick={() => onManageMedia(s)}>Photos</button>
                  <button className="btn-sm" onClick={() => onEditStop(s)}>Edit</button>
                  <button className="btn-sm btn-danger" onClick={() => handleDeleteStop(s)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Stop Media View ──────────────────────────────────────────────────────────

function StopMediaView({ trip, stop, onBack }: {
  trip: Trip;
  stop: TripStop;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">{stop.name}</h2>
        <button className="btn-sm" onClick={onBack}>← {trip.name}</button>
      </div>
      <MediaUploader tripId={trip.id} stopId={stop.id} />
    </div>
  );
}

// ── Main TripAdmin ────────────────────────────────────────────────────────────

export default function TripAdmin() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [stopCount, setStopCount] = useState(0);

  // When coming back to trip detail after adding a stop, refetch by key change
  function goToTripDetail(trip: Trip) {
    setView({ kind: 'trip-detail', trip });
  }

  if (view.kind === 'trip-form') {
    return (
      <TripForm
        trip={view.trip}
        onDone={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'stop-form') {
    return (
      <StopForm
        tripId={view.trip.id}
        stop={view.stop}
        nextOrder={stopCount + 1}
        onDone={() => goToTripDetail(view.trip)}
      />
    );
  }

  if (view.kind === 'stop-media') {
    return (
      <StopMediaView
        trip={view.trip}
        stop={view.stop}
        onBack={() => goToTripDetail(view.trip)}
      />
    );
  }

  if (view.kind === 'trip-detail') {
    return (
      <TripDetail
        trip={view.trip}
        onBack={() => setView({ kind: 'list' })}
        onAddStop={() => setView({ kind: 'stop-form', trip: view.trip, stop: 'new' })}
        onEditStop={(stop) => setView({ kind: 'stop-form', trip: view.trip, stop })}
        onManageMedia={(stop) => setView({ kind: 'stop-media', trip: view.trip, stop })}
      />
    );
  }

  return (
    <TripList
      onNew={() => setView({ kind: 'trip-form', trip: 'new' })}
      onEdit={(trip) => setView({ kind: 'trip-form', trip })}
      onSelect={(trip) => goToTripDetail(trip)}
    />
  );
}
