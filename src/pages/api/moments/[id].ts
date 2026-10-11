import type { APIRoute } from 'astro';
import { updateMoment, deleteMoment, type MomentEdit } from '../../../lib/edit';
import { UploadError } from '../../../lib/ingest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ params, request }) => {
  let edit: MomentEdit;
  try {
    edit = await request.json();
  } catch {
    return json({ error: 'expected JSON' }, 400);
  }
  try {
    return (await updateMoment(params.id!, edit)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof UploadError) return json({ error: e.message }, e.status);
    throw e;
  }
};

export const DELETE: APIRoute = async ({ params }) =>
  (await deleteMoment(params.id!)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
