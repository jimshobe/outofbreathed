import type { APIRoute } from 'astro';
import { ingest, fieldsFromForm, UploadError } from '../../../lib/ingest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// One photo or video per request (multipart form): `file` plus optional fields, or `youtube` with no file.
// Owner-only (enforced in middleware). Safe to retry when `source_ref` is sent.
export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'expected a multipart form' }, 400);
  }
  const file = form.get('file');
  try {
    const { id, created } = await ingest(file instanceof File && file.size > 0 ? file : null, fieldsFromForm(form));
    return json({ id, created }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, e.status);
    console.error('upload failed', e);
    return json({ error: 'upload failed on the server; try again' }, 500);
  }
};
