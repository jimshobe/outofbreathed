import { describe, it, expect } from 'vitest';
import { sign, verify, pkceChallenge } from '../signed';

const SECRET = 'test-secret-0123456789';

describe('signed values', () => {
  it('round-trips data until it expires', async () => {
    const t0 = Date.parse('2026-10-12T00:00:00Z');
    const v = await sign({ uid: 'g-123' }, SECRET, 60, t0);
    expect(await verify(v, SECRET, t0 + 59_000)).toMatchObject({ uid: 'g-123' });
    expect(await verify(v, SECRET, t0 + 61_000)).toBeNull();
  });

  it('rejects tampering, a different secret, and junk', async () => {
    const v = await sign({ uid: 'g-123' }, SECRET, 60);
    const [body, sig] = v.split('.');
    const forged = btoa(JSON.stringify({ uid: 'owner', exp: 9e9 })).replace(/=+$/, '');
    expect(await verify(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verify(`${body}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(await verify(v, 'another-secret')).toBeNull();
    expect(await verify('not-a-token', SECRET)).toBeNull();
    expect(await verify(undefined, SECRET)).toBeNull();
  });

  it('refuses to sign without a secret', async () => {
    await expect(sign({ uid: 'x' }, '', 60)).rejects.toThrow(/secret/);
  });

  it('computes the RFC 7636 example PKCE challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});
