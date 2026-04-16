// Cloudflare Pages Function — handles email signup
// POST /api/signup { email: "..." }
// 1) Sends welcome email via Resend
// 2) Logs signup to Google Sheet via Apps Script webhook

const ALLOWED_ORIGINS = [
  'https://tangency.ai',
  'https://www.tangency.ai',
  'https://staging.tangency-live.pages.dev',
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  // Allow Cloudflare Pages preview deploys (*.tangency-live.pages.dev)
  if (ALLOWED_ORIGINS.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.tangency-live\.pages\.dev$/.test(origin)) {
    return origin;
  }
  return 'https://tangency.ai'; // default — browser will block mismatched origins
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
  const corsOrigin = getCorsOrigin(context.request);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };

  try {
    const body = await context.request.json();
    const email = (body.email || '').trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400, headers,
      });
    }

    // Block disposable/junk patterns
    if (email.length > 254 || email.split('@')[0].length > 64) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400, headers,
      });
    }

    const RESEND_API_KEY = context.env.RESEND_API_KEY;
    const SHEET_WEBHOOK = context.env.SHEET_WEBHOOK;

    // Fire both requests in parallel
    const promises = [];

    // 1. Welcome email via Resend
    if (RESEND_API_KEY) {
      promises.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Tangency <noreply@tangency.ai>',
            to: [email],
            subject: "You're on the list — Tangency Early Access",
            html: welcomeEmailHTML(),
          }),
        }).then(r => r.ok ? 'email_sent' : r.text().then(t => { console.error('Resend error:', t); return 'email_failed'; }))
      );
    }

    // 2. Log to Google Sheet via Apps Script
    if (SHEET_WEBHOOK) {
      promises.push(
        fetch(SHEET_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ email, source: body.source || 'landing' }),
        }).then(r => r.ok ? 'sheet_logged' : 'sheet_failed')
          .catch(() => 'sheet_failed')
      );
    }

    await Promise.allSettled(promises);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers,
    });

  } catch (err) {
    console.error('Signup error:', err.message);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500, headers,
    });
  }
}

export async function onRequestOptions(context) {
  const corsOrigin = getCorsOrigin(context.request);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
  });
}

function welcomeEmailHTML() {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0B1120;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#F9FAFB;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111827;border-radius:12px;border:1px solid #1F2937;overflow:hidden;">

<tr><td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #1F2937;">
  <div style="font-size:24px;font-weight:700;color:#F9FAFB;letter-spacing:-0.02em;">tangency<span style="color:#3B82F6;">.</span>ai</div>
</td></tr>

<tr><td style="padding:32px;">
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#F9FAFB;line-height:1.3;">You're on the list.</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#9CA3AF;">
    Thanks for requesting early access to Tangency. We're onboarding founding members in waves — access is first-come, first-served.
  </p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#9CA3AF;">
    When your spot opens, you'll get an email with your invite link and founding member pricing details.
  </p>

  <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:20px;margin:24px 0;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#3B82F6;margin-bottom:12px;">What you'll get access to</div>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:4px 0;font-size:14px;color:#D1D5DB;">&#8226; AI-curated signals across 31+ tickers</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#D1D5DB;">&#8226; 10 timeframes scanned every 30 seconds</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#D1D5DB;">&#8226; Every score decomposed and explained</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#D1D5DB;">&#8226; 147 data points per ticker</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#D1D5DB;">&#8226; 8 independent analysis sources</td></tr>
    </table>
  </div>

  <p style="margin:0;font-size:13px;line-height:1.6;color:#6B7280;">
    In the meantime, follow us on <a href="https://x.com/tangencyai" style="color:#3B82F6;text-decoration:none;">X/Twitter</a> for updates.
  </p>
</td></tr>

<tr><td style="padding:24px 32px;border-top:1px solid #1F2937;text-align:center;">
  <p style="margin:0;font-size:12px;color:#4B5563;">
    &copy; 2026 Tangency. All rights reserved.<br>
    <a href="https://tangency.ai" style="color:#3B82F6;text-decoration:none;">tangency.ai</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}
