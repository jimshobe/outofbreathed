import { useState, useEffect } from 'react';
import type { TripStopJSON } from '../../types/travel';
import MediaGallery from './MediaGallery';
import BlueskyStopFeed from './BlueskyStopFeed';
import BlogStopLinks from './BlogStopLinks';

type PanelTab = 'photos' | 'posts' | 'blog';

interface Props {
  stop: TripStopJSON;
  tripName: string | null;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function LocationPanel({ stop, tripName, onClose }: Props) {
  const [tab, setTab] = useState<PanelTab>('photos');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Reset to photos tab when stop changes
  useEffect(() => { setTab('photos'); }, [stop.id]);

  return (
    <div className="location-panel">
      <div className="location-panel-header">
        <div>
          <h3 className="location-panel-name">{stop.name}</h3>
          {(tripName || stop.date) && (
            <p className="location-panel-meta">
              {tripName && <span>{tripName}</span>}
              {tripName && stop.date && <span className="location-panel-sep">·</span>}
              {stop.date && <span>{formatDate(stop.date)}</span>}
            </p>
          )}
        </div>
        <button className="location-panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <nav className="location-panel-tabs">
        {(['photos', 'posts', 'blog'] as PanelTab[]).map((t) => (
          <button
            key={t}
            className={`location-panel-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'photos' ? 'Photos' : t === 'posts' ? 'Social' : 'Blog'}
          </button>
        ))}
      </nav>

      <div className="location-panel-body">
        {tab === 'photos' && (
          <MediaGallery tripId={stop.tripId} stopId={stop.id} />
        )}
        {tab === 'posts' && (
          <BlueskyStopFeed stopId={stop.id} />
        )}
        {tab === 'blog' && (
          <BlogStopLinks stopId={stop.id} />
        )}
      </div>
    </div>
  );
}
