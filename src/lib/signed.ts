// Tamper-proof values for cookies: base64url(JSON) + "." + HMAC-SHA256 signature, with an expiry.
// Used for the sign-in session and the short-lived OAuth state. Pure WebCrypto, so unit-testable.

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

const keyCache = new Map<string, Promise<CryptoKey>>();
const hmacKey = (secret: string) => {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, k);
  }
  return k;
};

/** Signs `data` so it can be read back (until `ttlSeconds` pass) only if unmodified. */
export async function sign(data: Record<string, unknown>, secret: string, ttlSeconds: number, now = Date.now()): Promise<string> {
  if (!secret) throw new Error('signing secret is not configured');
  const body = b64url(enc.encode(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + ttlSeconds })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The signed data, or null if missing, tampered with, signed with another secret, or expired. */
export async function verify<T extends Record<string, unknown>>(value: string | undefined | null, secret: string, now = Date.now()): Promise<T | null> {
  if (!value || !secret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T & { exp?: number };
    return typeof data.exp === 'number' && data.exp > now / 1000 ? data : null;
  } catch {
    return null;
  }
}

/** A random URL-safe string (state, PKCE verifier). */
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}
