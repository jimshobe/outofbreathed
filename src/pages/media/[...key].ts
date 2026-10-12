import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Serves photos from R2. Every key is a unique id whose content never changes, so it can be cached
// for good by browsers and Cloudflare's edge. Supports Range requests.
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const range = parseRange(request.headers.get('Range'));
  const object = await env.MEDIA.get(key, {
    range,
    onlyIf: request.headers,
  });
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (!('body' in object)) return new Response(null, { status: 304, headers });

  if (range) {
    // Resolve the requested range against the real size for the Content-Range header.
    const start = 'suffix' in range ? Math.max(0, object.size - range.suffix) : (range.offset ?? 0);
    const length = 'suffix' in range ? object.size - start : (range.length ?? object.size - start);
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
};

function parseRange(header: string | null): R2Range | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  return m[2] ? { offset, length: Number(m[2]) - offset + 1 } : { offset };
}
