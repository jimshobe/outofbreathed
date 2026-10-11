export const CATEGORIES = ['misc', 'family', 'travel', 'moto', 'food'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Normalises categories from any uploader: repeated form fields, comma-separated text, or the
 * newline-joined text the iOS Shortcut produces when a list goes into a form field.
 * Returns them de-duplicated in the order given; throws on anything unknown.
 */
export function parseCategories(values: (string | null | undefined)[]): Category[] {
  const out: Category[] = [];
  for (const raw of values.flatMap((v) => (v ?? '').split(/[\n\r,]+/))) {
    const c = raw.trim().toLowerCase();
    if (!c) continue;
    if (!CATEGORIES.includes(c as Category)) throw new Error(`unknown category "${c}"; use ${CATEGORIES.join(', ')}`);
    if (!out.includes(c as Category)) out.push(c as Category);
  }
  return out;
}
