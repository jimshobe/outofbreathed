import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { saveTrip } from '../../../lib/travel/trips';
import type { Trip } from '../../../types/travel';

interface Props {
  trip: Trip | 'new';
  onDone: () => void;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toDateInput(ts: Timestamp): string {
  return ts.toDate().toISOString().slice(0, 10);
}

export default function TripForm({ trip, onDone }: Props) {
  const isNew = trip === 'new';
  const [name, setName] = useState(isNew ? '' : trip.name);
  const [description, setDescription] = useState(isNew ? '' : trip.description);
  const [startDate, setStartDate] = useState(isNew ? '' : toDateInput(trip.startDate));
  const [endDate, setEndDate] = useState(isNew ? '' : toDateInput(trip.endDate));
  const [published, setPublished] = useState(isNew ? false : trip.published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate) return;
    setSaving(true);
    setError(null);
    try {
      const tripId = isNew ? generateId() : trip.id;
      await saveTrip(tripId, {
        name: name.trim(),
        description: description.trim(),
        startDate: Timestamp.fromDate(new Date(startDate)),
        endDate: Timestamp.fromDate(new Date(endDate)),
        published,
      }, isNew);
      onDone();
    } catch (e) {
      setError('Failed to save trip.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-section-header">
        <h3 className="admin-section-title">{isNew ? 'New trip' : 'Edit trip'}</h3>
        <button className="btn-sm" onClick={onDone}>← Back</button>
      </div>

      <div className="form-field">
        <label className="form-label">Trip name</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan 2025" />
      </div>

      <div className="form-field">
        <label className="form-label">Description <span className="form-optional">(optional)</span></label>
        <textarea className="form-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the trip" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="form-field">
          <label className="form-label">Start date</label>
          <input className="form-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">End date</label>
          <input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="form-field">
        <label className="category-checkbox-label" style={{ width: 'fit-content' }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published (visible on the map)
        </label>
      </div>

      {error && <p className="form-hint" style={{ color: '#e05c6a', marginBottom: '1rem' }}>{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !startDate || !endDate}>
          {saving ? 'Saving…' : 'Save trip'}
        </button>
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
