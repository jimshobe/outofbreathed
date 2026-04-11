import { useState, useEffect } from 'react';
import { loadCategoryConfig, saveCategoryConfig } from '../../../lib/travel/categories';
import { DEFAULT_CATEGORIES } from '../../../types/categories';
import type { CategoryConfig, CategoryDef } from '../../../types/categories';

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function CategoryConfig() {
  const [config, setConfig] = useState<CategoryConfig>({ hashtags: {}, categories: DEFAULT_CATEGORIES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // New category form
  const [newCatLabel, setNewCatLabel] = useState('');

  // New hashtag mapping form
  const [newTag, setNewTag] = useState('');
  const [newTagCategories, setNewTagCategories] = useState<string[]>([]);

  useEffect(() => {
    loadCategoryConfig()
      .then((c) => setConfig({ ...c, categories: c.categories ?? DEFAULT_CATEGORIES }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories: CategoryDef[] = config.categories ?? DEFAULT_CATEGORIES;

  // ── Category list management ────────────────────────────────────────────────

  function addCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    const value = slugify(label);
    if (categories.some((c) => c.value === value)) return;
    setConfig((prev) => ({
      ...prev,
      categories: [...(prev.categories ?? DEFAULT_CATEGORIES), { value, label }],
    }));
    setNewCatLabel('');
  }

  function removeCategory(value: string) {
    setConfig((prev) => ({
      ...prev,
      categories: (prev.categories ?? DEFAULT_CATEGORIES).filter((c) => c.value !== value),
      // Also remove any hashtag mappings that referenced this category
      hashtags: Object.fromEntries(
        Object.entries(prev.hashtags).map(([tag, cats]) => [tag, cats.filter((c) => c !== value)])
      ),
    }));
  }

  // ── Hashtag mapping management ──────────────────────────────────────────────

  function toggleNewTagCat(value: string) {
    setNewTagCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  }

  function addMapping() {
    const tag = newTag.trim().toLowerCase().replace(/^#/, '');
    if (!tag || !newTagCategories.length) return;
    setConfig((prev) => ({
      ...prev,
      hashtags: { ...prev.hashtags, [tag]: newTagCategories },
    }));
    setNewTag('');
    setNewTagCategories([]);
  }

  function removeMapping(tag: string) {
    setConfig((prev) => {
      const next = { ...prev, hashtags: { ...prev.hashtags } };
      delete next.hashtags[tag];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCategoryConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="admin-muted">Loading…</p>;

  const mappingEntries = Object.entries(config.hashtags);

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">Categories</h2>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* Category list */}
      <p className="form-hint" style={{ marginBottom: '1rem' }}>
        These appear as filter pills on the stream. Remove to hide, add to create new ones.
      </p>
      <table className="admin-table" style={{ marginBottom: '1rem' }}>
        <thead>
          <tr><th>Label</th><th>Value</th><th></th></tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.value}>
              <td>{cat.label}</td>
              <td><code style={{ fontSize: '0.8rem' }}>{cat.value}</code></td>
              <td className="admin-actions">
                <button className="btn-sm btn-danger" onClick={() => removeCategory(cat.value)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add category */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '2.5rem' }}>
        <input
          className="form-input"
          style={{ maxWidth: '200px' }}
          value={newCatLabel}
          onChange={(e) => setNewCatLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          placeholder="New category label"
        />
        <button className="btn-secondary" onClick={addCategory} disabled={!newCatLabel.trim()}>
          Add category
        </button>
      </div>

      {/* Hashtag mappings */}
      <div className="admin-section-header" style={{ marginBottom: '0.5rem' }}>
        <h3 className="admin-section-title" style={{ fontSize: '0.9rem' }}>Hashtag → Category mapping</h3>
      </div>
      <p className="admin-muted" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
        Social posts with these hashtags are auto-categorized. Case-insensitive.
      </p>

      {mappingEntries.length > 0 && (
        <table className="admin-table" style={{ marginBottom: '1.5rem' }}>
          <thead>
            <tr><th>Hashtag</th><th>Categories</th><th></th></tr>
          </thead>
          <tbody>
            {mappingEntries.map(([tag, cats]) => (
              <tr key={tag}>
                <td><code style={{ fontSize: '0.85rem' }}>#{tag}</code></td>
                <td>{cats.join(', ')}</td>
                <td className="admin-actions">
                  <button className="btn-sm btn-danger" onClick={() => removeMapping(tag)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="form-field">
        <label className="form-label">Hashtag (without #)</label>
        <input
          className="form-input form-input--mono"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="moto"
          onKeyDown={(e) => e.key === 'Enter' && addMapping()}
          style={{ maxWidth: '240px' }}
        />
      </div>
      <div className="form-field">
        <label className="form-label">Maps to</label>
        <div className="category-checkboxes">
          {categories.map((cat) => (
            <label key={cat.value} className="category-checkbox-label">
              <input
                type="checkbox"
                checked={newTagCategories.includes(cat.value)}
                onChange={() => toggleNewTagCat(cat.value)}
              />
              {cat.label}
            </label>
          ))}
        </div>
      </div>
      <button
        className="btn-secondary"
        onClick={addMapping}
        disabled={!newTag.trim() || !newTagCategories.length}
      >
        Add mapping
      </button>
    </div>
  );
}
