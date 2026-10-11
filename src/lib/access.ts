// Verifies the Cloudflare Access JWT that Access attaches to every request it lets through.
// Access already blocks signed-out visitors at the edge; checking the token here as well means
// a misconfigured or missing Access app fails closed instead of exposing the site.

interface Jwk extends JsonWebKey { kid: string }

const keyCache = new Map<string, { keys: Map<string, CryptoKey>; fetchedAt: number }>();
const KEY_TTL_MS = 60 * 60 * 1000;

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function signingKeys(teamDomain: string, forceRefresh = false): Promise<Map<string, CryptoKey>> {
  const cached = keyCache.get(teamDomain);
  if (cached && !forceRefresh && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keyCache.set(teamDomain, { keys: map, fetchedAt: Date.now() });
  return map;
}

export interface AccessIdentity { email: string }

/** Returns the signed-in identity, or null if the token is missing or invalid. */
export async function verifyAccessJwt(token: string | null, teamDomain: string, aud: string): Promise<AccessIdentity | null> {
  if (!token || !teamDomain || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    if (header.alg !== 'RS256') return null;
    let key = (await signingKeys(teamDomain)).get(header.kid);
    // Access rotates keys; refetch once if the kid is new to us.
    if (!key) key = (await signingKeys(teamDomain, true)).get(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    const now = Math.floor(Date.now() / 1000);
    const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
    if (!audOk || claims.iss !== `https://${teamDomain}` || typeof claims.exp !== 'number' || claims.exp < now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return null;
    return typeof claims.email === 'string' ? { email: claims.email } : null;
  } catch {
    return null;
  }
}
