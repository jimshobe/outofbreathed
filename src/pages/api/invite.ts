import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const ADMIN_UID = import.meta.env.PUBLIC_ADMIN_UID;

export const POST: APIRoute = async ({ request }) => {
  const { email, role, callerUid } = await request.json();

  if (!email || !role || callerUid !== ADMIN_UID) {
    return new Response(JSON.stringify({ error: 'Unauthorized or missing fields' }), { status: 403 });
  }

  if (!import.meta.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set');
    return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500 });
  }

  const resend = new Resend(import.meta.env.RESEND_API_KEY);
  const roleLabel = role === 'contributor'
    ? 'contributor (you can post and comment)'
    : 'member (you can comment on posts)';

  const { error: emailError } = await resend.emails.send({
    from: 'Jim Shobe <jim@outofbreathed.com>',
    to: email.trim().toLowerCase(),
    subject: "You're invited to outofbreathed.com",
    html: `
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
            <p style="margin:0 0 16px;font-size:1rem;line-height:1.6;">Hey,</p>
            <p style="margin:0 0 16px;font-size:1rem;line-height:1.6;">
              Jim has invited you to <strong>outofbreathed.com</strong> as a <strong>${roleLabel}</strong>.
            </p>
            <p style="margin:0 0 28px;font-size:1rem;line-height:1.6;">
              Just sign in with Google using this email address and you'll have access right away.
            </p>
            <a href="https://www.outofbreathed.com" style="display:inline-block;background:#c96a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:0.9rem;font-weight:500;">
              Visit the site →
            </a>
            <p style="margin:28px 0 0;font-size:0.82rem;color:#888;line-height:1.6;">
              Sign in with Google using the person icon at the top right. Make sure to use the account associated with this email address.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (emailError) {
    console.error('Resend error:', JSON.stringify(emailError));
    return new Response(JSON.stringify({ error: 'Email failed to send', detail: emailError }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
