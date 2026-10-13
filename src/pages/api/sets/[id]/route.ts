import type { APIRoute } from 'astro';
import { saveRoute, removeRoute } from '../../../../lib/routes';
import { UploadError } from '../../../../lib/ingest';

// Owner-only (middleware): attach a ride's GPX file to a set (multipart `file`), or remove it.
export const POST: APIRoute = async ({ params, request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) return Response.json({ error: 'choose a GPX file' }, { status: 400 });
  try {
    return Response.json(await saveRoute(params.id!, file));
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
};

export const DELETE: APIRoute = async ({ params }) =>
  (await removeRoute(params.id!)) ? Response.json({ ok: true }) : Response.json({ error: 'not found' }, { status: 404 });
