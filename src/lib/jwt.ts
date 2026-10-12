// RS256 JWT verification against a provider's published keys (used for Google sign-in ID tokens).

interface Jwk extends JsonWebKey { kid: string }

const keyCache = new Map<string, { keys: Map<string, CryptoKey>; fetchedAt: number }>();
const KEY_TTL_MS = 60 * 60 * 1000;

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function signingKeys(jwksUrl: string, forceRefresh = false): Promise<Map<string, CryptoKey>> {
  const cached = keyCache.get(jwksUrl);
  if (cached && !forceRefresh && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.keys;
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keyCache.set(jwksUrl, { keys: map, fetchedAt: Date.now() });
  return map;
}

/**
 * Verifies an RS256 JWT against a JWKS endpoint and returns its claims, or null if it's missing,
 * malformed, signed by an unknown key, for another audience/issuer, or expired.
 */
export async function verifyJwt(
  token: string | null | undefined,
  opts: { jwksUrl: string; issuers: string[]; audience: string },
): Promise<Record<string, unknown> | null> {
  if (!token || !opts.audience) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    if (header.alg !== 'RS256') return null;
    let key = (await signingKeys(opts.jwksUrl)).get(header.kid);
    // Providers rotate keys; refetch once if the kid is new to us.
    if (!key) key = (await signingKeys(opts.jwksUrl, true)).get(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    const now = Math.floor(Date.now() / 1000);
    const audOk = Array.isArray(claims.aud) ? claims.aud.includes(opts.audience) : claims.aud === opts.audience;
    if (!audOk || !opts.issuers.includes(claims.iss) || typeof claims.exp !== 'number' || claims.exp < now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return null;
    return claims;
  } catch {
    return null;
  }
}
