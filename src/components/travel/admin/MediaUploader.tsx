import { useState, useEffect, useRef } from 'react';
import { getStopMedia, saveMedia, deleteMedia } from '../../../lib/travel/trips';
import { uploadTripMedia, deleteTripMedia } from '../../../lib/travel/storage';
import type { TripMedia } from '../../../types/travel';

interface Props {
  tripId: string;
  stopId: string;
}

export default function MediaUploader({ tripId, stopId }: Props) {
  const [mediaList, setMediaList] = useState<TripMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStopMedia(tripId, stopId).then((items) => {
      setMediaList(items);
      setLoading(false);
    });
  }, [tripId, stopId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        const { storagePath, url } = await uploadTripMedia(tripId, stopId, file);
        const mediaId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
        const newMedia: Omit<TripMedia, 'id'> = {
          stopId,
          tripId,
          storagePath,
          url,
          kind,
          alt: file.name.replace(/\.[^.]+$/, ''),
          order: mediaList.length + 1,
          createdAt: null as any,
        };
        await saveMedia(tripId, stopId, mediaId, newMedia);
        setMediaList((prev) => [...prev, { id: mediaId, ...newMedia }]);
      }
    } catch (err) {
      setUploadError('Upload failed. Check Storage rules and try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(item: TripMedia) {
    if (!confirm(`Delete this ${item.kind}?`)) return;
    try {
      await deleteTripMedia(item.storagePath);
      await deleteMedia(tripId, stopId, item.id);
      setMediaList((prev) => prev.filter((m) => m.id !== item.id));
    } catch {
      alert('Delete failed.');
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="admin-section-header" style={{ marginBottom: '0.75rem' }}>
        <h4 className="admin-section-title" style={{ fontSize: '0.85rem' }}>Photos & Videos</h4>
        <button className="btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>
      {uploadError && <p className="form-hint" style={{ color: '#e05c6a', marginBottom: '0.5rem' }}>{uploadError}</p>}
      {loading ? (
        <p className="admin-muted" style={{ fontSize: '0.8rem' }}>Loading…</p>
      ) : mediaList.length === 0 ? (
        <p className="admin-muted" style={{ fontSize: '0.8rem' }}>No media yet.</p>
      ) : (
        <div className="media-grid">
          {mediaList.map((item) => (
            <div key={item.id} className="media-thumb">
              {item.kind === 'video' ? (
                <video src={item.url} className="media-thumb-img" muted preload="metadata" />
              ) : (
                <img src={item.url} alt={item.alt} className="media-thumb-img" loading="lazy" />
              )}
              <button className="media-thumb-delete btn-sm btn-danger" onClick={() => handleDelete(item)} title="Delete">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
