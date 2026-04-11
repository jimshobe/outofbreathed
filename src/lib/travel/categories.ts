import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Category, CategoryConfig } from '../../types/categories';

export async function loadCategoryConfig(): Promise<CategoryConfig> {
  const snap = await getDoc(doc(db, 'config', 'categories'));
  if (!snap.exists()) return { hashtags: {} };
  return snap.data() as CategoryConfig;
}

export async function saveCategoryConfig(config: CategoryConfig): Promise<void> {
  await setDoc(doc(db, 'config', 'categories'), config);
}

// Returns categories matched by hashtags present in the post text/tags
export function categorizeSocialPost(hashtags: string[], config: CategoryConfig): Category[] {
  const categories = new Set<Category>();
  for (const tag of hashtags) {
    const mapped = config.hashtags[tag.toLowerCase()];
    if (mapped) {
      for (const cat of mapped) categories.add(cat);
    }
  }
  return Array.from(categories);
}
