/**
 * Daybook `access`: the request queue in front of signup.
 *
 * Three routes on one function rather than three functions, for the reason
 * notify gives for being one and not two — they share the client, the Resend
 * wiring and the failure handling, and none does enough work to deserve its
 * own cold start.
 *
 *   POST /request        a stranger asks
 *   POST /lookup         the app's /access/decide page asks what a token is for
 *   POST /decide         the decision itself
 *   GET  /decide?token=  links mailed before 3 Oct; redirects to the app page
 *
 * **No route here returns HTML, and none can.** Supabase rewrites `text/html`
 * from a function on `*.supabase.co` to `text/plain` behind
 * `content-security-policy: default-src 'none'; sandbox`, so the confirmation
 * page this function used to serve arrived as source code with a form that
 * could not submit. The page lives in the app now and talks JSON to this.
 *
 * `verify_jwt` is false for this function. Noel decides signed out — the
 * address the email goes to is not a Daybook account — and leaving it on for
 * /request would gate it behind the anon key, which notify/auth.ts already
 * documents as "a token shipped in the public browser bundle", so no gate at
 * all. What actually protects these routes is the token for /lookup and
 * /decide, and the per-IP throttle for /request.
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
  decisionLink,
  tokenState,
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
    return;
  }

  // Logged on success too, and that is not noise. Without it the happy path
  // and "ACCESS_TO was never set" produce byte-identical logs — nothing at
  // all — so a silently undelivered notification is indistinguishable from a
  // delivered one. That cost an hour on 19 Sep.
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  console.log('resend ok', body?.id ?? '(no id)', 'to', to);
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

async function handleRequest(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { email?: unknown; note?: unknown } | null;

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

  const link = decisionLink(Deno.env.get('APP_ORIGIN') ?? '', token);
  const to = Deno.env.get('ACCESS_TO');

  if (!to) {
    // Never silent. The request is safely in the table, but nobody has been
    // told about it, and that is worth shouting about in the logs.
    console.error('ACCESS_TO is not set; nobody was notified about', email);
  }

  if (to) {
    await sendMail(
      to,
      `Daybook: ${email} asked for access`,
      `<p><strong>${escapeHtml(email)}</strong> asked for access to Daybook.</p>` +
        (note ? `<p>They said: ${escapeHtml(note)}</p>` : '') +
        `<p><a href="${link}">Review this request</a></p>` +
        `<p style="color:#6b6353">The link opens a page with Approve and Deny. ` +
        `No sign-in needed — the link itself is the permission, and it works once. ` +
        `It expires in ${TOKEN_TTL_DAYS} days.</p>`,
    );
  }

  return json({ outcome: 'created' });
}

/** Looks a token up by its hash. Never compares the token itself. */
async function rowForToken(token: string) {
  if (!token) return null;
  const { data } = await supabase
    .from('access_requests')
    .select('id, email, note, token_expires_at')
    .eq('decision_token_hash', await hashToken(token))
    .maybeSingle();
  return data;
}

/** Both POST routes take a JSON body; anything else reads as empty. */
async function readBody(req: Request): Promise<{ token: string; decision: string }> {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
    decision?: unknown;
  } | null;
  return {
    token: typeof body?.token === 'string' ? body.token : '',
    decision: typeof body?.decision === 'string' ? body.decision : '',
  };
}

/**
 * What the app's page shows before anyone presses anything. **Mutates
 * nothing**, for the reason the page exists at all: a link that decides on
 * open is one email-security scanner away from approving people unattended.
 */
async function handleLookup(req: Request): Promise<Response> {
  const { token } = await readBody(req);
  const row = await rowForToken(token);
  const state = tokenState(row, new Date());
  if (state !== 'pending' || !row) return json({ state });
  return json({ state, email: row.email, note: row.note ?? null });
}

async function handleDecide(req: Request): Promise<Response> {
  const { token, decision } = await readBody(req);
  if (decision !== 'approve' && decision !== 'deny') {
    return json({ error: 'Unknown decision.' }, 400);
  }

  const row = await rowForToken(token);
  const state = tokenState(row, new Date());
  if (state !== 'pending' || !row) return json({ state });

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

  if (!updated) return json({ state: 'invalid' });

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
  return json({ state: status, email: updated.email });
}

/**
 * Links mailed before 3 Oct point here with the token in the query string.
 * A redirect is the one thing this domain can still do for them: it carries
 * no HTML, so Supabase leaves it alone.
 */
function handleLegacyDecide(req: Request): Response {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const appOrigin = Deno.env.get('APP_ORIGIN');
  if (!appOrigin) return json({ error: 'APP_ORIGIN is not set.' }, 500);
  return new Response(null, {
    status: 302,
    headers: { Location: decisionLink(appOrigin, token), ...cors },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const { pathname } = new URL(req.url);

  if (req.method === 'POST' && pathname.endsWith('/request')) {
    return await handleRequest(req);
  }

  if (req.method === 'POST' && pathname.endsWith('/lookup')) {
    return await handleLookup(req);
  }

  if (pathname.endsWith('/decide')) {
    if (req.method === 'GET') return handleLegacyDecide(req);
    if (req.method === 'POST') return await handleDecide(req);
  }

  return json({ error: 'Not found' }, 404);
});
