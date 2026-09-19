# Access gate

Signup is open to anyone who asks and is approved by hand. Strangers can find
Daybook, ask for access, and wait; nobody creates an account without Noel
saying yes.

Spec only. The implementation plan is a separate document —
`docs/plans/2026-09-19-access-gate.md` — and does not exist yet.

---

## 1. Why

`auth.users` holds one row. Nobody else has signed up because **nobody can**:
the Auth dashboard's "Allow new users to sign up" is **off**, confirmed by
screenshot on 19 Sep. C5 was closed at some point after 3 Sep and nobody wrote
it down.

So the door is already shut, and *that* is the problem. It is a single global
switch — everyone, or no one — and there is no position on it meaning "these
five people". Opening it for one person opens it to the internet; leaving it
closed means an account can only be created by hand in the dashboard.
**This work replaces the light switch with a lock and a key.**

**BUILD-PLAN §4's C5 is now wrong and must be corrected in the same commit.**
It still reads *"Signup is already open… Strangers can create accounts today,
which means C1, C2 and blockers 1–3 are live bugs, not hypotheticals."* They
are not live bugs; the switch is off. This is the drift AGENTS.md exists to
prevent, and it ran the other way for once — the docs claimed a hole that had
already been filled.

The binding cost is **not** Supabase. The free tier covers 50,000 monthly
active users. It is **Resend: 100 emails a day**, one digest per user per day,
so a hundred signed-up users with the digest on *is* the cap (§4, item 6). A
hundred strangers is not a hypothetical volume for a public URL.

The goal is therefore to bound the number of accounts, while still letting a
stranger who finds the app ask to be let in.

## 2. The mechanism, and what it reverses

**A Supabase `Before User Created` auth hook, implemented as a Postgres
function, checks every attempted signup against an allowlist table.**

The hook runs inside GoTrue immediately before the `auth.users` insert. Return
`{}` and the signup proceeds; return an `error` object and the user is never
created and the message is propagated to the client. It is on the **free
tier**, and Supabase's own documentation names this use case: *"Allow signups
only from specific domains… useful for private/internal apps, enterprise
gating, or invite-only beta access."*

**This reverses the mechanism decided on 3 Sep.** That decision said:

> The mechanism is the Auth dashboard's "Allow new users to sign up" toggle,
> not `shouldCreateUser: false` in the client: the client flag covers only the
> magic-link path and leaves Google OAuth open, which is the failure mode where
> you believe signup is closed and it is not.

The diagnosis was right and still is. The remedy is superseded: **the global
toggle stays ON**, because turning it off would block approved users too. The
hook is the gate, and it satisfies the same requirement the toggle was chosen
for — it is provider-agnostic, running on Google OAuth exactly as it runs on
magic link. Supabase's own second example for this hook blocks signups by
reading `user.app_metadata.provider`, which is only possible because OAuth
reaches it.

BUILD-PLAN §9 must record the reversal in the same commit that lands this.

### Deployment order

The toggle being off today is a gift: it means every part of this can ship and
be proven while the door stays shut, and **flipping the switch is the last
step, not the first**. Out of order, the window between "signup is open" and
"the hook works" is a window in which anyone on the internet can create an
account.

1. Migration `0007` applies — table, hook function, grants. Nothing is using it
   yet.
2. The hook is registered in the dashboard. It now runs on every signup
   attempt, and every attempt is already failing at the toggle, so this changes
   nothing observable.
3. The Edge Function deploys; the client ships. `/request-access` works and
   fills the table. Nobody can sign in yet, approved or not.
4. One row is approved by hand — Noel's own second address — and **only then**
   does "Allow new users to sign up" go ON.
5. That address signs up through Google. It must succeed. A second,
   unapproved address must be rejected. **Both halves are the test**; an
   allowlist that rejects everyone passes half of it.

Step 5 doubles as Phase 7's Gate 1 two-account pass, which has been unrun since
3 Sep. See §12.

### Alternatives rejected

- **`auth.admin.inviteUserByEmail()` with global signup off.** The first design.
  It works, but it drags in two unknowns — whether the admin API bypasses
  `disable_signup`, and whether an invited email-identity user can subsequently
  link a Google identity — and it forces approved users down the email path
  when they would rather click one Google button. The hook makes both questions
  disappear, because an approved user signs up normally, first time, through
  whichever provider they choose.
- **A gate after authentication** — anyone signs in, unapproved users land in a
  `/pending` waiting room. Better UX, much worse blast radius. A pending user
  holds a valid JWT with the `authenticated` role, and every RLS policy on this
  project reads `auth.uid() = user_id`, which such a user **passes**. Approval
  would have to be enforced in all four policies, both user-facing RPCs, the
  push table and `due_digests()`, and one miss is a hole that looks closed.
  That is the failure §9 already paid for: *"the three worst findings are all
  in code that runs outside RLS… audit the paths where RLS is not in the
  loop."* It would also land on top of a phase whose Gate 1 two-account pass
  has never been run.
- **A toggle on the login page.** What was originally proposed. It is the
  after-auth interface with none of the enforcement: Google OAuth does not ask
  the Angular app for permission, so the door would look shut while open.
- **No request form; invite by hand from the dashboard.** Cheapest and secure,
  but a stranger who finds the site has no way to ask, which is the whole
  requirement.
- **The request half as a Postgres RPC instead of an Edge Function.**
  Tempting, because `client.rpc()` already exists and `FakeSupabase` already
  fakes it. Rejected on two counts: it needs an `execute` grant to `anon`,
  which this project currently gives nowhere, and it pushes the Resend call
  into `pg_net` — fire-and-forget with no error visibility, which is the exact
  failure BUILD-PLAN already files against the cron (*"returns HTTP 200 while
  doing nothing"*) and defers to Gate 2. One blind notification path is enough.

## 3. The three people this has to serve

The app **cannot know who a visitor is before they authenticate**. There is no
session, no email, nothing. Every visitor sees the same `/welcome` and the same
`/login`. The three cases diverge only at the moment of the attempt:

| Who | What happens |
|---|---|
| Has an account | Signs in → `/today`. **The hook never runs** — no user is being created. Entirely unaffected. |
| Approved, never signed in | Signs in → hook finds an approved row → returns `{}` → account created, `ensure_user_setup` seeds as usual → `/today`. Feels like a normal signup. |
| Not approved | Attempts → hook rejects → no row is written anywhere → client redirects to `/request-access` with an explanation. |

This is why sign-in stays the prominent action on `/welcome`. Hiding it behind
"Request access" would punish precisely the people who already have access, for
the benefit of people who do not.

## 4. Flows

### 4.1 Requesting

1. `/welcome` gains a **Request access** action alongside the existing
   **Get started**. Both stay visible; neither is hidden behind the other.
2. `/request-access` is a new signed-out route under `guestGuard`, a sibling of
   `/login` and `/welcome`. Email, plus one optional line of "what would you use
   it for".
3. The form POSTs to the `access` Edge Function — **not** a direct insert. A
   direct insert needs an `anon` INSERT policy, which is a public write endpoint
   with no throttle. The function normalizes, deduplicates, rate-limits and
   sends the mail.
4. The response tells the client which of four states the email was in, and the
   page renders accordingly:

| State | Message | Side effect |
|---|---|---|
| Never seen | "Thanks — Noel will be in touch." | Row created. Noel emailed. |
| Pending | "You've already asked — your request is waiting to be approved." | **No second email to Noel.** |
| Approved | "You're approved — go ahead and sign in." + link to `/login`. | None. |
| Denied | "This request wasn't approved. Daybook is in a small private beta and access is limited right now." | None. |

The denied wording is deliberate: honest, attributes the outcome to capacity
rather than to the person, and gives nothing to argue with. Noel chose honesty
over the conventional white lie of showing denied requests as still pending.

An approved email and an email that already has an account are indistinguishable
from this form, and do not need to be — both are told to go and sign in.

### 4.2 Approving

1. Noel receives a Resend email: the address, the note, the time, and a link.
2. **The link opens a confirmation page. It does not decide on load.** A bare
   `GET` that grants access is one email-security scanner away from approving
   people unattended. The link is safe to fetch; the buttons on the page do the
   work via `POST`.
3. That page offers **Approve** and **Deny**. Either writes the decision and
   burns the token.
4. On approval the requester is emailed: "You're in — sign in at …". On denial
   nothing is sent; they find out if and when they ask again.

### 4.3 Signing in, after approval

Nothing special. They go to `/login` and use **Continue with Google** or the
email link, whichever they prefer. The hook finds their approved row, returns
`{}`, and the account is created through the ordinary path — same
`ensure_user_setup`, same four seeded categories, same everything downstream.
**No part of the signed-in application changes.**

### 4.4 Being rejected

The two paths bounce with different quality, and the difference is not fixable:

- **Email link.** The address was typed into our own form, so the client has it.
  Redirect to `/request-access` with the field prefilled.
- **Google.** The user leaves for Google, picks an account, and returns rejected.
  The error arrives in the URL fragment and **does not carry the email address**.
  Redirect to `/request-access` with an empty form. They have made a round trip
  for nothing and must type their address anyway.

This is made rare rather than fixed: `/login` carries a clear "Don't have an
account yet? Request access" line, so most strangers never click Google. The
rejection is the safety net, not the path.

**The client must key off a stable error code, not the error's prose.** A
rejected signup has to be distinguishable from a genuine auth failure, and
matching on a message string pins wording that will be edited.

## 5. Data model

One new table, `public.access_requests`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `email` | `text not null` | **Stored lowercase.** Unique index on the normalized value. |
| `note` | `text` | Optional, from the form. Length-capped. |
| `status` | enum `pending` / `approved` / `denied` | |
| `decision_token_hash` | `text` | sha256 of the token in the email. Cleared once used. |
| `token_expires_at` | `timestamptz` | |
| `requested_at` / `decided_at` | `timestamptz` | |
| `request_ip` | `inet` | Abuse control only. |

**Email normalization is load-bearing and is the likeliest bug in this design.**
Google returns a lowercase address; a human typing into a form does not. If the
hook's comparison and the stored value disagree, the failure is silent and
fails *open* in the worst direction — Noel approves `Noel@x.com`, the person
signs in as `noel@x.com`, the hook finds no row and rejects an approved user.
Normalize on write, index the normalized value, compare normalized in the hook.

### RLS

**RLS enabled, with zero policies.** The table has no `user_id` — it exists
before accounts do — so there is no owner to check. Enabled-with-no-policies
denies `anon` and `authenticated` everything, which is exactly right: the only
two things that touch this table are the Edge Function (service role, bypasses
RLS) and the hook (`SECURITY DEFINER`).

This satisfies AGENTS.md's *"RLS on every table, always"* but reads like an
oversight to anyone skimming the migration. **It gets a comment in the
migration saying it is deliberate.**

### Migration

`supabase/migrations/0007_access_gate.sql`. Numbered, never edited once
applied, per AGENTS.md.

**Noel's own email is not committed to this repo.** The repo is public and
AGPL-licensed, and §9 already established that no real account data ships in
it. Seeding his address as pre-approved — worth doing, so that deleting and
recreating his own account cannot lock him out of his own app — is a manual
one-row insert after the migration applies, recorded in `docs/OPERATIONS.md`.

## 6. The hook function

`public.hook_gate_signup(event jsonb) returns jsonb`, registered in the
dashboard as `pg-functions://postgres/public/hook_gate_signup`.

```
grant execute on function public.hook_gate_signup to supabase_auth_admin;
revoke execute on function public.hook_gate_signup from authenticated, anon, public;
```

**This is a third category of function for AGENTS.md.** The repo currently
documents two: user-facing RPCs that `raise exception` on a null `auth.uid()`
and are revoked from `anon` and `public`; and cron functions that revoke from
`anon`, `authenticated` **and** `public` and grant to `service_role` only. This
one grants to `supabase_auth_admin`, and — like the cron functions — **an
`auth.uid()` guard would only break it**, because there is no session at the
moment it runs. AGENTS.md's Database section gains a bullet.

`SECURITY DEFINER` with `search_path` pinned, matching the seven functions
already in the project. It reads `access_requests`; making it definer-owned
means it does not depend on whatever `supabase_auth_admin` happens to be
granted on the `public` schema.

### Failure mode

If the function throws rather than returning a value, GoTrue **fails closed** —
the signup is refused. The blast radius of a bug here is therefore "no new
accounts can be created", not "nobody can sign in": existing users never touch
this code path, because no user is being created for them. That is the right
direction to fail, and it means a hook bug is an inconvenience rather than an
outage. It also means a hook bug is invisible until someone tries to join.

## 7. The Edge Function

`supabase/functions/access/`, a sibling of `notify`. One function with three
routes rather than three functions, for the reason `notify` gives for being one
and not two: they share the client, the Resend wiring and the failure handling,
and none does enough work to deserve its own cold start.

| Route | Purpose |
|---|---|
| `POST /request` | Normalize, dedupe, throttle, insert, email Noel. Returns the state enum. |
| `GET /decide?token=…` | Returns a small HTML confirmation page. **Mutates nothing.** |
| `POST /decide` | Applies the decision, burns the token, emails the requester on approval. |

`verify_jwt = false` for this function in `supabase/config.toml`. The `/decide`
routes are clicked from an email client and carry no `Authorization` header.
Leaving it on for `/request` would gate it behind the anon key, which
`notify/auth.ts` already documents as *"a token shipped in the public browser
bundle"* — no gate at all. Security here is the token for `/decide` and the
throttle for `/request`.

**The decision token is stored hashed.** Random 32 bytes, base64url, sha256 in
the column, plaintext only in the email. A database leak must not hand someone
the ability to approve accounts. Single-use — cleared on decision — and
expiring, so a forgotten request in an old inbox is not a standing grant. If a
token expires, Noel can still flip the row in the dashboard.

Secrets are the ones that already exist: `RESEND_API_KEY` and a `FROM` address
on the verified sending subdomain established on 5 Sep.

### Throttling

Per-IP over a window, using `request_ip`. The dedupe by email stops the
honest double-submission; the throttle stops someone walking through a
generated address list. This is the *only* new unauthenticated surface in the
design, so it is where the abuse thinking belongs — and it is a much smaller
job than the app-wide rate limiting §4 deferred to Gate 2.

### Quota

Request and approval emails share Resend's 100/day with the digest. At beta
volumes this is noise, but it is the same bucket, and at ~90 users the digest
alone approaches the cap. Not a v1 problem; worth a line in §12 so it is not
rediscovered.

## 8. Client changes

Small, and none of them signed-in.

- **`app.routes.ts`** — `/request-access`, `canActivate: [guestGuard]`,
  `title: 'Request access'`, lazy, not preloaded (it is rare and unreachable
  for the user who would be downloading it).
- **`features/request-access/`** — `request-access.ts` + `.html`, standalone,
  `OnPush`, sibling template. Renders one of five states: the form, and the
  four outcomes in §4.1.
- **`features/welcome/welcome.html`** — a **Request access** action beside the
  existing CTA. Neither hidden.
- **`features/login/login.html`** — one quiet line under the form: *"Don't have
  an account yet? Request access."*
- **`core/session.store.ts`** — both sign-in methods learn to recognise the
  hook's rejection code and route to `/request-access`, carrying the typed
  email on the magic-link path. The OAuth path needs the error read out of the
  redirect fragment on return.

- **`core/access.ts`** — a small `providedIn: 'root'` service owning the one
  outward call, plus `access.helpers.ts` for the pure email normalization.

**There is no `functions.invoke` in this app and there must not be one.**
`core/supabase.ts` composes `auth-js` and `postgrest-js` by hand instead of
calling `createClient()`, and its `client` surface is exactly
`{ auth, from, rpc }`. `@supabase/functions-js` is not a dependency — it was
measured at 2.85 kB and dropped deliberately in Phase 8. The service therefore
calls the function with a plain `fetch` against
`${supabaseUrl}/functions/v1/access/request`. Re-adding the package for one
call site would reverse a deliberate decision for no gain.

A service rather than a direct call from the component, for three reasons: URL
construction, headers and error-shape mapping do not belong in a component
class; `render()` already accepts `providers`, so the page's five states are
testable against a stub with no extension to `FakeSupabase` (which fakes
`from` and `rpc` and knows nothing about Edge Functions); and it honours
AGENTS.md's "components do not talk to Supabase directly" without carving an
exception into it.

Not a store. There is no shared state, nothing to roll back and nothing to
load — the same reasoning that makes `Nav` and `Theme` plain services.

## 9. Testing

Per AGENTS.md: `FakeSupabase`, no network, `await` every interaction, assert on
text and ARIA rather than Tailwind classes.

- `request-access.spec.ts` — all five render states against a stub `Access`
  provided through `render()`'s `providers`, and that submitting calls it once
  with a **normalized** email.
- `access.helpers.spec.ts` — normalization, as a pure function: mixed case,
  surrounding whitespace, and the empty string.
- `session.store.spec.ts` — additions: a rejected magic-link sign-in routes to
  `/request-access` with the email; a rejected OAuth return routes there
  without one; an unrelated auth error still toasts and does **not** route.
- The hook is SQL and gets the treatment `0005` got: proved against a local
  stack via `supabase start` before it goes near production. The cases are
  approved / pending / denied / absent, and — the one that matters — **a
  mixed-case approved row matched by a lowercase Google address**.
- The Edge Function's pure pieces (token hashing, normalization, the state
  decision) go in their own module with a `.test.mjs`, following the
  `auth.ts` / `auth.test.mjs` arrangement, because `index.ts` calls
  `Deno.serve` at module load and cannot be imported from Node.

## 10. What this deliberately does not do

- **No eviction.** The hook runs only at account creation, so denying someone
  who already has an account does nothing. Removing a real user is a dashboard
  delete. Building revocation means the after-auth design and its blast radius.
- **No admin page.** Approval is an email and two buttons. An in-app admin
  surface needs an admin role, a route and its own RLS, for a queue that will
  hold single digits.
- **No double opt-in.** Someone can request access using an address that is not
  theirs. The harm is that Noel approves an address nobody reads. Not worth a
  confirmation round trip.
- **No cap.** Approval is manual, so the count is bounded by Noel's patience.

## 11. To verify during implementation

Named rather than assumed, because three of these are load-bearing:

1. **That the hook fires on the Google OAuth callback.** High confidence — the
   documented example blocks by `app_metadata.provider` — but it must be proven
   with a real unapproved Google account before this is called done.
2. **What reaches the client on each path.** The docs describe an error object
   with `code`, `message` and `http_code`, but the JSON example shows only the
   latter two. Whether `code` survives to supabase-js, and what the OAuth
   redirect fragment actually contains, decides how §4.4 is written.
3. That local `supabase start` can run an auth hook, so the SQL can be proved
   before it is applied.

**Resolved, 19 Sep:** "Allow new users to sign up" is **off**. It must be
**on** for this design to work — the hook is the gate, and the toggle blocks
approved users too. Flipping it is step 4 of the deployment order in §2, and
nothing before that step changes what a stranger can do.

## 12. Not in scope, but adjacent

Phase 7's Gate 1 — the two-account pass on one device — is still unrun, and
this feature is the thing that finally makes a second real account easy to
create. **Approving one person is the cheapest way to close Gate 1.** Worth
doing in the same stretch of work, but it is not part of this spec.
