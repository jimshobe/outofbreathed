import { useState, useEffect } from 'react';
import { getStopMedia } from '../../lib/travel/trips';
import type { TripMedia } from '../../types/travel';

interface Props {
  tripId: string;
  stopId: string;
}

interface LightboxState {
  url: string;
  alt: string;
  kind: 'image' | 'video';
}

function Lightbox({ url, alt, kind, onClose }: LightboxState & { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      {kind === 'video' ? (
        <video src={url} className="lightbox-img" controls autoPlay loop onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

export default function MediaGallery({ tripId, stopId }: Props) {
  const [media, setMedia] = useState<TripMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    setLoading(true);
    getStopMedia(tripId, stopId).then((items) => {
      setMedia(items);
      setLoading(false);
    });
  }, [tripId, stopId]);

  if (loading) return <p className="panel-empty">Loading…</p>;
  if (media.length === 0) return <p className="panel-empty">No photos yet.</p>;

  return (
    <>
      {lightbox && (
        <Lightbox {...lightbox} onClose={() => setLightbox(null)} />
      )}
      <div className="panel-media-grid">
        {media.map((item) => (
          <button
            key={item.id}
            className="panel-media-btn"
            onClick={() => setLightbox({ url: item.url, alt: item.alt, kind: item.kind })}
            aria-label={item.kind === 'video' ? 'Play video' : `View ${item.alt}`}
          >
            {item.kind === 'video' ? (
              <video src={item.url} muted preload="metadata" />
            ) : (
              <img src={item.url} alt={item.alt} loading="lazy" />
            )}
          </button>
        ))}
      </div>
    </>
  );
}
