import { vi } from 'vitest';

// Sentinel refs so onSnapshot can tell query refs from doc refs
export const COMMENTS_QUERY_REF = { __type: 'commentsQuery' };
export const USER_DOC_REF = { __type: 'userDoc' };
export const EMPTY_QUERY_REF = { __type: 'emptyQuery' };

export function makeEmptySnapshot() {
  return { docs: [], size: 0, empty: true };
}

export function makeDocSnapshot(data: Record<string, unknown>, exists = true) {
  return { exists: () => exists, data: () => data };
}

/** Auth user factory */
export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'user-123',
    displayName: 'Test User',
    email: 'test@example.com',
    photoURL: null,
    ...overrides,
  };
}
