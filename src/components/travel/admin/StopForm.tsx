import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { saveStop } from '../../../lib/travel/trips';
import type { TripStop } from '../../../types/travel';

interface Props {
  tripId: string;
  stop: TripStop | 'new';
  nextOrder: number;
  onDone: () => void;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function StopForm({ tripId, stop, nextOrder, onDone }: Props) {
  const isNew = stop === 'new';
  const [name, setName] = useState(isNew ? '' : stop.name);
  const [lat, setLat] = useState(isNew ? '' : String(stop.lat));
  const [lng, setLng] = useState(isNew ? '' : String(stop.lng));
  const [date, setDate] = useState(
    isNew ? '' : stop.date.toDate().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(isNew ? '' : stop.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !lat || !lng || !date) return;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Latitude and longitude must be valid numbers.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const stopId = isNew ? generateId() : stop.id;
      await saveStop(tripId, stopId, {
        name: name.trim(),
        lat: latNum,
        lng: lngNum,
        date: Timestamp.fromDate(new Date(date)),
        order: isNew ? nextOrder : stop.order,
        notes: notes.trim() || null,
      }, isNew);
      onDone();
    } catch (e) {
      setError('Failed to save stop.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-section-header">
        <h3 className="admin-section-title">{isNew ? 'New stop' : 'Edit stop'}</h3>
        <button className="btn-sm" onClick={onDone}>← Back</button>
      </div>

      <div className="form-field">
        <label className="form-label">Location name</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fushimi Inari Taisha" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="form-field">
          <label className="form-label">Latitude</label>
          <input className="form-input form-input--mono" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-33.8688" />
        </div>
        <div className="form-field">
          <label className="form-label">Longitude</label>
          <input className="form-input form-input--mono" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="151.2093" />
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Date visited</label>
        <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="form-field">
        <label className="form-label">Notes <span className="form-optional">(optional)</span></label>
        <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief notes about this stop" />
      </div>

      {error && <p className="form-hint" style={{ color: '#e05c6a', marginBottom: '1rem' }}>{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !lat || !lng || !date}>
          {saving ? 'Saving…' : 'Save stop'}
        </button>
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
