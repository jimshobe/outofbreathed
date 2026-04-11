export type Category = string;

export interface CategoryDef {
  value: string;
  label: string;
}

// Default set — used as fallback when Firestore config has no categories field
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { value: 'travel', label: 'Travel' },
  { value: 'food', label: 'Food' },
  { value: 'motorcycles', label: 'Motorcycles' },
  { value: 'sports', label: 'Sports' },
  { value: 'australia', label: 'Australia' },
];

export interface CategoryConfig {
  hashtags: Record<string, string[]>;
  categories?: CategoryDef[]; // dynamic list; falls back to DEFAULT_CATEGORIES if absent
}
