# Access Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global "Allow new users to sign up" switch with a per-person gate: a stranger asks at `/request-access`, Noel approves from an email, and a Supabase `Before User Created` auth hook checks an allowlist on every signup attempt.

**Architecture:** One migration carries a table and a `SECURITY DEFINER` hook function granted to `supabase_auth_admin`. One Edge Function carries three routes — request, a confirmation page, and the decision. The client gains one service, one signed-out page and two links. **No signed-in surface changes, no RLS policy changes, no store changes.**

**Tech Stack:** Postgres 17 + Supabase Auth Hooks, Deno Edge Functions, Resend, Angular 22 standalone + zoneless, NgRx SignalStore, Tailwind v4, Vitest via `@angular/build:unit-test`.

**Spec:** [`docs/ACCESS-PLAN.md`](../ACCESS-PLAN.md)

## Global Constraints

Copied from `AGENTS.md` and the spec. Every task is held to all of these.

- **No `any`.** TypeScript everywhere; types live in `src/app/core/models.ts`.
- **No `NgModule`, no `*ngIf` / `*ngFor`.** Built-in control flow (`@if`, `@for`) only.
- **`ChangeDetectionStrategy.OnPush`** without exception; `input()` / `output()` functions; `inject()` not constructor injection.
- **Templates live in a sibling `.html` file.** Never an inline `template:` — a single backtick inside one closes the literal and the compiler blames the wrong line.
- **No component stylesheets.** Utility classes only.
- **Semantic colour tokens only** — `bg-surface`, `bg-surface-raised`, `text-text`, `text-text-muted`, `border-border-strong`, `text-pen-text`. **`bg-white` is not a token and a new one is a bug.** Coral (`brand-*`) is a fill, never text.
- **Spacing is 1, 2, 3, 4, 6, 8 and nothing else.** No new fractional steps.
- **Type steps only**: `text-caption` `text-body` `text-task` `text-subtitle` `text-header` `text-display` `text-display-lg`. No `text-sm` / `text-base` / `text-lg`.
- **Radii**: `rounded-control` (6px), `rounded-card` (12px), `rounded-panel` (16px), `rounded-full`. Never `rounded-lg`.
- **`welcome.ts` keeps its type-scale exemption.** Do not extend it to the new page.
- **Never assert on a Tailwind class string** in a test. Assert on text, ARIA, state and calls.
- **`await` every interaction** in a spec. The app is zoneless.
- **Migrations are numbered and never edited once applied.**
- **RLS on every table, always.**
- **Noel's email address must never be committed.** The repo is public and AGPL-licensed.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0007_access_gate.sql` | `access_requests` table, `access_status` enum, `hook_gate_signup`, grants |
| `supabase/functions/access/core.ts` | Pure: normalization, token generation and hashing, outcome decision |
| `supabase/functions/access/core.test.mjs` | Node-runnable test for the above |
| `supabase/functions/access/index.ts` | `Deno.serve`, three routes, Resend calls |
| `supabase/config.toml` | `[functions.access] verify_jwt = false` |
| `src/app/core/models.ts` | `AccessOutcome` type |
| `src/app/core/access.helpers.ts` | Pure: `normalizeEmail`, `isNotApprovedError` |
| `src/app/core/access.helpers.spec.ts` | Tests for the above |
| `src/app/core/auth-error.ts` | `readSignupRejection` + the `signupRejection` signal |
| `src/app/core/auth-error.spec.ts` | Tests for the above |
| `src/app/core/access.ts` | `Access` service — the one outward `fetch` |
| `src/app/features/request-access/request-access.ts` / `.html` / `.spec.ts` | The page, five states |
| `src/main.ts` | Captures the OAuth rejection fragment before bootstrap |
| `src/app/app.routes.ts` | `/request-access` route |
| `src/app/features/welcome/welcome.html` | Request access action |
| `src/app/features/login/login.html` | "Don't have an account yet?" line |
| `src/app/core/session.store.ts` | Routes a rejected sign-in to `/request-access` |

**Three places normalize an email and they must agree.** The database is
authoritative: a `check (email = lower(btrim(email)))` constraint turns a
non-normalized write into a loud failure rather than a shadow row. The Edge
Function normalizes before writing, the hook normalizes before reading, and
the client normalizes only so the form echoes what was stored.

---

### Task 1: Migration — table and hook

**Files:**
- Create: `supabase/migrations/0007_access_gate.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.access_requests`, enum `public.access_status` with values `pending` / `approved` / `denied`, and `public.hook_gate_signup(event jsonb) returns jsonb`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_access_gate.sql`:

```sql
-- The access gate: signup becomes per-person instead of global.
--
-- Until now the only control was the Auth dashboard's "Allow new users to
-- sign up" — one switch, everyone or no one. This replaces it with an
-- allowlist consulted by a Before User Created auth hook, so the switch can
-- stay ON while the hook decides case by case. The hook runs inside GoTrue
-- before the auth.users insert and covers *every* provider, which is why it
-- is used rather than `shouldCreateUser: false` in the client: that flag
-- covers the magic-link path and leaves Google OAuth wide open.
--
-- See docs/ACCESS-PLAN.md.

create type public.access_status as enum ('pending', 'approved', 'denied');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),

  -- Stored lowercase and trimmed, and the constraint is the point. Google
  -- returns a lowercase address; a human typing into a form does not. If a
  -- row were stored as `Noel@x.com` the hook's lowercase lookup would miss
  -- it and an approved person would be rejected — a silent failure that
  -- fails *open* in the worst direction. The check turns that into an error
  -- at write time instead.
  email text not null unique check (email = lower(btrim(email))),

  note text check (note is null or length(note) <= 500),
  status public.access_status not null default 'pending',

  -- sha256 of the token in the approval email, never the token itself. A
  -- database leak must not hand someone the ability to approve accounts.
  -- Cleared once a decision is made, which is what makes it single-use.
  decision_token_hash text,
  token_expires_at timestamptz,

  requested_at timestamptz not null default now(),
  decided_at timestamptz,

  -- Abuse control only, for the per-IP throttle in the Edge Function.
  request_ip inet
);

create index access_requests_status_idx on public.access_requests (status);
create index access_requests_requested_at_idx on public.access_requests (requested_at);

-- RLS on with *no policies at all*, and that is deliberate rather than an
-- oversight. This table has no user_id — it exists before accounts do — so
-- there is no owner to check. Enabled-with-no-policies denies anon and
-- authenticated everything, which is exactly right: the only two things that
-- touch it are the Edge Function (service_role, which bypasses RLS) and the
-- hook below (security definer). Do not add a policy here.
alter table public.access_requests enable row level security;

-- The hook. Returns '{}' to allow the signup, or an error object to refuse it.
--
-- A third category of function for this project, and its grants are the
-- reason. The user-facing RPCs raise on a null auth.uid() and are revoked
-- from anon and public; the cron functions revoke from anon, authenticated
-- and public and grant to service_role. This one grants to
-- supabase_auth_admin — and like the cron functions, an auth.uid() guard
-- would only break it, because there is no session at the moment it runs.
--
-- security definer so it does not depend on whatever supabase_auth_admin
-- happens to be granted on the public schema, with search_path pinned to
-- match the seven functions already here.
create or replace function public.hook_gate_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_status public.access_status;
begin
  v_email := lower(btrim(event -> 'user' ->> 'email'));

  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'code', 'daybook_no_email',
        'message', 'An email address is required to sign up.'
      )
    );
  end if;

  select status into v_status
  from public.access_requests
  where email = v_email;

  if v_status = 'approved' then
    return '{}'::jsonb;
  end if;

  -- pending, denied and absent are all the same answer to the person trying
  -- to sign up. Which one it was is Noel's business, not theirs, and saying
  -- would let anyone test whether an address is on the list.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'code', 'daybook_not_approved',
      'message', 'This email has not been approved for Daybook yet.'
    )
  );
end;
$$;

grant execute on function public.hook_gate_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_gate_signup(jsonb) from authenticated, anon, public;
```

- [ ] **Step 2: Start a local stack and apply it**

Run:

```bash
supabase start
supabase db reset
```

Expected: migrations `0001` through `0007` apply with no error. If `supabase start` reports port conflicts, stop the running stack with `supabase stop` first.

- [ ] **Step 3: Prove the hook against crafted payloads**

The hook is tested by calling it directly with the payload shape GoTrue
sends. This is the same technique `0005` used with forged JWT claims — it
exercises the real function without needing GoTrue in the loop.

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" <<'SQL'
insert into public.access_requests (email, status) values
  ('approved@example.com', 'approved'),
  ('pending@example.com',  'pending'),
  ('denied@example.com',   'denied');

select 'approved'  as case, public.hook_gate_signup('{"user":{"email":"approved@example.com"}}'::jsonb);
select 'mixed case' as case, public.hook_gate_signup('{"user":{"email":"Approved@Example.COM"}}'::jsonb);
select 'whitespace' as case, public.hook_gate_signup('{"user":{"email":" approved@example.com "}}'::jsonb);
select 'pending'    as case, public.hook_gate_signup('{"user":{"email":"pending@example.com"}}'::jsonb);
select 'denied'     as case, public.hook_gate_signup('{"user":{"email":"denied@example.com"}}'::jsonb);
select 'absent'     as case, public.hook_gate_signup('{"user":{"email":"nobody@example.com"}}'::jsonb);
select 'no email'   as case, public.hook_gate_signup('{"user":{}}'::jsonb);
SQL
```

Expected: the first three return `{}`. `pending`, `denied` and `absent` all
return the `daybook_not_approved` error. `no email` returns
`daybook_no_email`.

**The mixed-case and whitespace rows are the cases that matter.** They are the
silent-open failure the check constraint and the `lower(btrim(...))` exist to
prevent. If either returns an error, the normalization is wrong — fix it
before moving on.

- [ ] **Step 4: Prove the constraint rejects a non-normalized write**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "insert into public.access_requests (email) values ('Mixed@Example.com');"
```

Expected: `ERROR: new row for relation "access_requests" violates check constraint`.

- [ ] **Step 5: Prove RLS denies the table to anon and authenticated**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" <<'SQL'
set role anon;
select count(*) from public.access_requests;
reset role;
set role authenticated;
select count(*) from public.access_requests;
reset role;
SQL
```

Expected: both return `0` rows (RLS with no policies denies everything), or a
permission error. **Neither may return 3.**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0007_access_gate.sql
git commit -m "feat: an allowlist and the signup hook that reads it"
```

---

### Task 2: Edge Function pure core

**Files:**
- Create: `supabase/functions/access/core.ts`
- Test: `supabase/functions/access/core.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeEmail(raw: string): string`
  - `isPlausibleEmail(email: string): boolean`
  - `newDecisionToken(): string`
  - `hashToken(token: string): Promise<string>`
  - `type AccessStatus = 'pending' | 'approved' | 'denied'`
  - `type AccessOutcome = 'created' | 'pending' | 'approved' | 'denied'`
  - `outcomeForStatus(status: AccessStatus | null): AccessOutcome`

Its own file rather than helpers inside `index.ts` for the reason `auth.ts`
gives: `index.ts` calls `Deno.serve` at module load and cannot be imported
from Node, so the tests could not reach these functions.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/access/core.test.mjs`:

```js
/**
 * Exercises the real helpers from core.ts — run it with
 * `node core.test.mjs` (Node 22+, which strips the types on import).
 *
 * Same arrangement as auth.test.mjs next door, and for the same reason:
 * index.ts calls Deno.serve at module load, so nothing in it is importable.
 */
import {
  normalizeEmail,
  isPlausibleEmail,
  newDecisionToken,
  hashToken,
  outcomeForStatus,
} from './core.ts';

let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(38)} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// normalizeEmail. The whole point is that a human's typing and Google's
// answer collapse to the same string — a mismatch here rejects someone who
// has been approved, which is the worst way for this feature to fail.
check('lowercases', normalizeEmail('Noel@Example.COM'), 'noel@example.com');
check('trims', normalizeEmail('  a@b.com  '), 'a@b.com');
check('both at once', normalizeEmail('  Mixed@Case.Com '), 'mixed@case.com');
check('empty stays empty', normalizeEmail(''), '');
check('whitespace only', normalizeEmail('   '), '');

check('plausible', isPlausibleEmail('a@b.co'), true);
check('no at sign', isPlausibleEmail('ab.co'), false);
check('no domain dot', isPlausibleEmail('a@b'), false);
check('empty', isPlausibleEmail(''), false);
check('spaces inside', isPlausibleEmail('a b@c.com'), false);

check('absent row means created', outcomeForStatus(null), 'created');
check('pending passes through', outcomeForStatus('pending'), 'pending');
check('approved passes through', outcomeForStatus('approved'), 'approved');
check('denied passes through', outcomeForStatus('denied'), 'denied');

// The token is what stands between an inbox and the ability to grant access.
const a = newDecisionToken();
const b = newDecisionToken();
check('token is long enough', a.length >= 32, true);
check('tokens differ', a === b, false);
check('token is url safe', /^[A-Za-z0-9_-]+$/.test(a), true);

const hashed = await hashToken('a-known-token');
check('hash is sha256 hex', /^[0-9a-f]{64}$/.test(hashed), true);
check('hash is stable', await hashToken('a-known-token'), hashed);
check('hash differs per input', (await hashToken('other')) === hashed, false);

console.log(failed === 0 ? `\nall passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node supabase/functions/access/core.test.mjs`

Expected: FAIL — `Cannot find module './core.ts'`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/access/core.ts`:

```ts
/**
 * The parts of `access` that are pure, so they can be tested from Node.
 *
 * index.ts calls `Deno.serve` at module load and cannot be imported, which is
 * the same reason notify/auth.ts and notify/webpush.ts exist as their own
 * files. Web Crypto is used rather than a Deno or Node API so this file runs
 * unchanged in both.
 */

export type AccessStatus = 'pending' | 'approved' | 'denied';

/** `created` is the fourth case: no row existed and one was just written. */
export type AccessOutcome = 'created' | AccessStatus;

/**
 * The single definition of what an email address is for this feature.
 *
 * The database enforces the same shape with
 * `check (email = lower(btrim(email)))`, and the hook applies
 * `lower(btrim(...))` when it reads. All three must agree or an approved
 * person is rejected by their own approval.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Deliberately not RFC 5322. A full validator rejects addresses that work and
 * accepts ones that do not; the only thing worth catching here is a typo bad
 * enough that no mail could ever arrive.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 32 bytes of CSPRNG, base64url. Long enough that guessing is not a threat. */
export function newDecisionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Only the hash is stored, so a leaked database cannot approve anybody. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function outcomeForStatus(status: AccessStatus | null): AccessOutcome {
  return status ?? 'created';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node supabase/functions/access/core.test.mjs`

Expected: `all passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/access/core.ts supabase/functions/access/core.test.mjs
git commit -m "feat: the pure half of the access function"
```

---

### Task 3: Edge Function — the request route

**Files:**
- Create: `supabase/functions/access/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: everything `core.ts` produces.
- Produces: `POST /access/request` accepting `{ email: string, note?: string }` and answering `{ outcome: AccessOutcome }`, or `{ error: string }` with a 4xx.

- [ ] **Step 1: Write the function**

Create `supabase/functions/access/index.ts`:

```ts
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

// The form is served from the app's own origin, which is not this one.
const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

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
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const { pathname } = new URL(req.url);

  if (req.method === 'POST' && pathname.endsWith('/request')) {
    return await handleRequest(req);
  }

  return json({ error: 'Not found' }, 404);
});
```

- [ ] **Step 2: Turn off `verify_jwt` for this function**

Append to `supabase/config.toml`:

```toml
# The /decide routes are clicked from an email client and carry no
# Authorization header. /request is a public form; the anon key would be no
# gate on it anyway, being shipped in the browser bundle. See
# docs/ACCESS-PLAN.md §7.
[functions.access]
verify_jwt = false
```

- [ ] **Step 3: Serve it locally and exercise the four outcomes**

Run, in one terminal:

```bash
supabase functions serve access --no-verify-jwt
```

And in another:

```bash
BASE=http://127.0.0.1:54321/functions/v1/access

# created
curl -s -X POST $BASE/request -H 'content-type: application/json' \
  -d '{"email":"New@Example.com","note":"I keep losing my todo list"}'

# pending — the same address again, normalized to the same row
curl -s -X POST $BASE/request -H 'content-type: application/json' \
  -d '{"email":"new@example.com"}'

# approved / denied, using the rows seeded in Task 1
curl -s -X POST $BASE/request -H 'content-type: application/json' \
  -d '{"email":"approved@example.com"}'
curl -s -X POST $BASE/request -H 'content-type: application/json' \
  -d '{"email":"denied@example.com"}'

# rejected before it reaches the database
curl -s -X POST $BASE/request -H 'content-type: application/json' -d '{"email":"nope"}'
```

Expected, in order: `{"outcome":"created"}`, `{"outcome":"pending"}`,
`{"outcome":"approved"}`, `{"outcome":"denied"}`, then
`{"error":"That does not look like an email address."}` with a 400.

**The second call is the one that matters** — `New@Example.com` and
`new@example.com` must land on the same row, proving normalization end to end.

- [ ] **Step 4: Confirm the row was written normalized**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select email, status, note, decision_token_hash is not null as has_token from public.access_requests where email = 'new@example.com';"
```

Expected: one row, `email` exactly `new@example.com`, `status` `pending`,
`has_token` true.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/access/index.ts supabase/config.toml
git commit -m "feat: somewhere for a stranger to ask"
```

---

### Task 4: Edge Function — the decide routes

**Files:**
- Modify: `supabase/functions/access/index.ts`

**Interfaces:**
- Consumes: `hashToken` from `core.ts`.
- Produces: `GET /access/decide?token=` returning an HTML page that mutates nothing; `POST /access/decide` accepting `{ token: string, decision: 'approve' | 'deny' }`.

- [ ] **Step 1: Add the two handlers**

In `supabase/functions/access/index.ts`, insert before `Deno.serve`:

```ts
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
```

- [ ] **Step 2: Route them**

In the `Deno.serve` handler, immediately after the `/request` branch:

```ts
  if (pathname.endsWith('/decide')) {
    if (req.method === 'GET') return await handleDecideGet(req);
    if (req.method === 'POST') return await handleDecidePost(req);
  }
```

- [ ] **Step 3: Exercise the approve path**

Run, taking the token from the function's own log output in the serve terminal
(or re-issue a request and read the emailed link):

```bash
BASE=http://127.0.0.1:54321/functions/v1/access
TOKEN=<the token from the link>

# GET must NOT decide anything
curl -s "$BASE/decide?token=$TOKEN" | grep -o 'Approve'
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select status from public.access_requests where email='new@example.com';"
```

Expected: the page contains `Approve`, **and the status is still `pending`.**
That is the anti-prefetch property; if the status changed on a GET, the
feature is broken in the way it was specifically designed not to be.

- [ ] **Step 4: Exercise the POST, then the replay**

```bash
curl -s -X POST "$BASE/decide" -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"decision\":\"approve\"}"

# the same token again
curl -s -X POST "$BASE/decide" -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"decision\":\"approve\"}"
```

Expected: the first says `Approved.`; the second says the link is no longer
valid. Confirm in SQL that `status` is `approved`, `decided_at` is set and
`decision_token_hash` is null.

- [ ] **Step 5: Confirm the hook now lets that address through**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select public.hook_gate_signup('{\"user\":{\"email\":\"new@example.com\"}}'::jsonb);"
```

Expected: `{}`. This is the first end-to-end proof — a request made through
HTTP, approved through HTTP, and honoured by the hook.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/access/index.ts
git commit -m "feat: approve or deny from an email, with a click to confirm"
```

---

### Task 5: Client — the access service

**Files:**
- Create: `src/app/core/access.helpers.ts`
- Create: `src/app/core/access.helpers.spec.ts`
- Create: `src/app/core/access.ts`
- Modify: `src/app/core/models.ts`

**Interfaces:**
- Consumes: `environment.supabaseUrl`, `environment.supabaseKey`.
- Produces:
  - `AccessOutcome` in `models.ts` — `'created' | 'pending' | 'approved' | 'denied'`
  - `normalizeEmail(raw: string): string`
  - `isNotApprovedError(error: { code?: string; message?: string } | null | undefined): boolean`
  - `class Access { request(email: string, note: string): Promise<AccessOutcome> }`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/access.helpers.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNotApprovedError, normalizeEmail } from './access.helpers';

describe('normalizeEmail', () => {
  it('lowercases and trims, so a typed address matches a stored one', () => {
    expect(normalizeEmail('  Noel@Example.COM ')).toBe('noel@example.com');
  });

  it('leaves an already-normal address alone', () => {
    expect(normalizeEmail('a@b.com')).toBe('a@b.com');
  });

  it('collapses whitespace-only input to empty', () => {
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('isNotApprovedError', () => {
  it('matches on the code the hook returns', () => {
    expect(isNotApprovedError({ code: 'daybook_not_approved' })).toBe(true);
  });

  // Whether `code` survives to the client is unverified — see
  // docs/ACCESS-PLAN.md §11. The message fallback is what makes this work
  // either way, and it is deleted once the real shape is known.
  it('falls back to the message when no code arrives', () => {
    expect(isNotApprovedError({ message: 'This email has not been approved for Daybook yet.' })).toBe(
      true,
    );
  });

  it('does not match an unrelated auth failure', () => {
    expect(isNotApprovedError({ message: 'Invalid login credentials' })).toBe(false);
  });

  it('does not match nothing', () => {
    expect(isNotApprovedError(null)).toBe(false);
    expect(isNotApprovedError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx ng test --watch=false`

Expected: FAIL — cannot resolve `./access.helpers`.

- [ ] **Step 3: Write the helpers**

Create `src/app/core/access.helpers.ts`:

```ts
/**
 * Pure helpers for the access gate. No injection, no clock — see AGENTS.md.
 */

/**
 * Must produce the same string as the database's
 * `check (email = lower(btrim(email)))` and the hook's `lower(btrim(...))`.
 * This copy is cosmetic — it only keeps the form echoing what was stored —
 * but if it drifts from the other two the mismatch is invisible here and
 * visible as an approved person being refused.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The sentinel `hook_gate_signup` returns when an address is not allowlisted. */
const NOT_APPROVED_CODE = 'daybook_not_approved';

/**
 * Whether a failed sign-in was the access gate rather than a real auth error.
 *
 * Checks the code first and the message second. Supabase documents an error
 * object carrying `code`, `message` and `http_code`, but its own example
 * shows only the latter two, and whether `code` survives GoTrue and auth-js
 * to reach here is unverified. Once it is confirmed one way or the other,
 * delete the branch that turns out to be dead — matching on prose pins
 * wording that will be edited.
 */
export function isNotApprovedError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === NOT_APPROVED_CODE) return true;
  return (error.message ?? '').toLowerCase().includes('has not been approved');
}
```

- [ ] **Step 4: Add the type**

Append to `src/app/core/models.ts`:

```ts
/**
 * What the access Edge Function says about an address it was given.
 * `created` means a row was just written; the rest are the status of a row
 * that already existed.
 */
export type AccessOutcome = 'created' | 'pending' | 'approved' | 'denied';
```

- [ ] **Step 5: Write the service**

Create `src/app/core/access.ts`:

```ts
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { AccessOutcome } from './models';
import { normalizeEmail } from './access.helpers';

/**
 * The one outward call the signed-out request form makes.
 *
 * A plain `fetch` rather than `functions.invoke`, because there is no
 * `functions.invoke` in this app and there must not be one: `core/supabase.ts`
 * composes auth-js and postgrest-js by hand instead of calling
 * `createClient()`, and `@supabase/functions-js` was measured at 2.85 kB and
 * dropped in Phase 8. Re-adding the package for a single call site would
 * reverse that for nothing.
 *
 * A service rather than a call from the component, because the URL, the
 * headers and the error mapping do not belong in a component class — and
 * because `render()` takes `providers`, so the page's states are testable
 * against a stub without teaching `FakeSupabase` about Edge Functions.
 *
 * Not a store: no shared state, nothing to load, nothing to roll back. Same
 * reasoning as `Nav` and `Theme`.
 */
@Injectable({ providedIn: 'root' })
export class Access {
  private readonly endpoint = `${environment.supabaseUrl.replace(/\/$/, '')}/functions/v1/access/request`;

  /**
   * Throws on a network or server failure, so the caller can toast and leave
   * the form as it was. A resolved promise always means the address is now
   * accounted for.
   */
  async request(email: string, note: string): Promise<AccessOutcome> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Not a credential here — `verify_jwt` is off for this function — but
        // sent so the request is attributed to this project in Supabase's
        // logs rather than arriving anonymous.
        apikey: environment.supabaseKey,
      },
      body: JSON.stringify({ email: normalizeEmail(email), note }),
    });

    const body = (await response.json().catch(() => null)) as
      | { outcome?: AccessOutcome; error?: string }
      | null;

    if (!response.ok || !body?.outcome) {
      throw new Error(body?.error ?? 'Could not send that request.');
    }

    return body.outcome;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx ng test --watch=false`

Expected: PASS, with the suite count up by 7 from its previous total.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/access.ts src/app/core/access.helpers.ts \
        src/app/core/access.helpers.spec.ts src/app/core/models.ts
git commit -m "feat: a service for asking to be let in"
```

---

### Task 6: Client — the request-access page

**Files:**
- Create: `src/app/features/request-access/request-access.ts`
- Create: `src/app/features/request-access/request-access.html`
- Create: `src/app/features/request-access/request-access.spec.ts`
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- Consumes: `Access.request`, `AccessOutcome`, `ToastStore.error`.
- Produces: the `RequestAccess` component and the `/request-access` route.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/request-access/request-access.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../testing/render';
import { Access } from '../../core/access';
import type { AccessOutcome } from '../../core/models';
import { RequestAccess } from './request-access';

function stub(outcome: AccessOutcome | Error) {
  const request = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { request, provider: { provide: Access, useValue: { request } } };
}

async function submit(outcome: AccessOutcome | Error, email = 'Someone@Example.com') {
  const { request, provider } = stub(outcome);
  const r = await render(RequestAccess, { providers: [provider] });

  const input = r.query('#email') as HTMLInputElement;
  input.value = email;
  input.dispatchEvent(new Event('input'));
  await r.settle();

  await r.click('button[type="submit"]');
  return { ...r, request };
}

describe('RequestAccess', () => {
  it('shows the form first', async () => {
    const { provider } = stub('created');
    const r = await render(RequestAccess, { providers: [provider] });
    expect(r.query('#email')).not.toBeNull();
  });

  it('normalizes the address before asking', async () => {
    const { request } = await submit('created');
    expect(request).toHaveBeenCalledWith('someone@example.com', '');
  });

  it('confirms a new request', async () => {
    const r = await submit('created');
    expect(r.el.textContent).toContain('be in touch');
    expect(r.query('#email')).toBeNull();
  });

  it('says a repeat request is already waiting', async () => {
    const r = await submit('pending');
    expect(r.el.textContent).toContain('waiting to be approved');
  });

  it('sends an approved address to sign in', async () => {
    const r = await submit('approved');
    expect(r.el.textContent).toContain('approved');
    expect(r.query('a[href="/login"]')).not.toBeNull();
  });

  it('tells a denied address the truth', async () => {
    const r = await submit('denied');
    expect(r.el.textContent).toContain("wasn't approved");
  });

  it('keeps the form when the call fails', async () => {
    const r = await submit(new Error('offline'));
    expect(r.query('#email')).not.toBeNull();
  });

  it('will not submit an empty address', async () => {
    const { provider, request } = stub('created');
    const r = await render(RequestAccess, { providers: [provider] });
    await r.click('button[type="submit"]');
    expect(request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx ng test --watch=false`

Expected: FAIL — cannot resolve `./request-access`.

- [ ] **Step 3: Write the component**

Create `src/app/features/request-access/request-access.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Access } from '../../core/access';
import { normalizeEmail } from '../../core/access.helpers';
import type { AccessOutcome } from '../../core/models';
import { ToastStore } from '../../core/toast.store';
import { Logo } from '../../shared/brand/logo';

/** The form, or whichever of the four answers came back. */
type View = 'form' | AccessOutcome;

@Component({
  selector: 'app-request-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Logo],
  templateUrl: './request-access.html',
})
export class RequestAccess {
  private readonly access = inject(Access);
  private readonly toast = inject(ToastStore);

  protected readonly email = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly view = signal<View>('form');

  protected async submit(): Promise<void> {
    const email = normalizeEmail(this.email());
    if (!email || this.busy()) return;

    this.busy.set(true);
    try {
      this.view.set(await this.access.request(email, this.note().trim()));
    } catch (error) {
      // The form stays exactly as it was, so nothing they typed is lost and
      // trying again is one click. A failure here is the network, not them.
      this.toast.error(error instanceof Error ? error.message : 'Could not send that request.');
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 4: Write the template**

Create `src/app/features/request-access/request-access.html`:

```html
<!--
  Asking to be let in. Signed out, so it sits outside the shell alongside
  /login and /welcome and wears the same paper: sunken desk, raised sheet.

  Deliberately the same lockup and the same sheet as /login, because a
  stranger bounced here from a refused sign-in should land somewhere that is
  obviously still Daybook rather than a form on a different site.

  This page is NOT covered by welcome.ts's type-scale exemption. Everything
  here is on the tokens.
-->
<div class="grid min-h-dvh place-items-center bg-surface-sunken p-6">
  <main class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="mb-4 flex justify-center font-display">
        <app-logo variant="lockup" tone="primary" [size]="56" />
      </h1>
      <p class="text-body text-text-muted">Daybook is invite-only for now.</p>
    </div>

    <div class="rounded-panel bg-surface-raised p-6 shadow-xl">
      @switch (view()) {
        @case ('form') {
          <form (ngSubmit)="submit()">
            <label class="mb-2 block text-body font-medium text-text-muted" for="email">
              Your email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-card border border-border-strong px-4 py-3 outline-none focus:border-pen-500 focus:ring-2 focus:ring-pen-tint-strong"
              [(ngModel)]="email"
            />

            <label class="mb-2 mt-4 block text-body font-medium text-text-muted" for="note">
              What would you use it for? <span class="text-text-subtle">Optional</span>
            </label>
            <textarea
              id="note"
              name="note"
              rows="3"
              maxlength="500"
              class="w-full resize-none rounded-card border border-border-strong px-4 py-3 outline-none focus:border-pen-500 focus:ring-2 focus:ring-pen-tint-strong"
              [(ngModel)]="note"
            ></textarea>

            <button
              type="submit"
              class="mt-4 w-full rounded-card bg-inverse px-4 py-3 font-medium text-on-inverse transition hover:bg-inverse-hover disabled:bg-fill-strong disabled:text-text-subtle disabled:hover:bg-fill-strong"
              [disabled]="busy() || !email()"
            >
              {{ busy() ? 'Sending...' : 'Request access' }}
            </button>
          </form>
        }

        @case ('created') {
          <div class="rounded-card bg-done-tint p-4 text-body text-on-done-tint">
            Thanks — your request is in. Noel will be in touch.
          </div>
        }

        @case ('pending') {
          <div class="rounded-card bg-pen-tint p-4 text-body text-on-pen-tint">
            You've already asked — your request is waiting to be approved.
          </div>
        }

        @case ('approved') {
          <div class="rounded-card bg-done-tint p-4 text-body text-on-done-tint">
            <p>You're approved — go ahead and sign in.</p>
            <a routerLink="/login" class="mt-2 inline-block font-medium underline underline-offset-4">
              Sign in
            </a>
          </div>
        }

        @case ('denied') {
          <div class="rounded-card bg-fill p-4 text-body text-text-muted">
            This request wasn't approved. Daybook is in a small private beta and access is limited
            right now.
          </div>
        }
      }
    </div>

    <p class="mt-6 text-center text-body">
      <a
        routerLink="/welcome"
        class="text-pen-text underline-offset-4 transition hover:text-pen-text-hover hover:underline"
      >
        What is Daybook?
      </a>
    </p>
  </main>
</div>
```

- [ ] **Step 5: Add the route**

In `src/app/app.routes.ts`, after the `login` route:

```ts
  {
    // Where a stranger asks, and where a refused sign-in lands. Guest-only
    // like its two siblings. Not preloaded: it is rare, and unreachable for
    // the signed-in user who would be doing the downloading.
    path: 'request-access',
    title: 'Request access',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/request-access/request-access').then((m) => m.RequestAccess),
  },
```

- [ ] **Step 6: Run the tests**

Run: `npx ng test --watch=false`

Expected: PASS, suite up by 8.

- [ ] **Step 7: Verify the tokens used actually exist**

`bg-fill`, `bg-pen-tint`, `on-pen-tint`, `focus:border-pen-500` and
`focus:ring-pen-tint-strong` must all be declared in `@theme` in
`src/styles.css`. **Only shades declared there exist** — an undeclared one
emits no CSS and fails silently.

Run:

```bash
grep -nE -- '--color-(fill|pen-tint|on-pen-tint|pen-500|pen-tint-strong|done-tint|on-done-tint|inverse|on-inverse|inverse-hover|fill-strong)' src/styles.css
```

Expected: every one is found. Substitute the nearest declared token for any
that is not, and note the substitution in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/request-access src/app/app.routes.ts
git commit -m "feat: a page for asking"
```

---

### Task 7: Client — the two links

**Files:**
- Modify: `src/app/features/welcome/welcome.html`
- Modify: `src/app/features/login/login.html`

**Interfaces:**
- Consumes: the `/request-access` route from Task 6.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the hero action on `/welcome`**

In `src/app/features/welcome/welcome.html`, in the hero's action row, after
the `See how it works` anchor:

```html
            <a
              routerLink="/request-access"
              class="rounded-card px-3 py-2 font-medium text-pen-text underline-offset-4 transition hover:underline"
            >
              Request access
            </a>
```

And replace the line beneath that row:

```html
          <p class="mt-4 text-body text-text-subtle">
            Invite-only for now. Already approved? Sign in with Google or an email link.
          </p>
```

**Sign in stays the primary action.** An approved visitor is indistinguishable
from a stranger until they try, so hiding sign-in behind "Request access"
would penalise exactly the people who already have access. Do not invert them.

- [ ] **Step 2: Add the closing-section link**

In the same file, after the closing section's `Start today's page` anchor:

```html
      <p class="mt-4 text-body text-text-subtle">
        Don't have an account yet?
        <a
          routerLink="/request-access"
          class="text-pen-text underline-offset-4 transition hover:underline"
        >
          Request access
        </a>
      </p>
```

- [ ] **Step 3: Add the line on `/login`**

In `src/app/features/login/login.html`, replace the closing paragraph:

```html
    <p class="mt-6 text-center text-body text-text-muted">
      Don't have an account yet?
      <a
        routerLink="/request-access"
        class="text-pen-text underline-offset-4 transition hover:text-pen-text-hover hover:underline"
      >
        Request access
      </a>
    </p>

    <p class="mt-3 text-center text-body">
      <a
        routerLink="/welcome"
        class="text-pen-text underline-offset-4 transition hover:text-pen-text-hover hover:underline"
      >
        What is Daybook?
      </a>
    </p>
```

- [ ] **Step 4: Run the tests and build**

Run:

```bash
npx ng test --watch=false
npx ng build
```

Expected: tests pass with no change in count; the build succeeds. Record the
initial bundle figure — it should move by well under a kilobyte, since the new
page is lazy.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/welcome/welcome.html src/app/features/login/login.html
git commit -m "feat: a way in from the front door and the sign-in sheet"
```

---

### Task 8: Client — routing a refused sign-in

**Files:**
- Create: `src/app/core/auth-error.ts`
- Create: `src/app/core/auth-error.spec.ts`
- Modify: `src/main.ts`
- Modify: `src/app/core/session.store.ts`
- Modify: `src/app/core/session.store.spec.ts`

**Interfaces:**
- Consumes: `isNotApprovedError` from Task 5.
- Produces: `readSignupRejection(hash: string): boolean`, and the `signupRejection` signal.

The OAuth fragment has to be read **before** `bootstrapApplication`, because
auth-js's `detectSessionInUrl` consumes and clears it inside its own
`initialize()`. Reading it later is a race that will pass locally and fail on
a slow connection.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/auth-error.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readSignupRejection } from './auth-error';

describe('readSignupRejection', () => {
  it('recognises the hook rejection in an OAuth fragment', () => {
    const hash =
      '#error=server_error&error_code=daybook_not_approved' +
      '&error_description=This%20email%20has%20not%20been%20approved%20for%20Daybook%20yet.';
    expect(readSignupRejection(hash)).toBe(true);
  });

  it('recognises it from the description alone', () => {
    expect(
      readSignupRejection('#error=server_error&error_description=This+email+has+not+been+approved'),
    ).toBe(true);
  });

  it('ignores an unrelated OAuth failure', () => {
    expect(readSignupRejection('#error=access_denied&error_description=User+cancelled')).toBe(false);
  });

  it('ignores a successful return carrying a token', () => {
    expect(readSignupRejection('#access_token=abc&token_type=bearer')).toBe(false);
  });

  it('ignores an empty hash', () => {
    expect(readSignupRejection('')).toBe(false);
    expect(readSignupRejection('#')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx ng test --watch=false`

Expected: FAIL — cannot resolve `./auth-error`.

- [ ] **Step 3: Write it**

Create `src/app/core/auth-error.ts`:

```ts
import { signal } from '@angular/core';
import { isNotApprovedError } from './access.helpers';

/**
 * Whether this page load is a bounce from a signup the gate refused.
 *
 * Set once, from `main.ts`, **before** `bootstrapApplication`. It has to be
 * read that early because auth-js's `detectSessionInUrl` consumes and clears
 * `location.hash` inside its own `initialize()`, which runs as soon as the
 * client is constructed. Reading it from a component or a store hook is a
 * race that passes on localhost and loses on a slow connection.
 */
export const signupRejection = signal(false);

/**
 * Parses an OAuth error fragment. Pure, so it can be tested without a
 * browser; `main.ts` hands it the real `location.hash`.
 *
 * GoTrue puts the hook's message in `error_description` and may or may not
 * put its code in `error_code` — see docs/ACCESS-PLAN.md §11. Both are
 * offered to `isNotApprovedError`, which knows how to recognise either.
 */
export function readSignupRejection(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.get('error')) return false;

  return isNotApprovedError({
    code: params.get('error_code') ?? undefined,
    message: params.get('error_description') ?? undefined,
  });
}
```

- [ ] **Step 4: Capture it at bootstrap**

In `src/main.ts`, before the `bootstrapApplication` call:

```ts
import { readSignupRejection, signupRejection } from './app/core/auth-error';

// Before bootstrap, and it must stay before it: auth-js clears the fragment
// during its own initialize(). See core/auth-error.ts.
signupRejection.set(readSignupRejection(location.hash));
```

- [ ] **Step 5: Route on it, and on the magic-link failure**

In `src/app/core/session.store.ts`, add to the imports:

```ts
import { isNotApprovedError } from './access.helpers';
import { signupRejection } from './auth-error';
```

Replace the error branch of `signInWithMagicLink`:

```ts
        if (error) {
          // The gate, not a real auth failure. We have the address because
          // they typed it here, so the request form opens prefilled and they
          // retype nothing.
          if (isNotApprovedError(error)) {
            void router.navigate(['/request-access'], { queryParams: { email } });
            return;
          }
          toast.error(error.message);
          return;
        }
```

`signInWithMagicLink` needs the router. Add it to the `withMethods` injection
list alongside `sb`, `toast` and `push`:

```ts
  withMethods(
    (
      store,
      sb = inject(Supabase),
      toast = inject(ToastStore),
      push = inject(Push),
      router = inject(Router),
    ) => {
```

Then in `withHooks`'s `onInit`, as the first statement:

```ts
      // A bounce back from Google, refused by the gate. There is no session
      // and no email in the fragment, so the form opens empty — see
      // docs/ACCESS-PLAN.md §4.4.
      if (signupRejection()) {
        signupRejection.set(false);
        void router.navigate(['/request-access']);
      }
```

- [ ] **Step 6: Read the prefilled address on the page**

In `src/app/features/request-access/request-access.ts`, add to the imports:

```ts
import { ActivatedRoute } from '@angular/router';
```

And in the class body, after the `view` signal:

```ts
  constructor() {
    const prefill = inject(ActivatedRoute).snapshot.queryParamMap.get('email');
    if (prefill) this.email.set(prefill);
  }
```

- [ ] **Step 7: Add the store specs**

Append to `src/app/core/session.store.spec.ts`, inside the existing
`signInWithMagicLink` describe block, following the `overrides()` pattern the
file already uses for `signInWithOtp`:

```ts
    it('sends a refused address to the request form, carrying it', async () => {
      overrides().signInWithOtp = async () => ({
        data: null,
        error: { message: 'This email has not been approved for Daybook yet.' },
      });

      await store.signInWithMagicLink('someone@example.com');

      expect(navigate).toHaveBeenCalledWith(['/request-access'], {
        queryParams: { email: 'someone@example.com' },
      });
      expect(toastError).not.toHaveBeenCalled();
    });

    it('still toasts an unrelated failure and does not navigate', async () => {
      overrides().signInWithOtp = async () => ({
        data: null,
        error: { message: 'Email rate limit exceeded' },
      });

      await store.signInWithMagicLink('someone@example.com');

      expect(navigate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalled();
    });
```

If the spec file does not already expose `navigate` and `toastError` spies,
add them as providers in its TestBed setup:

```ts
const navigate = vi.fn();
const toastError = vi.fn();
// providers: [
//   { provide: Router, useValue: { navigate } },
//   { provide: ToastStore, useValue: { error: toastError } },
// ]
```

- [ ] **Step 8: Run the tests**

Run: `npx ng test --watch=false`

Expected: PASS, suite up by 7.

- [ ] **Step 9: Commit**

```bash
git add src/app/core/auth-error.ts src/app/core/auth-error.spec.ts src/main.ts \
        src/app/core/session.store.ts src/app/core/session.store.spec.ts \
        src/app/features/request-access/request-access.ts
git commit -m "feat: send a refused sign-in somewhere useful"
```

---

### Task 9: Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `BUILD-PLAN.md`
- Modify: `docs/OPERATIONS.md`

**Interfaces:** none.

AGENTS.md says a change that contradicts it updates it in the same commit, and
BUILD-PLAN is the single source of truth for feature state. Two of these are
corrections of things that are now false.

- [ ] **Step 1: Add the third grant category to AGENTS.md**

In the **Database** section, after the cron-functions bullet:

```markdown
- **Auth hook functions are a third category**, locked down a third way.
  `hook_gate_signup` is called by GoTrue before a user row is inserted, so it
  grants execute to **`supabase_auth_admin`** and revokes it from `anon`,
  `authenticated` and `public`. Like the cron functions, **do not add an
  `auth.uid()` guard** — there is no session at the moment it runs, and one
  would only break it. It is registered in the Auth dashboard as
  `pg-functions://postgres/public/hook_gate_signup`; the function existing in
  a migration is not enough to make it run.
```

- [ ] **Step 2: Note the table's empty RLS**

In the same section, after the "RLS on every table, always" bullet:

```markdown
- **`access_requests` has RLS enabled and no policies, deliberately.** It has
  no `user_id` — it exists before accounts do — so there is nothing to own.
  Enabled-with-no-policies denies `anon` and `authenticated` everything, which
  is the intent: only the `access` Edge Function (service role) and
  `hook_gate_signup` (security definer) touch it. **Adding a policy here opens
  it.**
```

- [ ] **Step 3: Correct BUILD-PLAN §4's C5**

Replace the C5 paragraph with:

```markdown
**C5. Signup is gated per person, 19 Sep.** This item used to read "Signup is
already open… which means C1, C2 and blockers 1–3 are live bugs, not
hypotheticals." **That was wrong by the time anyone read it.** The Auth
dashboard's "Allow new users to sign up" was off — confirmed by screenshot on
19 Sep — so no stranger could create an account and none of those were live.
Nobody recorded the switch being flipped.

The switch has now been replaced by the access gate: an allowlist table and a
`Before User Created` auth hook, so the switch itself stays **on** while the
hook decides case by case. See [`docs/ACCESS-PLAN.md`](./docs/ACCESS-PLAN.md).
```

- [ ] **Step 4: Record the reversal in BUILD-PLAN §9**

Append to §9:

```markdown
### The access gate, 19 Sep

**The invite-only mechanism decided on 3 Sep is reversed, and the diagnosis
that chose it is not.** That entry said the mechanism must be the Auth
dashboard's "Allow new users to sign up" toggle rather than
`shouldCreateUser: false`, because the client flag covers the magic-link path
and leaves Google OAuth open. That reasoning still holds exactly. What
changed is that a better instrument exists: a **`Before User Created` auth
hook**, on the free tier, implemented as a Postgres function, which runs
inside GoTrue before the `auth.users` insert **on every provider**. It meets
the same requirement the toggle was chosen for, and unlike the toggle it can
say yes to one person and no to another.

So the toggle goes **on** and stays on. Turning it off would block approved
users too; the hook is the gate.

**A gate after authentication was considered and rejected.** Letting anyone
sign in and holding them in a `/pending` room is better UX — one Google click,
no email round trip — but a pending user holds a valid JWT with the
`authenticated` role, and every RLS policy here reads `auth.uid() = user_id`,
which such a user *passes*. Approval would have to be enforced in all four
policies, both user-facing RPCs, `push_subscriptions` and `due_digests()`, and
one miss is a hole that looks closed. That is the failure this section already
records once: the worst findings of the multi-tenancy audit were all in code
running outside RLS. It would also have landed on top of a Gate 1 two-account
pass that has never been run.

**The approval link in the email opens a page; it does not approve on load.**
A bare `GET` that grants access is one email-security scanner away from
approving people unattended.
```

- [ ] **Step 5: Add §5 feature state and §12**

In §5 Features, add a row recording the access gate as built. In §12 Known
gaps, add:

```markdown
- **Request and approval emails share Resend's 100/day with the digest,
  19 Sep.** The digest is one per user per day, so at roughly 90 users the
  digest alone approaches the cap and access emails start competing for what
  is left. Noise at beta volumes. The fix is a paid plan, not a code change,
  and it is already §4 item 6.

- **No eviction, 19 Sep.** `hook_gate_signup` runs only at account creation,
  so setting an existing user's row to `denied` does nothing — they already
  have an account. Removing someone is a dashboard delete. Real revocation
  means enforcing approval inside RLS, which is the after-auth design §9
  rejected.
```

- [ ] **Step 6: Record the manual steps in OPERATIONS.md**

Add a section:

```markdown
## The access gate

**Secrets** on the `access` Edge Function: `RESEND_API_KEY` (shared with
`notify`), `ACCESS_FROM` on the verified sending subdomain, `ACCESS_TO` —
where request notifications go — and `APP_ORIGIN`
(`https://daybook.noel-sebastian.com`).

**The hook must be registered in the dashboard.** Authentication → Hooks →
Before User Created → `pg-functions://postgres/public/hook_gate_signup`.
A migration creating the function does not make it run.

**Seed the owner's own address as approved**, so deleting and recreating the
account cannot lock anyone out of the app. This is a manual one-row insert,
not a migration — **the repo is public and no real address belongs in it**:

    insert into public.access_requests (email, status, decided_at)
    values (lower('<your address>'), 'approved', now());

**"Allow new users to sign up" must be ON.** The hook is the gate. With the
toggle off, approved users are refused too.
```

- [ ] **Step 7: Verify the Tailwind scan is unaffected**

Adding prose to Markdown files can change the stylesheet — this repo has been
bitten once, by `LICENSE`. Run:

```bash
npx ng build 2>&1 | tail -12
```

Expected: the `styles-*.css` hash is unchanged from the Task 7 build. **If it
moved, a class name has leaked out of the prose you just wrote** — find it
before committing, per BUILD-PLAN §13.

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md BUILD-PLAN.md docs/OPERATIONS.md
git commit -m "docs: the access gate, and two corrections it forced"
```

---

### Task 10: Deploy and prove it

**Files:** none. This task is the deployment order from `docs/ACCESS-PLAN.md` §2.

**Interfaces:** consumes everything above.

**Do these in order.** Out of order, there is a window in which signup is open
and the hook is not yet deciding.

- [ ] **Step 1: Apply the migration to production**

Apply `0007_access_gate.sql` to project `zzacswfongmzpnhcjiqp`, then confirm
the migration list ends with it and that `hook_gate_signup` exists with the
right grants:

```sql
select proname, proacl from pg_proc where proname = 'hook_gate_signup';
```

Expected: `supabase_auth_admin=X/postgres` present; no `anon`, `authenticated`
or `public` execute.

- [ ] **Step 2: Set the secrets and deploy the function**

Set `ACCESS_FROM`, `ACCESS_TO` and `APP_ORIGIN` as function secrets
(`RESEND_API_KEY` already exists), then deploy `access`. Confirm with a
request for a throwaway address and check that the email arrives.

- [ ] **Step 3: Register the hook**

Authentication → Hooks → Before User Created →
`pg-functions://postgres/public/hook_gate_signup`. Nothing observable changes:
every signup attempt is already failing at the toggle.

- [ ] **Step 4: Merge and deploy the client**

Open the PR, merge to `master`, and wait for Vercel to serve the new
`main-*.js`. **Wait on the specific expected hash**, not on the general
pattern — a loop matching `main-[A-Za-z0-9]+\.js` matches the old bundle too
and returns instantly with the wrong answer.

Walk `/request-access` on production and submit a real second address of
Noel's. Confirm the row, and the email.

- [ ] **Step 5: Approve it, then open the door**

Click through the approval email. Confirm the row goes `approved` and the
"you're in" email arrives.

**Only now** turn "Allow new users to sign up" ON.

- [ ] **Step 6: Prove both halves**

- The approved address signs in with **Google** and reaches `/today` with four
  seeded categories. **It must succeed.**
- A second, unapproved address attempts Google sign-in. **It must be refused**,
  and land on `/request-access`.

**Both halves are the test.** An allowlist that refuses everyone passes half
of it and is useless; one that admits everyone passes the other half and is
worse than useless.

- [ ] **Step 7: Record what the rejection actually looked like**

Note whether `error_code` carried `daybook_not_approved` or only
`error_description` arrived. Then delete the dead branch in
`isNotApprovedError` and its spec, and close item 2 in
`docs/ACCESS-PLAN.md` §11.

- [ ] **Step 8: Close Phase 7 Gate 1 while two accounts exist**

Two real accounts now exist on one device, which is the two-account pass Gate
1 has been waiting for since 3 Sep. Sign in as each in turn and confirm no
task, category, setting or push subscription from one appears under the other.
Update BUILD-PLAN §3's Phase 7 row and §4's Gate 1 with the result.

- [ ] **Step 9: Run the session handoff**

```
/session-handoff
```

---

## Self-Review

**Spec coverage.** §1 → Tasks 9, 10. §2 mechanism → Task 1; deployment order →
Task 10; alternatives → Task 9 §9. §3 three people → Tasks 1, 8, 10. §4.1
requesting → Tasks 3, 6; §4.2 approving → Task 4; §4.3 signing in → Task 10;
§4.4 rejection → Task 8. §5 data model → Task 1. §6 hook → Task 1, grants
documented in Task 9. §7 Edge Function → Tasks 2–4. §8 client → Tasks 5–8. §9
testing → distributed. §10 non-goals → Task 9 §12. §11 unknowns → Tasks 1, 10.
§12 Gate 1 → Task 10 Step 8. **No gaps.**

**Types.** `AccessOutcome` is `'created' | 'pending' | 'approved' | 'denied'`
in `core/models.ts` (Task 5) and structurally identical in `core.ts` (Task 2);
they are separate declarations because one runs in Deno and one in the
browser, and neither can import the other. `normalizeEmail` has the same
signature and behaviour in both, and the database's check constraint is what
keeps them honest. `isNotApprovedError` is used in Tasks 5 and 8 with the same
signature.

**Known rough edge, deliberately left.** `isNotApprovedError` carries a code
branch and a message branch because which one arrives is unverified. Task 10
Step 7 deletes the dead one. This is the only place in the plan where two
paths exist for one behaviour.
