/**
 * Daybook `access`: the request queue in front of signup.
 *
 * Three routes on one function rather than three functions, for the reason
 * notify gives for being one and not two — they share the client, the Resend
 * wiring and the failure handling, and none does enough work to deserve its
 * own cold start.
 *
 *   POST /request        a stranger asks
 *   GET  /decide?token=  the confirmation page Noel's email links to
 *   POST /decide         the decision itself
 *
 * `verify_jwt` is false for this function. The /decide routes are clicked
 * from an email client and carry no Authorization header, and leaving it on
 * for /request would gate it behind the anon key — which notify/auth.ts
 * already documents as "a token shipped in the public browser bundle", so no
 * gate at all. What actually protects these routes is the token for /decide
 * and the per-IP throttle for /request.
 *
 * Secrets: RESEND_API_KEY, ACCESS_FROM, ACCESS_TO, APP_ORIGIN.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  normalizeEmail,
  isPlausibleEmail,
  newDecisionToken,
  hashToken,
  outcomeForStatus,
  type AccessStatus,
} from './core.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** How long an approval link in an inbox stays live. */
const TOKEN_TTL_DAYS = 30;

/** Requests allowed from one IP per window. A form, not an API. */
const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_MINUTES = 60;

// The form is served from the app's own origin, which is not this one.
const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : null;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('ACCESS_FROM');
  if (!key || !from) {
    console.error('RESEND_API_KEY or ACCESS_FROM not set; mail skipped');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });

  // Logged rather than thrown. A request that was written but whose
  // notification failed is recoverable — the row is in the table and the
  // dashboard shows it. Throwing would tell the stranger their request
  // failed when it did not.
  if (!response.ok) {
    console.error('resend failed', response.status, await response.text());
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

async function handleRequest(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; note?: unknown }
    | null;

  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';

  if (!isPlausibleEmail(email)) {
    return json({ error: 'That does not look like an email address.' }, 400);
  }

  const ip = clientIp(req);

  if (ip) {
    const since = new Date(Date.now() - THROTTLE_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('request_ip', ip)
      .gte('requested_at', since);

    if ((count ?? 0) >= THROTTLE_MAX) {
      return json({ error: 'Too many requests. Try again later.' }, 429);
    }
  }

  const { data: existing } = await supabase
    .from('access_requests')
    .select('status')
    .eq('email', email)
    .maybeSingle();

  const outcome = outcomeForStatus((existing?.status as AccessStatus | undefined) ?? null);

  // Already known. Say so and send nothing — a second email for a request
  // already in the queue is noise, and re-notifying on every resubmission is
  // a way to be mailbombed by one persistent stranger.
  if (outcome !== 'created') return json({ outcome });

  const token = newDecisionToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString();

  const { error } = await supabase.from('access_requests').insert({
    email,
    note: note || null,
    decision_token_hash: await hashToken(token),
    token_expires_at: expires,
    request_ip: ip,
  });

  if (error) {
    // The unique index is the race: two submissions of the same address at
    // once. The second one loses, and "you already asked" is the truth.
    if (error.code === '23505') return json({ outcome: 'pending' });
    console.error('insert failed', error);
    return json({ error: 'Could not record that request.' }, 500);
  }

  const origin = Deno.env.get('SUPABASE_URL') ?? '';
  const link = `${origin}/functions/v1/access/decide?token=${encodeURIComponent(token)}`;
  const to = Deno.env.get('ACCESS_TO');

  if (to) {
    await sendMail(
      to,
      `Daybook: ${email} asked for access`,
      `<p><strong>${escapeHtml(email)}</strong> asked for access to Daybook.</p>` +
        (note ? `<p>They said: ${escapeHtml(note)}</p>` : '') +
        `<p><a href="${link}">Review this request</a></p>` +
        `<p style="color:#6b6353">The link opens a page with Approve and Deny. ` +
        `It expires in ${TOKEN_TTL_DAYS} days.</p>`,
    );
  }

  return json({ outcome: 'created' });
}

/**
 * The confirmation page. **This route mutates nothing, and that is the whole
 * reason it exists.** A bare GET link that grants access is one email-security
 * scanner or link-prefetcher away from approving people unattended, so the
 * link in the email is safe to fetch and the buttons below do the work.
 */
function decisionPage(token: string, email: string, note: string | null): Response {
  const safeToken = escapeHtml(token);
  return new Response(
    `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daybook access request</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #f7f5f0; color: #1f1b16;
         display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 24px; }
  main { background: #fffdf7; padding: 32px; border-radius: 16px; max-width: 32rem;
         box-shadow: 0 10px 30px rgb(0 0 0 / .08); }
  button { font: inherit; padding: 12px 24px; border-radius: 12px; border: 0;
           cursor: pointer; margin-right: 12px; }
  .approve { background: #1f1b16; color: #fffdf7; }
  .deny { background: transparent; color: #6b6353; border: 1px solid #d6cfc2; }
  .note { color: #6b6353; }
</style>
<main>
  <h1>Access request</h1>
  <p><strong>${escapeHtml(email)}</strong> asked for access to Daybook.</p>
  ${note ? `<p class="note">They said: ${escapeHtml(note)}</p>` : ''}
  <form method="POST">
    <input type="hidden" name="token" value="${safeToken}">
    <button class="approve" name="decision" value="approve" type="submit">Approve</button>
    <button class="deny" name="decision" value="deny" type="submit">Deny</button>
  </form>
</main>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

const plainPage = (message: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daybook</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f7f5f0;color:#1f1b16;
display:grid;place-items:center;min-height:100dvh;margin:0;padding:24px}</style>
<main><p>${escapeHtml(message)}</p></main>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

/** Looks a token up by its hash. Never compares the token itself. */
async function rowForToken(token: string) {
  const { data } = await supabase
    .from('access_requests')
    .select('id, email, note, status, token_expires_at')
    .eq('decision_token_hash', await hashToken(token))
    .maybeSingle();
  return data;
}

async function handleDecideGet(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const row = await rowForToken(token);

  if (!row) return plainPage('That link is no longer valid. It may already have been used.');
  if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
    return plainPage('That link has expired. Decide this one in the Supabase dashboard.');
  }
  return decisionPage(token, row.email as string, (row.note as string | null) ?? null);
}

async function handleDecidePost(req: Request): Promise<Response> {
  // The confirmation page posts a form, so both encodings are accepted.
  const type = req.headers.get('content-type') ?? '';
  let token = '';
  let decision = '';

  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as
      | { token?: unknown; decision?: unknown }
      | null;
    token = typeof body?.token === 'string' ? body.token : '';
    decision = typeof body?.decision === 'string' ? body.decision : '';
  } else {
    const form = await req.formData();
    token = String(form.get('token') ?? '');
    decision = String(form.get('decision') ?? '');
  }

  if (decision !== 'approve' && decision !== 'deny') return plainPage('Unknown decision.');

  const row = await rowForToken(token);
  if (!row) return plainPage('That link is no longer valid. It may already have been used.');
  if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
    return plainPage('That link has expired. Decide this one in the Supabase dashboard.');
  }

  const status = decision === 'approve' ? 'approved' : 'denied';

  // Clearing the hash is what makes the token single-use. The `is not null`
  // guard makes a double submission — two clicks, a retry — land on zero rows
  // rather than deciding twice.
  const { data: updated } = await supabase
    .from('access_requests')
    .update({ status, decided_at: new Date().toISOString(), decision_token_hash: null })
    .eq('id', row.id)
    .not('decision_token_hash', 'is', null)
    .select('email')
    .maybeSingle();

  if (!updated) return plainPage('That request has already been decided.');

  if (status === 'approved') {
    const appOrigin = Deno.env.get('APP_ORIGIN') ?? '';
    await sendMail(
      updated.email as string,
      "You're in — Daybook",
      `<p>You've been approved for Daybook.</p>` +
        `<p><a href="${appOrigin}/login">Sign in</a> with Google or an email link — ` +
        `either works, and the account is created the first time you do.</p>`,
    );
  }

  // Nothing is sent on a denial. They find out if and when they ask again.
  return plainPage(
    status === 'approved'
      ? `Approved. ${updated.email} has been emailed.`
      : `Denied. Nothing was sent to them.`,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const { pathname } = new URL(req.url);

  if (req.method === 'POST' && pathname.endsWith('/request')) {
    return await handleRequest(req);
  }

  if (pathname.endsWith('/decide')) {
    if (req.method === 'GET') return await handleDecideGet(req);
    if (req.method === 'POST') return await handleDecidePost(req);
  }

  return json({ error: 'Not found' }, 404);
});
