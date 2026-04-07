import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const ADMIN_EMAIL = 'jim@outofbreathed.com';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { type, callerUid } = body;

  if (!type || !callerUid) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }

  if (!import.meta.env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500 });
  }

  const resend = new Resend(import.meta.env.RESEND_API_KEY);

  let subject: string;
  let html: string;

  if (type === 'comment') {
    const { postSlug, commenterName, text } = body;
    if (!postSlug || !commenterName || !text) {
      return new Response(JSON.stringify({ error: 'Missing comment fields' }), { status: 400 });
    }
    const postUrl = `https://www.outofbreathed.com/posts/${postSlug}`;
    subject = `New comment on "${postSlug}"`;
    html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0f0f0f;padding:28px 36px;">
            <p style="margin:0;color:#e8e6e1;font-size:1rem;font-weight:500;letter-spacing:-0.01em;">outofbreathed.com</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;color:#1a1a1a;">
            <p style="margin:0 0 8px;font-size:0.82rem;color:#888;">New comment</p>
            <p style="margin:0 0 20px;font-size:1rem;line-height:1.6;">
              <strong>${commenterName}</strong> commented on <a href="${postUrl}" style="color:#c96a2e;text-decoration:none;">${postSlug}</a>:
            </p>
            <blockquote style="margin:0 0 28px;padding:16px 20px;background:#f9f9f9;border-left:3px solid #c96a2e;border-radius:0 4px 4px 0;font-size:0.95rem;line-height:1.6;color:#333;">
              ${text.slice(0, 500)}${text.length > 500 ? '…' : ''}
            </blockquote>
            <a href="${postUrl}#comments" style="display:inline-block;background:#0f0f0f;color:#e8e6e1;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:0.875rem;font-weight:500;">
              View post →
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  } else if (type === 'signup') {
    const { userName, userEmail } = body;
    if (!userName || !userEmail) {
      return new Response(JSON.stringify({ error: 'Missing signup fields' }), { status: 400 });
    }
    const adminUrl = 'https://www.outofbreathed.com/admin';
    subject = `New access request from ${userName}`;
    html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0f0f0f;padding:28px 36px;">
            <p style="margin:0;color:#e8e6e1;font-size:1rem;font-weight:500;letter-spacing:-0.01em;">outofbreathed.com</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;color:#1a1a1a;">
            <p style="margin:0 0 8px;font-size:0.82rem;color:#888;">New access request</p>
            <p style="margin:0 0 20px;font-size:1rem;line-height:1.6;">
              <strong>${userName}</strong> (<a href="mailto:${userEmail}" style="color:#c96a2e;text-decoration:none;">${userEmail}</a>) has signed up and is waiting for access.
            </p>
            <a href="${adminUrl}" style="display:inline-block;background:#0f0f0f;color:#e8e6e1;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:0.875rem;font-weight:500;">
              Review in admin panel →
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  } else {
    return new Response(JSON.stringify({ error: 'Unknown notification type' }), { status: 400 });
  }

  const { error: emailError } = await resend.emails.send({
    from: 'outofbreathed.com <jim@outofbreathed.com>',
    to: ADMIN_EMAIL,
    subject,
    html,
  });

  if (emailError) {
    console.error('Notify email error:', JSON.stringify(emailError));
    return new Response(JSON.stringify({ error: 'Email failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
