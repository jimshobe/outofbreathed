import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('Admin.tsx static checks', () => {
  const src = readFileSync(resolve('src/components/Admin.tsx'), 'utf-8');

  it('post save uses serverTimestamp() not Timestamp.now() for createdAt', () => {
    expect(src).not.toMatch(/createdAt:\s*Timestamp\.now\(\)/);
  });

  it('post save uses serverTimestamp() not Timestamp.now() for updatedAt', () => {
    expect(src).not.toMatch(/updatedAt:\s*Timestamp\.now\(\)/);
  });
});
