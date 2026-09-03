# Daybook: build plan

**This file is the single source of truth for Daybook.** Product definition,
data model, phase status, remaining work and the reasoning behind every locked
decision all live here.

The Notion page `Daily To-Do App - Project Spec` is the original brief and is
now historical. Where the two disagree, this file wins. Do not update Notion.

Related files:

- `AGENTS.md` for repo conventions (how to write code here)
- `docs/SESSIONS.md` for the chronological log (what happened when, and why)
- `supabase/migrations/` for the applied schema
- `README.md` for setup and the capture syntax

---

## 1. What it is

A personal daily to-do app, built because the existing ones do not fit the
workflow.

One page per day. Completed tasks are stamped with a time and kept. Unfinished
tasks carry forward to the next day automatically. Anything can be scheduled
ahead for a future date.

Personal project first. If it proves useful day to day it may be adapted into
something sellable to freelance clients. It is also a deliberate vehicle for
getting deeper into Angular Signals and NgRx SignalStore.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Angular 22.1.2, standalone components, zoneless |
| State | Signals locally, NgRx SignalStore (`22.0.0-rc.0`) for shared state |
| Styling | Tailwind v4 via `.postcssrc.json`, theme tokens in `src/styles.css` |
| Backend | Supabase: Postgres 17, Auth, later Storage and Edge Functions |
| Auth | Google OAuth (live), with an email magic link as fallback and recovery path |
| Delivery | Installable PWA via `@angular/pwa`. No native codebase |
| Date parsing | `chrono-node` |
| Hosting | Vercel, DNS on Cloudflare (not deployed yet) — see §9 |
| Email | Resend (live, digest delivered 21 and 22 Aug) |

Supabase project `daybook`, ref `zzacswfongmzpnhcjiqp`, region ap-southeast-2
(Sydney), free tier.

Free tier covers this comfortably: 50,000 monthly active users and built-in
Google OAuth at no extra cost. Free projects pause after 7 days of inactivity
and resume with no data loss. The org also hosts `sweep`, which takes the other
free active-project slot.

### Google OAuth configuration

Configured 17 Aug 2026 and confirmed working end to end.

| Setting | Value |
|---|---|
| Google Cloud project | `Daybook` / `daybook-505822`, no organisation |
| Consent screen app name | Daybook |
| Audience | External, **published to Production** |
| Support and contact email | noelsimc69@gmail.com |
| Client type | Web application, named `Daybook Web` |
| Authorised redirect URI | `https://zzacswfongmzpnhcjiqp.supabase.co/auth/v1/callback` |
| Authorised JavaScript origins | none |
| Scopes | email, profile, openid |

Three things worth not relearning:

- **The Supabase callback is the only redirect URI Google needs.** Not
  localhost, not the production URL. Google always returns to Supabase, and
  Supabase redirects on to the app afterwards.
- **No JavaScript origins.** Supabase does a full-page redirect, so no browser
  origin ever calls Google directly. Origins are only needed if Google One Tap
  gets added later.
- **Published to Production deliberately.** Testing mode expires refresh tokens
  after 7 days, which would mean re-signing in on the phone every week.
  Publishing needs no verification review because none of the three scopes are
  sensitive or restricted.

**A new OAuth client is never needed again.** One consent screen per project is
a hard Google limit, but client IDs under it are unlimited. Deploying to
Netlify needs no console change at all: only the Supabase redirect allow list
gains the production URL.

Supabase auth config: Site URL `http://localhost:4200`, redirect allow list
contains `http://localhost:4200/**`. The wildcard is load-bearing, since
`login.ts` passes `redirectTo: location.origin + '/today'` and Supabase
silently rejects anything not on the list.

---

## 3. Phase status

| Phase | Scope | State |
|---|---|---|
| 1 | Auth, data model, session store, guard, create-and-save | **done** |
| 2 | Today view, natural language capture, rollover, PWA shell | **done, verified** — this cell read "unverified by a human" until 22 Aug while the prose below it already said the loop was closed; the shell has since been installed on an iPhone too |
| 3 | Date picker, task-as-object view transitions, floating composer, nav shell, swipe, completion choreography | **done, verified on screen** — 7 of 7. **Swipe verified on an iPhone 22 Aug**, which found two defects (§9); its four constants were judged good enough by Noel on 25 Aug |
| 4 | Calendar, history drill-in, category filter, offline queue | **done, verified on screen**; offline queue untested |
| 5 | Settings, email digest, weekly review, Web Push reminders | **done and fully verified, 22 Aug** — cron scheduled, digest delivered to a real inbox on both branches, push delivered to an installed iPhone PWA |
| 6 | Hero, empty-state illustrations, charts, visual polish | **done, 21 Aug** — all five items; illustrations are hand-drawn SVG, not AI raster (§9) |
| 7 | Multi-tenancy: many users, isolated, simultaneous | **audited 3 Sep, not started** — the table layer already holds up unmodified; five hard blockers, every one of them downstream of `service_role`. §4 |

Phases are deliberately not time-based. Each one is picked up whenever there is
a spare hour.

Phase 3 sits ahead of history on purpose. It is the differentiator, and the app
is useful without a history view. Phase 4 sits where it does because a calendar
needs a few weeks of real data before it is worth looking at. Phase 5's three
items are built together because they share one cron plus Edge Function.

**Phase 2 is nearly verified.** Google sign-in works end to end and
`ensure_user_setup` seeds the four default categories on first login, both
confirmed by hand on 17 Aug. Every rollover path was proven against the live
database with a seeded auth user and forged JWT claims. Adding a task through
the capture box was confirmed on 18 Aug.

**A real overnight rollover has now happened in normal use.** On 19 Aug the app
was opened for the first time since the previous day and rolled itself over
unattended: `day_snapshots` holds a row for 18 Aug (`completed_count` 0,
`carried_count` 1, `carried_task_ids` naming `call physio`), and that task moved
to 19 Aug with `carried_over_count` 1. Nobody was watching the screen, so the
carried badge itself is still unseen. What is left: completing a task, and
watching one rollover happen.

**The multi-day gap has since run too, and it was correct.** By 21 Aug the app
had been opened again after two missed days: `day_snapshots` gained rows for
both 19 and 20 Aug, and `call physio` and `call doctor` landed on 21 Aug with
`carried_over_count` 3 and 2 — incremented by the number of days skipped, not
by one. That is `daybook_carry_count_by_days_not_opens` proven against a real
gap. Nobody watched this one either.

**Phases 3, 4 and 5 have now been clicked through, signed in, against live
data.** All seven pages were opened in order on 21 Aug with the console open.
The sign-in wall that blocked the agent that wrote them was not there on the
second attempt — the dev server was already running with a live session.

**The task loop is closed.** Completing a task was watched happening: green
check, animated strike, `done 20:11`, and the header moving `2 to go` →
`1 to go` + `1 done today` → `All clear`. The completed row visibly re-sorted
below the incomplete one, which is the View Transition in §9 working as
designed. Un-completing restores the row and clears `completed_at`. **The
carried badge renders** — `carried ×3` and `carried ×2`, the exact numbers
predicted above. Nothing in the loop is unseen any more.

One real bug came out of the pass and is fixed: the Settings timezone select
rendered `America/Los_Angeles` while the stored zone was `Australia/Sydney`.
See §9. Two smaller things are open rather than fixed — a duplicated
`ensure_user_setup` call on every load, and a rollover failure seen once and
never reproduced. Both are in §12.

What is still unverified by a person: **the offline queue, and only that.** Web
Push was delivered to an installed iPhone on 22 Aug, and swipe was used on a
real thumb the same day — it found two defects that no desktop pass could have
(§9), which is the argument for the device pass rather than a footnote about
one gesture. The swipe *distances* were called fine by Noel on 25 Aug —
still unmeasured against a reference, but no longer an open question.

---

## 4. Remaining work, in the order it should be done

### 0. Verify the task loop by hand — **done, 21 Aug**

Every step of the loop has now been seen working:

- **Sign-in** — 17 Aug.
- **Capture** — 18 Aug. A task with a date and a `#tag` parsed, chipped and
  landed on the right day. Re-confirmed 21 Aug through the floating composer,
  with live token highlighting.
- **Rollover** — ran unattended on 19 Aug, and across a two-day gap by 21 Aug,
  both writing correct data. Still never *watched* happening, because it fires
  before the first paint. Reading it out of `day_snapshots` is the only
  practical check and it has passed twice.
- **Completion** — watched, 21 Aug. Timestamp, strike, header count, and the
  re-sort below the incomplete rows.
- **The carried badge** — seen on screen, 21 Aug, at ×3 and ×2.

Everything below assumes the loop works, and it now does.

### Phase 3, the differentiator

Ordered. Each item below is a prerequisite for the ones under it more often
than not, and the order was set on 18 Aug against the Todoist captures.

1. **Confirm that a task was added.** **Done, 18 Aug.**
   `TaskStore.addFromCapture` now toasts `Added to <day>.` with an Undo that
   deletes the task. The day is worded by `sentenceDate` — "today",
   "tomorrow", otherwise "Friday 21 Aug". Auto-expanding the Upcoming strip was
   considered and rejected because it moves the page under the cursor
   mid-typing. The `Open` action still waits for the `/today/:id` route below.
   Verified by hand: a task typed as `friday` toasted "Added to Friday 21 Aug."
   and the Undo on a later one removed the row from the database, not just the
   list.
2. **Date picker.** **Done, 18 Aug**, in `shared/date-picker.ts`. The date chip
   in capture is a button that opens it: a shortcut row with each option's
   resolved day printed beside it (Today, Tomorrow, This weekend, Next week —
   Mon 24 Aug) above a month grid, plus a time field writing `reminder_at`. No
   "No Date", no "Repeat" — see §9. Built before the edit UI on purpose,
   because one picker then serves capture, edit and reschedule-from-a-row; the
   latter two are wired up in item 3. **Not yet used by a person.**
3. **Task-as-object and inline edit.** **Built, 21 Aug**, in
   `features/today/task-detail.ts` at `/today/:id`. A sibling route, not a
   child, so the list unmounts and `view-transition-name: task-{id}` stays
   unique. Edit is the same `Capture` component, seeded by `toCaptureText`
   with the task's `#tag` and `!energy` spelled back out and its day held in
   the picker. Delete lives here, with an Undo that reinserts under the same
   id. Row text is now a link.
4. **Floating composer.** **Built, 21 Aug**, `features/today/composer.ts`.
   Anchored to the bottom of the viewport at every width, opened by `Add task`,
   with explicit Cancel and Add. Its `day` input presets the date chip, which
   is what Upcoming's per-day add rows use. Replaced the Magic Plus FAB — §10.
5. **Nav shell.** **Built, 21 Aug**, `shared/shell.ts`, as a layout route so
   the drawer mounts once. Four destinations, not three: Today / Upcoming /
   Calendar / Reporting, with Settings and Sign out pinned below. Calendar was
   promoted to top level — see §9. Button only, no edge swipe.
6. **Completion choreography.** **Built, 21 Aug.** The row-leave is not
   hand-animated: every row already carries a `view-transition-name`, so
   `core/view-transition.ts` runs the state change inside
   `document.startViewTransition()` and the browser FLIPs every row that moved,
   closing the gap for free. The strike is an animated background line, because
   `text-decoration` cannot be animated from nothing to full width.
7. **Swipe gestures.** **Built 21 Aug**, `shared/swipe.ts`; **verified on an
   iPhone 22 Aug.** Right completes, left reschedules, touch pointers only,
   and disabled outright on a finished row. Fires on release, not on crossing
   the threshold, so a gesture can be backed out of. The device pass found two
   defects — a judder caused by the row's own CSS transition, and a left swipe
   that promised an action it never performed — both fixed, both in §9. **The
   four timing constants at the top of that file remain reasoned rather than
   measured, and Noel called them fine on 25 Aug** after using the gesture —
   good enough to stop treating as open, not good enough to call tuned.

**6 and 7 were unblocked rather than waited on.** The plan held both for
Todoist **iOS** captures that were never taken. 6 turned out not to need them:
View Transitions decide the motion, not a chosen duration. 7 no longer needs
them either: the constants were judged by use on 25 Aug rather than against a
reference. `docs/reference/todoist/NOTES.md`.

### Phase 4, history — **built 21 Aug**

- **Bidirectional calendar.** `features/calendar/calendar.ts`. Past cells are a
  four-step green heat map from `day_snapshots.completed_count`, future cells
  carry a scheduled count, today is ringed. A red dot marks a day something was
  carried off; a hairline marks a day with **no snapshot row at all**, which is
  a day the app was never opened and is not the same as a day with nothing
  done. Cells link to `/calendar/:date`.
- **History drill-in.** `features/calendar/day-detail.ts`. A past day shows two
  lists from two sources: what was finished (tasks still dated that day, since
  completing pins `scheduled_date`) and what was carried off (resolved from
  `day_snapshots.carried_task_ids`, each naming the day it landed on).
- **Filter Today by category.** Chips on a second row under the energy filter,
  ANDed with it, listing only categories present today.
- **Offline write queue.** `core/offline-queue.ts`, persisted to
  `localStorage`. A dropped connection is told apart from a server rejection by
  `isOffline()` — the first queues and keeps the optimistic state, the second
  rolls back. Replays on `online`, on `visibilitychange`, and once at startup
  **before** rollover. `applyWrites` layers the queue back over a fresh load so
  opening offline does not look like the last session vanished.

### Phase 5, the loop that runs without you — **built 21 Aug**

- **Settings page.** `features/settings/settings.ts` and
  `core/settings.store.ts`. Digest on/off and send time, timezone, category
  rename/recolour/delete, push toggle. `user_settings.timezone` finally has a
  reader.
- **Digest Edge Function.** `supabase/functions/notify`, deployed and live.
  Both halves report why they are idle rather than throwing when a secret is
  missing. **Proven end to end on 21 Aug**: Resend account created,
  `RESEND_API_KEY` and `DIGEST_FROM` set as secrets, and a hand invocation
  delivered a correct digest to Noel's Gmail inbox — not spam. Callable by the
  service role only, see §9.
- **`pg_cron` schedule** driving digest and reminders off the same function.
  `pg_cron` and `pg_net` are enabled as of migration `0004_cron_extensions`.
  The schedule itself, `supabase/cron/schedule-notify.sql`, is **still not
  applied** — it carries the service role key in its command text and must be
  run by hand.
- **Web Push subscription flow** into `user_settings.push_subscription`.
  `core/push.ts` subscribes through `SwPush`; it refuses to offer the toggle
  and says why when the app is not installed, when the service worker is off
  (every dev build), or when no VAPID key is configured — an installed PWA on
  iOS 16.4+ is the only case that works. Sending is
  `supabase/functions/notify/webpush.ts`, RFC 8291 + 8292 written on Web Crypto
  because `web-push` will not run on Deno. **`webpush.test.mjs` round-trips the
  encryption and verifies the VAPID signature, 13 checks passing**, so the
  crypto is proven; the wire format is not, because no real subscription
  existed. **Keys are done as of 21 Aug** — pair generated, public half in both
  `environment*.ts`, all three secrets set. What remains is the cron and a real
  device: an installed PWA over HTTPS is the only way to prove the wire format.
- **Weekly review.** **Built**, `features/reporting/reporting.ts`. Done this
  week against last, open count, a 14-day completion bar chart, and the two
  lists that answer "what do I keep avoiding" — carried over most, pushed most,
  from the two separate counts §5 feature 10 exists for. One series, so no
  legend; green because it is completions, the one chart entitled to it. Days
  with no snapshot draw a hairline rather than a zero bar.

### Phase 6, polish — **built 21 Aug**

- ~~**Real app icons.**~~ **Done.** `public/icon.svg` is the master: yesterday's
  page behind today's, with a tick. `tools/build-icons.mjs` rasterises it to
  the eight manifest sizes, `favicon.ico` and the apple-touch-icon, using
  headless Chrome — there is no rsvg/ImageMagick/sharp on the machine and
  eight one-off PNGs did not justify a native dependency. Re-run it whenever
  `icon.svg` changes.
- ~~Hero and marketing view.~~ **Done**, `/welcome`. The hero performs the
  carry-over rather than describing it. `authGuard` now sends signed-out
  visitors here instead of straight to `/login`; see §9.
- ~~AI-generated empty-state illustrations.~~ **Done as hand-drawn SVG**,
  `shared/empty-state.ts`, four scenes. See §9 for why not raster.
- ~~Weekly bar chart of tasks completed per day.~~ **Was already done** — it
  shipped early as the Reporting fortnight chart (§5 feature 14), because the
  weekly review needed it. Nothing was built for this line.
- ~~**Accessibility pass.**~~ **Done**, and it found four real defects rather
  than nits. All four are recorded in §9.

### Next up — design tokens, code quality, test coverage

Agreed 25 Aug as the next major body of work, ahead of both the visual pass and
multi-tenancy.

- ~~**Design tokens.**~~ **Done 25 Aug**, adapted from Doist's published token
  package (§9). Declared in `@theme` in `src/styles.css`, rules in `AGENTS.md`:
  spacing restricted to 1/2/3/4/6/8 with one named 2px alignment exception;
  three semantic radii (`control` 6, `card` 12, `panel` 16) replacing the five
  that were in play; six role-named type steps in `rem`; three font weights.
  **Radius is migrated app-wide** — a value-preserving rename except an 8px→6px
  fold on small controls — so "only three radii exist" is a true statement.
  **Type is now migrated app-wide too, 26 Aug.** Every signed-in surface is on
  the steps; `text-sm`, `text-xs`, `text-base`, `text-lg`, `text-xl` and the
  arbitrary sizes are gone. The scale grew a seventh step, `text-display-lg`
  at 30px, because three real sites had nothing to land on (§9). Every step now
  has call sites. `welcome.ts` is exempt and is the only file that is (§9).
- ~~**Load a typeface.**~~ **Closed 25 Aug, the other way.** Inter is not
  fetched; `--font-sans` now names the system stack it was always really
  rendering (§9, §12).
- **Code quality.** No specific list yet. `core/task.store.ts` at 655 lines,
  `features/today/capture.ts` at 550 and `features/welcome/welcome.ts` at 511
  are the three obvious candidates. **Corrected 3 Sep** — this said capture and
  welcome were "roughly double anything else in the repo", which stopped being
  true when the store outgrew both.
- **Test coverage.** 55 tests across 4 files, against ~6,300 lines of source.
  **Corrected 3 Sep: this said "the stores and `parse-capture` carry most of
  it". The stores carry none of it.** The four spec files are `dates` (12),
  `install` (13), `offline-queue` (7) and `parse-capture` (23); there is no
  `session.store.spec.ts`, no `task.store.spec.ts`, no
  `settings.store.spec.ts` and no `auth.guard.spec.ts`. Every client-side
  tenant-isolation guarantee — `loadedFor`, `setupRanFor`, the guard's
  resolve-then-decide — therefore rests on nothing, and `loadedFor` shipped on
  2 Sep unverified because a second account was not to hand. **That, not the
  offline queue, is now the highest-value thing to cover**, and it is Phase 7's
  Gate 1.

### Not phased, needed before daily use

- ~~**Hosting on Vercel.**~~ **Done 22 Aug**, `https://daybook-bay.vercel.app`.
  `vercel.json` carries the build command, `dist/daybook/browser`, the SPA
  rewrite and the service-worker cache headers (§9). Every check was made
  against the running site; see §12.
- ~~**Manual controls in capture.**~~ **Built 22 Aug.** All four chips are
  always-visible buttons with placeholders (`Today` · `Add time` · `#Category` ·
  `Energy`), a category popover fed by `TaskStore.categories` and a quick/deep
  selector. Each writes its token into the textarea through `writeToken` in
  `core/parse-capture.ts` — see §9 for why that, and not parallel state. Both
  open details are settled there too. **Seen on screen and signed in, 22 Aug**,
  including the keyboard paths through all three popovers.
- ~~**Custom iOS "Add to Home Screen" hint.**~~ **Built 22 Aug**,
  `shared/install-hint.ts`, gated by `core/install.ts`. A card in the flow at
  the top of the shell — not floating, because the composer and the toasts both
  own the bottom of the viewport. It draws the Share glyph inline in the
  sentence rather than naming it, since "tap Share" is the instruction that
  already failed: the control is an unlabelled icon and recognising it is the
  hard part. Dismissible, remembered in `localStorage`. **iOS only**: every
  other platform either prompts on its own or does not need installing, so
  nobody else has a banner to close. `Push` now shares the same `isStandalone`
  check rather than keeping a second copy. 13 unit tests cover the gating,
  including the iPad that reports itself as a Mac. **Seen on Noel's iPhone,
  25 Aug** — the banner renders in a normal Safari tab, which is the only place
  it can, since it is gated on not already being standalone.

### Phase 7, multi-tenancy — audited 3 Sep, not started

The live project was audited end to end on 3 Sep, read-only, against
`pg_catalog`, the Supabase advisors and this repo. What follows is the ordered
fix list that came out of it. Every claim was checked against the live
database rather than taken from these docs, and where the two disagreed the
live database won.

**The table layer is already multi-tenant and needs no work.** Worth saying
plainly, because everything after this is a list of problems and none of them
are in the schema. Verified live: RLS enabled on all four tables; four
policies, every one of them `for all to authenticated` with both a `using` and
a `with check` of `auth.uid() = user_id`; every `user_id` predicate covered by
a `user_id`-leading index; all four foreign keys to `auth.users` cascading on
delete; `categories` unique on `(user_id, slug)` and not on `slug` alone; both
user-facing RPCs raising on a null `auth.uid()` and filtering every statement
they run; the five cron RPCs genuinely revoked from `anon`, `authenticated`
and `public`, with `service_role` the only grantee; `search_path` pinned on all
seven functions. **If a hundred people sign up tomorrow, their task data does
not leak into each other's accounts.** The Supabase security linter agrees —
no ERROR-level findings and no RLS finding at any level.

What breaks is everything downstream of `service_role`, where there is no RLS
to be right or wrong about.

Two structural facts to carry forward, because both are load-bearing and
neither is visible from reading a migration:

- **`force row level security` is off on all four tables, and should stay
  off.** The tables are owned by `postgres` and so is every `SECURITY DEFINER`
  function, so **RLS is inert inside all seven of them**. Their correctness
  rests entirely on hand-written `where user_id = …` clauses. Turning FORCE on
  would break them rather than protect them. The consequence: editing one of
  those function bodies is a security change, every time.
- **Three functions carry no ownership check at all, deliberately.**
  `mark_reminder_sent` is `update tasks set reminder_sent_at = now() where id =
  p_task_id` — no `user_id` in it anywhere. `digest_payload` and
  `mark_digest_sent` take a user id from whoever calls them. They are safe
  *only* because of the grants. One careless `grant execute … to
  authenticated` turns any of the three into a cross-tenant write.

#### What has landed, 3 Sep

Code and migration only. **Nothing has been applied to the live database and
nothing has been deployed** — the migration is written and unapplied, and the
Edge Function change is unreleased. Both need the schema to go first.

- **Written, not applied:** `supabase/migrations/0005_multitenancy_hardening.sql`
  carries blockers 1 (both ends), C1's `push_subscriptions` table and
  `register_push_subscription`, item 8, item 9, item 10 and item 13, plus a
  repair pass over any existing bad timezone.
- **Client, built and tested:** the `upsert` for blocker 3; per-user offline
  queue keys for C2, with a one-time adoption of the flat legacy key; push
  registration moved off `user_settings` onto the new table, with sign-out
  unregistering the device.
- **Edge Function, written not deployed:** 4xx made terminal for blocker 2, and
  the reminder loop grouped per task and fanned out per device for C1.
- Build 530.59 kB, up 3.95 kB — `SwPush` moves into the eager graph because
  `signOut()` now needs the endpoint before the session goes. 55 tests still
  passing, and none of them cover any of this; that is Gate 1.

#### Hard blockers — fix before a second real user exists

1. **One bad timezone string silently kills the digest for every user.**
   `user_settings.timezone` is unvalidated `text` (`0001_core_schema.sql`) and
   any signed-in user can write anything into their own row. `due_digests`
   (`0003_digest_and_reminders.sql`) evaluates `now() at time zone
   us.timezone` across **all** rows in one statement, so a single unrecognised
   zone raises `22023` and aborts the whole query — `readDue` retries three
   times, throws, `Promise.allSettled` swallows it, and the cron still records
   HTTP 200. Nobody gets a digest, indefinitely, with no alarm anywhere. This
   is the worst bug in the system: unbounded blast radius from one tenant's
   data, invisible from the outside. It is not even an attack — the browser's
   `Intl` zone set is not Postgres's, so `ensure_user_setup(p_timezone :=
   browserTimezone())` can plant one through the happy path. Fix both ends: a
   validating trigger against `pg_timezone_names` on write, **and** make
   `due_digests` skip a bad row instead of aborting on it.
2. **A second user's digest becomes a permanent retry storm.** `DIGEST_FROM`
   is `onboarding@resend.dev`, which Resend delivers only to the account owner
   — long known, §12, and previously filed as "silently gets nothing". The
   audit shows it is worse than that. `index.ts` treats any non-`ok` Resend
   response as retryable and skips `mark_digest_sent`, so `digest_last_sent_on`
   never advances and `due_digests` returns that user again **on every
   five-minute tick, all day, every day** — 288 failed sends per non-owner user
   per day. Two fixes, both needed: verify a real sending domain, and make a
   4xx terminal (mark it sent, or count failures and disable the digest) while
   leaving 429 and 5xx retryable. Retry-until-success is right for an outage
   and exactly wrong for a permanent rejection.
3. **New users can lose the first-login race and see an error.**
   `settings.store.ts` uses a bare `.insert(seed)` when it finds no
   `user_settings` row, which collides with `ensure_user_setup`'s insert on
   `user_settings_pkey`. Today there is one user and one row, so it never
   fires; on day one of multi-tenancy some fraction of signups get *"Could not
   create your settings."* on their very first app open. The fix is one word:
   `.upsert(seed, { onConflict: 'user_id' })`.
4. **The service role key sits in plaintext in `cron.job.command`.** The repo
   copy of `supabase/cron/schedule-notify.sql` is correctly never committed
   filled in, but the database copy is readable by anything that can query
   `cron.job` as `postgres` — including the audit, which read it. Move it into
   Supabase Vault and have the job read it through `vault.decrypted_secrets`,
   then rotate the current `sb_secret_…` key.
5. **Turn on leaked-password protection.** One toggle in the Auth dashboard,
   flagged by the security advisor, irrelevant with one owner and not
   irrelevant the moment strangers pick passwords.

#### Hard blockers — the client half

Blockers 1–16 came out of the database audit and stop at the database. The
Angular side was read separately and has six of its own. They are lettered
rather than numbered so the audit's numbering, which the rest of this file
cross-references, stays stable.

**C1. User A's reminders are delivered to user B's phone.** The worst bug
found on either side, and the only one that crosses tenants at runtime.
`swPush.requestSubscription()` with a fixed VAPID key returns **the same
endpoint for the same service-worker registration**, so two accounts used on
one installed PWA both write that endpoint into their own
`user_settings.push_subscription`. `signOut()` (`core/session.store.ts`) calls
`auth.signOut()` and nothing else — it never unsubscribes and never clears the
stored row — so A's subscription stays live, pointing at a device B is now
signed in on, and the cron happily pushes A's task text to it. RLS is no
defence: `notify` sends as `service_role`. Item 14 below describes the same
column from the other direction (one user, two devices, second silently
replaces the first); **both are the same root cause** — the subscription is a
property of a browser install, not of a user — and one table fixes both. That
retires item 14.

**C2. The offline queue is not namespaced by user, and destroys work.**
`daybook.queue.v1` in `core/offline-queue.ts` is a single `localStorage` key
with no user id in it. A signs out with writes queued, B signs in, and
`init()` runs `queue.flush()` under B's session. Traced end to end: A's queued
`insert` carries `user_id: A`, RLS rejects it, `isOffline()` returns false, and
`send()` **drops the write silently** — no toast, no retry. Updates and deletes
are `.eq('id', …)` only, so RLS scopes them to B, they match nothing, and they
are dropped too. It fails safe rather than leaking — `applyTo` is skipped when
`loadTasks` errors, so B never sees A's rows on screen — but A's offline work
is gone with no trace. Note this is also **the one client path whose safety
depends on the `with check` the audit verified**: without it, that same flush
would write into A's account from B's session.

**C3. The redirect allow list carries a preview wildcard.** §9 recorded it as
costing nothing "for a single-user app". For a multi-tenant one it is an open
redirect on the auth flow. Moving the app to a custom domain closes it by
making the list one stable origin instead of a pattern.

**C4. Magic links will die on Supabase's built-in SMTP.** It is rate-limited to
a handful of emails an hour and is explicitly not for production. Custom SMTP
is needed, through the same Resend account and sending domain that blocker 2
needs — one prerequisite, two blockers.

**C5. Signup is already open.** `signInWithMagicLink` calls `signInWithOtp`
with no `shouldCreateUser: false`, Google OAuth is live, and the Vercel URL is
public. Strangers can create accounts today, which means C1, C2 and blockers
1–3 are **live bugs, not hypotheticals**. Closing it is the Auth dashboard's
"Allow new users to sign up" toggle, not client code: the client flag would
only cover the magic-link path and would leave Google wide open.

**C6. The stores have no tests.** Covered in §4 under Test coverage. It is
listed here too because it is what let C1 ship unnoticed.

#### Scale problems — fine at five users, broken at five hundred

6. **Resend's free tier caps the whole feature at 100 emails a day**, with a
   two-per-second rate limit that a sequential loop will brush. 100 users with
   the digest on *is* the cap, and every 429 past it becomes the same infinite
   retry as (2). A paid plan, not a code change — but (2) has to land first or
   the backlog eats the next day's quota too.
7. **`notify` sends serially inside one invocation** — one `digest_payload`,
   one Resend POST and one `mark_digest_sent` per user, awaited in order.
   Against the 150s free-tier wall clock that is roughly 200–350 users per
   tick. Digests degrade gracefully, because each user is marked immediately
   after their own send and the next tick picks up the remainder; **reminders
   do not** — anything pushed past the 15-minute grace window in
   `due_reminders` is dropped for good. **Reminder delivery is what breaks
   first under load**, not the digest. Batch the sends, or shard users across
   ticks.
8. **`auth.uid()` is re-evaluated per row in all four policies.** The
   performance advisor flags it four times. Rewriting as `(select auth.uid()) =
   user_id` hoists it to an InitPlan evaluated once per query. Four one-line
   changes and the cheapest win available; invisible at nine tasks, real on a
   multi-thousand-row range scan.
9. **`tasks.category_id` has no index**, so `delete from categories` seq-scans
   `tasks` to enforce `on delete set null` — and that scan is *not* user-
   scoped, so one user deleting a category reads every user's rows.
10. **A wrong device clock permanently poisons a day of history.**
    `rollover_and_snapshot` clamps to `v_server + 1`, so a device a day fast
    pushes open tasks to tomorrow *and* writes a snapshot for a still-running
    today with incomplete counts. Because the next run starts at `v_last_snap
    + 1` and inserts `on conflict do nothing`, that row can never be corrected.
    Harmless at one careful user; at a hundred, some of them have bad clocks.
    Clamp the upper bound to `v_server` and exclude today from the snapshot
    loop by construction.
11. **`day_snapshots` grows one row per user per day forever** and nothing
    prunes it. Irrelevant at 100 users (~36k rows a year); at 1,000 it is
    50–100MB a year against a 500MB free-tier database. The database is 13MB
    today, so this is a watch item, not work.

#### Nice-to-haves

12. **A task can reference another user's category.** `tasks_category_id_fkey`
    is a plain FK to `categories(id)` with no `user_id` component and there are
    no triggers anywhere, and FK checks are not subject to the caller's RLS. It
    leaks nothing readable — RLS still blocks the read, and the client never
    uses an embedded join — but it is an existence oracle for UUIDs, and user
    B deleting a category nulls user A's task. Fix with a composite FK on
    `(user_id, category_id)`, which needs a unique index on `categories
    (user_id, id)`. **Inferred, not verified**: confirming it needs a write.
13. **Append `, pg_temp` to `search_path` on all seven functions.** Postgres
    searches the temp schema first for relation names when it is not listed, so
    in principle a `pg_temp.user_settings` could shadow the real one inside a
    definer function. Not exploitable here — that needs arbitrary SQL and
    PostgREST exposes no such RPC — so this is insurance, not a hole.
14. ~~**`push_subscription` is one JSONB column**, so a second device silently
    replaces the first.~~ **Promoted to blocker C1, 3 Sep.** Same root cause
    seen from the other side, and the cross-user direction is a live delivery
    leak rather than an inconvenience. One table fixes both.
15. **Squash the migration drift.** Live has six applied, the folder has four;
    `0002_rpcs.sql` consolidates `daybook_revoke_anon_rpc_execute` and
    `daybook_carry_count_by_days_not_opens`. Confirmed semantically identical —
    the only textual difference is that the live `rollover_and_snapshot` body
    lost its inline comments — but it makes `supabase db diff` useless as a
    check.
16. **Housekeeping.** A partial index on `user_settings (digest_enabled) where
    digest_enabled` once the seq scan every five minutes stops being free; a
    retention purge on `cron.job_run_details`, which holds all 3,439 runs since
    21 Aug and grows ~105k rows a year; and `pg_net` moved out of the `public`
    schema, per the security advisor.

#### Shape of the work

One migration, `0005_multitenancy_hardening.sql`, carries (1) validation and
defence, (8), (9), (10), (13) and optionally (12) — all schema, all testable
against a second seeded auth user — plus the `push_subscriptions` table C1
needs. One Edge Function change carries (2) and (7), and the fan-out over the
new table for C1. Client changes carry (3), C1's subscribe/sign-out half and
C2. (4), (5), (6), C3, C4 and C5 are dashboard, DNS and Vault work that no
migration can do, and (4) should be done first because rotating the key
invalidates nothing else.

**Signup is invite-only first.** Decided 3 Sep, §9. The isolation work ships
and gets proven against a real second account before the door opens, which
keeps the Resend paid plan, the legal pages and abuse rate-limiting out of the
critical path without deferring anything that actually isolates tenants.

Four gates, in order:

- **Gate 0 — before a second real user.** Blockers 1–5 and C1–C5.
- **Gate 1 — prove it.** C6: specs for the three stores and the guard covering
  the two-user transition, then a two-account pass on one device. This is the
  step that would have caught C1, and it is the only way `loadedFor` gets
  verified after two sessions of it being unverified.
- **Gate 2 — production readiness.** Account deletion and export; a privacy
  page; error visibility on the cron, which today returns HTTP 200 while doing
  nothing (blocker 1's failure mode is invisible for exactly this reason); and
  a backup story, since the free tier has no PITR.
- **Gate 3 — scale.** Items 6–11. These genuinely wait.

Phase 7 goes ahead of the code-quality and test-coverage work agreed 25 Aug.
That is less of a reordering than it looks: Gate 1 *is* the test-coverage work,
aimed at the files that carry the isolation logic rather than at the offline
queue.

---

## 5. Features

Each feature carries its own state. This is the only place feature status is
tracked.

1. **Add to-dos for the day.** State: done, with an undo toast naming the day
   it landed on.
2. **Schedule to-dos for a future date**, entered primarily through natural
   language, with the date picker behind the chip for anything the sentence
   does not say. State: done.
3. **Natural language capture.** Typing `call physio thursday 2pm #physio
   !quick` parses into date, time, category and energy, with tokens rendering
   as inline chips as you type. State: **done, both paths, verified on screen
   22 Aug.** All four chips are always-visible buttons with placeholders, and
   the keyboard path through each popover has been walked. The history below
   is kept because it explains why the manual path looks the way it does.
   Previously: date and time had a picker but **category and energy had no
   manual control at all**, and their chips did not render until the text
   parsed a token, so neither was discoverable. Fixed 22 Aug with
   always-visible chip buttons that write tokens back into the text — §4, §9.
4. **Complete with a timestamp**, not just a checkbox, so history and the email
   digest can show "completed at 9:15 AM". State: done.
5. **Daily history.** Each day's list preserved with date and details, viewable
   later. State: **done.** `day_snapshots` accumulate correctly and the
   calendar plus `/calendar/:date` read them. A past day shows what was
   finished and what was carried off, from two different sources — see §4.
6. **Automatic carry-forward.** Incomplete tasks roll to the next day. State:
   done, and confirmed in normal use by an unattended rollover on 19 Aug.
7. **Optional reminder times.** State: **done, delivered to a real device
   22 Aug.** `reminder_at` is set by the parser or the picker; `due_reminders()`
   finds them, the `notify` function encrypts and posts them. First real
   delivery: `call the doctor`, set for 09:12 Sydney, sent 09:20:02 by the cron
   to an installed iPhone PWA. See §12 for the transient 401 on the 09:15 tick
   and how the grace window absorbed it.
8. **Energy tag per task, Quick or Deep**, so the list can be filtered by how
   much focus is available. State: done, including the filter.
9. **Category tag** (Freelance, Work, Family, Health, or anything typed as a
   `#tag`) for filtering. State: **done.** Tagging, auto-creation, display, the
   Today filter chips, and rename/recolour/delete in Settings. Deleting a
   category leaves its tasks untagged, never deleted.
10. **Carried-over count**, incremented automatically on rollover, and a
    separate **reschedule count** for manual pushes. Together they answer "what
    do I keep avoiding". State: **done.** Data, the row badge, both counts on
    the task card, and the two Reporting lists. Editing a task's date later
    counts as a push; pulling it earlier does not — §9.
11. **Upcoming strip** on Today, collapsed by default, showing the next 7 days.
    State: done.
12. **Daily email digest**: completed versus incomplete, plus a preview of
    tomorrow. State: **done and delivered.** `notify` renders and sends it via
    Resend; `due_digests()` decides who is due using their own timezone. On
    21 Aug a hand invocation landed "Daybook — 1 on today" in Noel's inbox
    with the carried section correct. Two caveats: it is sent from Resend's
    shared `onboarding@resend.dev`, which **only delivers to the Resend account
    owner**, so a verified domain is needed before a second user exists; and
    the "Yesterday you finished" branch of the template has still never
    rendered, because nothing scheduled on 20 Aug was completed. **The cron is
    live as of 21 Aug**, so the first unprompted digest is 22 Aug after 07:00
    Sydney and nothing further is needed to make it arrive.
13. **Weekly review**: tasks carried over or rescheduled most often, plus a
    completion trend. State: **done**, at `/reporting`.
14. **Simple visual stats**, e.g. a glanceable weekly bar chart of tasks
    completed per day. Kept minimal, not an analytics dashboard. State:
    **done early**, as the fortnight chart in Reporting. It arrived with the
    weekly review rather than in Phase 6 because the review needed it.
15. **Calendar view**: heat map of past days and scheduled counts for future
    days, in one bidirectional view. State: **done**, at `/calendar`.
16. **Empty state illustrations**, e.g. "all clear for today". State: **done**,
    `shared/empty-state.ts`. Four scenes — `clear`, `blank`, `filtered`,
    `quiet` — drawn as inline SVG rather than generated raster art (§9). Today
    picks between three of them, because a filter hiding work, a finished day
    and a fresh day are three different emptinesses; the day detail page uses
    `quiet` for both a past day with no record and an unplanned future one.
    Reporting's two empty lists stay as plain sentences: they sit inside a
    card beside other content, and artwork there would be noise.

### 5.1 Signature interactions

The three interactions that make this a product rather than a CRUD list.
Treated as core, not polish.

- **Floating composer** (borrowed from Todoist). An `Add task` button opens a
  floating input over the list, with the date chip live from the moment it
  opens and explicit cancel and commit. Replaced the Magic Plus draggable FAB
  on 18 Aug; see §9 and §10. State: **done**, `features/today/composer.ts`.
- **Task as object.** Tapping a task expands it into a card while the rest of
  the list fades back, using the View Transitions API with
  `view-transition-name: task-{id}` per row. Implemented as a route so
  deep-linking and the back button work, via Angular's `withViewTransitions()`.
  State: **done**, `/today/:id`. The same machinery also drives completion —
  re-sorting the list inside a View Transition FLIPs every row that moved.
- **Natural language capture** (borrowed from Todoist). The primary input path.
  Rendered as a transparent textarea over a styled mirror div, not
  contenteditable. State: done.

### 5.2 Interaction rules

- **Optimistic updates everywhere.** Write to the store first, sync to Supabase
  after, roll back and toast on error. No spinners. State: done.
- **Undo toast instead of confirmation dialogs.** State: done.
- **Completion animates.** Checkbox fills, text strikes and dims, row leaves
  and the list closes the gap. State: **done**, via View Transitions rather
  than keyframes.
- **Swipe right to complete, swipe left to reschedule**, on mobile. State:
  **done**, `shared/swipe.ts`, touch pointers only. Thresholds unmeasured.
- **Sub-100ms perceived latency on every interaction.** This is what makes it
  feel native, and it is an architecture decision (optimistic local writes),
  not a CSS one.

### 5.3 Pages

| Page | Purpose | State |
|---|---|---|
| **Login** | Google OAuth, magic-link fallback | done |
| **Dashboard / Today** | Add and complete tasks, filter Quick/Deep, collapsed Upcoming strip | done |
| **Upcoming** | The next 7 days as a list grouped by day header, with a per-day `+ Add task` row that schedules by position, and a week strip that pages forward. Not the calendar — that is a grid, and it is the row below | done, `/upcoming`, paging capped at 3 weeks |
| **Calendar** | Bidirectional. Past cells show completion density as a heat map, future cells show a count of scheduled tasks, today is the boundary. Tap a cell for that day's list | done, `/calendar` |
| **Day detail** | One day drilled into from a calendar cell: what was finished, and what was carried off it | done, `/calendar/:date` |
| **Reporting** | Most carried over, most rescheduled, completion trend | done, `/reporting` |
| **Settings** | Email digest preferences, timezone, manage categories, push | done, `/settings` |

Navigation is a drawer on desktop and a hamburger sheet on mobile, the same
model at both widths: Today / Upcoming / Calendar / Reporting, with Settings
and Sign out below a rule. Reporting is where the weekly review and the §6
chart live. State: **done**, `shared/shell.ts`, as a layout route.

### 5.4 UI direction

- Bright, energetic palette. Not childish.
- **Green and red are reserved and functional.** Green means completed, red
  means overdue or badly avoided. Nothing else may use them, or they stop
  carrying meaning. Everything else comes from the `ink` and `brand` scales in
  `src/styles.css`.
- Strong hero section on the landing / marketing view.
- Visually rich dashboard.
- Premium-feeling login screen with Google sign-in.
- AI-generated illustrations for the hero and empty states. **Superseded** —
  they are hand-drawn SVG, see §9, Phase 6.
- **The look is adapted from references Noel collects, not designed from a
  brief.** Settled 25 Aug after a ground-up redesign was explored and dropped;
  see §9. Expect the change to be colour and type within the existing layout.
- **The palette is close to full.** Green is done, red is overdue, amber is
  `quick`, violet is `deep`, plus the brand — five semantic hues in a list app.
  Any new colour has to displace one, and `quick`/`deep` are the candidates,
  being a duration property rather than a status.
- **The brand is `#6366f1`**, which is Tailwind's unmodified `indigo-500`.
  Noted so it is a choice next time rather than a default.
- **The spacing, radius and type scales are now fixed** and are the substrate
  the visual pass paints on: three radii, seven type steps, six spacing steps.
  Declared in `@theme` in `src/styles.css`, ruled in `AGENTS.md`, adapted from
  Doist's published tokens (§9, 25 Aug). Colour was deliberately left
  untouched — it is the half of the look Noel is bringing references for.

### 5.5 Capture syntax

| Token | Effect | Example |
|---|---|---|
| plain text | the task | `call the physio` |
| natural date | schedules it | `thursday`, `next monday`, `in 3 days` |
| date + time | schedules and sets `reminder_at` | `thursday 2pm` |
| `#tag` | category, created if it does not exist | `#physio` |
| `!quick` / `!deep` | energy tag | `!quick` |

No date means today. Enter adds, Shift+Enter is a newline.

The chips under the box are not only a preview. The date chip is always
present — it reads `Today` before a word is typed — and opens the picker;
the reminder chip appears whenever a time is set and can be cleared from
there. Typing a date afterwards overrides whatever the picker chose (§9).

Parsing order matters: `#tags` and `!energy` are extracted before chrono runs,
so chrono cannot claim a substring inside one of them. It will otherwise read
"may" out of `#maybe`. Date tokens overlapping an already-claimed range are
dropped. Covered by `src/app/core/parse-capture.spec.ts`.

---

## 6. Data model

Four tables. Full DDL in `supabase/migrations/0001_core_schema.sql`.

### tasks

```sql
create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  text               text not null,
  created_date       date not null,          -- when first written down, immutable
  scheduled_date     date not null,          -- which day it lives on, mutable, may be future
  completed_at       timestamptz,            -- null means not done
  energy             text check (energy in ('quick','deep')),
  category_id        uuid references categories on delete set null,
  reminder_at        timestamptz,
  carried_over_count int not null default 0, -- automatic rollover only
  reschedule_count   int not null default 0, -- manual pushes only
  created_at         timestamptz not null default now(),
  reminder_sent_at   timestamptz             -- added 0003, cron idempotency
);

create index on tasks (user_id, scheduled_date) where completed_at is null;
```

**There is deliberately no `status` column.** All three states derive:

- completed = `completed_at is not null`
- carried over = `carried_over_count > 0`
- pending = neither

### day_snapshots

```sql
create table day_snapshots (
  user_id          uuid not null references auth.users on delete cascade,
  date             date not null,
  completed_count  int not null,
  carried_count    int not null,
  carried_task_ids uuid[] not null default '{}',
  primary key (user_id, date)
);
```

Closes a real gap: without it, a task that rolls for three days only ever
exists on day three and the incomplete side of history is destroyed. The
calendar heat map reads from here rather than aggregating `tasks`.

### categories

`id, user_id, name, slug, colour, sort_order, created_at`, unique on
`(user_id, slug)`. Seeded with Freelance, Work, Family and Health on first
login.

### user_settings

`user_id` PK, `timezone`, `digest_enabled`, `digest_send_at`,
`push_subscription jsonb`, `seeded_at`, plus `digest_last_sent_on` from 0003.

`timezone` is read by `due_digests`, and it is the only thing telling a cron
running in UTC when 7am is for a given person. It is also unvalidated `text`
that any signed-in user can write, and one bad value takes the digest down for
everyone — see §4 Phase 7, blocker 1.

### Security

RLS is enabled on all four tables, owner-only, all four verbs, via
`auth.uid() = user_id`. Both user-facing RPCs are `SECURITY DEFINER`, raise on
a null `auth.uid()`, and are revoked from `anon` and `public`. The five cron
RPCs in 0003 are locked the other way: revoked from `anon`, `authenticated`
and `public`, granted to `service_role` alone.

**All of that was verified against the live database on 3 Sep**, policy text
and grants read out of `pg_policies` and `pg_proc.proacl` rather than assumed
from these migrations. It holds. What does not hold is the cron path — §4
Phase 7.

One thing that is not obvious and matters every time a function is edited:
`force row level security` is off, the tables are owned by `postgres`, and so
are all seven `SECURITY DEFINER` functions — so **RLS does nothing inside
them**. Every one of those bodies is its own access-control boundary, enforced
only by the `where user_id = …` its author remembered to write.

---

## 7. Rollover logic

Rollover runs **lazily on app open**, using the client's local date, not on a
cron. Timezone-correct by construction, nothing to debug at 2am, and idempotent
so it does not matter how often it runs.

`rollover_and_snapshot(p_today date)` in `supabase/migrations/0002_rpcs.sql`
does three things in one transaction:

1. **Clamps `p_today`** to within a day of server time, so a wrong device clock
   cannot scramble history.
2. **Writes a `day_snapshots` row for every un-snapshotted day** between the
   last snapshot and today. Each day counts every task open on that date
   (`scheduled_date <= day`), not only tasks sitting exactly on it.
3. **Rolls open past-dated tasks forward**, adding the number of days slipped
   to `carried_over_count`.

```sql
update tasks
   set carried_over_count = carried_over_count + (v_today - scheduled_date),
       scheduled_date     = v_today
 where user_id = v_uid
   and completed_at is null
   and scheduled_date < v_today;
```

Rules that fall out of this:

- **Future-dated tasks are never matched.** They sit and wait.
- **`carried_over_count` increments only in the rollover path.** A manual
  reschedule in the UI increments `reschedule_count` instead. Deliberately
  pushing something to next week is a stronger avoidance signal than passively
  letting it roll, so the two are tracked separately.
- **On completion, `scheduled_date` is also set to today.** Otherwise a task
  scheduled for Friday and completed on Wednesday never appears in Wednesday's
  log.
- **Snapshots are written before the update**, since the update destroys the
  `scheduled_date` they are computed from.

Verified live with a seeded 4-day gap: 4 snapshot rows written, 1 task rolled
with `carried_over_count = 4`, a future-dated task untouched, a second run a
no-op, and `current_date + 400` clamped to server time plus one day.

---

## 8. Locked decisions

**Angular over Astro / React / Next.** Already a senior Angular dev, this app
needs real interactivity and state rather than a static brochure site, and it
is a low-stakes place to get deeper into Signals and SignalStore. React and
Next are deliberately deferred to the *next* side project, as a dedicated
learning vehicle.

**PWA over native.** Fits the actual usage pattern (train commute, work breaks,
home) without maintaining separate mobile codebases. A native wrap stays a
possible future step once the PWA is proven useful day to day.

**Supabase over a custom backend.** Free tier fully covers personal use, and
built-in Google OAuth removes the need to hand-roll auth.

**No `status` column.** With `scheduled_date`, `completed_at` and
`carried_over_count` in place, all three states are derivable, so there is
nothing to keep in sync.

**`scheduled_date` replaced the old `current_date` field** rather than adding a
column. It already held "which day this task shows on"; letting it hold future
dates gives full scheduling with no new column and no change to the rollover
query. `original_date` was renamed `created_date` for clarity against it.

**Carry-forward and reschedule are counted separately**, so the avoidance
insight is not polluted by legitimate rescheduling.

**Rollover is lazy on app open, not cron.** Cron is still needed for the email
digest and reminders, but nothing else.

**Upcoming looks 7 days ahead.** Anything beyond a week on a daily app is a
wish list, not a plan.

---

## 9. Decisions made during the build

Not in the original Notion brief. Made while getting Phases 1 and 2 working.

**`categories` table added.** `tasks.category_id` referenced a table that did
not exist anywhere in the brief.

**`user_settings` table added.** Phase 5 needs digest preferences, timezone and
a Web Push subscription, and nothing in the model held them.

**RLS added on all four tables.** The brief never mentioned it. Without it the
publishable key reads every row in the database.

**Snapshots are written for every day in the gap, not just the closing day.**
The brief wrote one row per rollover run. Skip a weekend and Monday's run would
write a single Sunday row, losing Friday and Saturday from the heat map
entirely.

**`carried_over_count` counts days, not rollover runs.** The brief said
"increments each time a task rolls over". That makes the number depend on how
often the app is opened: a task ignored for a week reads as 1 if you open the
app once and 7 if you open it daily. Same avoidance, different number. It now
increments by `today - scheduled_date`, so it measures the thing it claims to.

**Unknown `#tag` creates the category.** Typing `#physio` when no physio
category exists creates it rather than silently dropping the tag. Dropping
input the user clearly meant is worse than an occasional stray category, and
categories are trivial to delete.

**First-login setup is an idempotent RPC, not a trigger on `auth.users`.**
Triggers on that table fail in ways that are painful to debug and can block
sign-up entirely.

**Google OAuth ships alongside a magic-link fallback.** The fallback made
Phase 1 testable before the Google Cloud work was done, and it stays as a
recovery path if the OAuth client is ever broken or revoked.

**Daybook got its own Google Cloud project rather than reusing "Website
Development".** A project can hold unlimited OAuth client IDs but only ever one
consent screen, and the consent screen carries the app name, logo and
verification status that users see. Putting Daybook's consent screen in the
general-purpose project would have branded that project Daybook permanently and
forced a new project for the next app needing Google sign-in anyway. A project
is free and takes two minutes. `Website Development` stays clean for API keys.

**`@ngrx/signals` is on `22.0.0-rc.0`.** The stable line (21.x) peer-requires
Angular 21. Reverting to Angular 21 LTS is a one-command change if the RC
causes trouble.

**The global stylesheet is `.css`, not `.scss`.** Tailwind v4 cannot be
imported from a Sass entry point; Sass tries to resolve `tailwindcss` as a Sass
module. Component styles can still be scss.

**Named Daybook**, chosen over Cairn, Tide and Carryover.

**Todoist is the UX reference, captured in `docs/reference/todoist/`.** Screens
and recordings are committed so every agent surface can see them, annotated in
that folder's `NOTES.md`. Nothing in there is a decision: a capture becomes one
only by landing in §5 as a feature or in §9 here. Each capture is sorted Steal
(capture and motion ideas), Adapt (right idea, wrong shape for a day-book) or
Reject (project-management structure). Todoist's IA is projects → sections →
tasks → subtasks with priorities, labels and saved filters, which pulls
directly against §10; anything from that pile needs an explicit reversal
recorded here rather than a quiet implementation.

**The one-day push button is labelled with the day it lands on.** It was
labelled "Tomorrow" unconditionally while the action is
`addDays(task.scheduled_date, 1)`, so on a task three days out it said Tomorrow
and moved the task to the day after that one. The row does not show its own
date — the Upcoming strip's day header already carries it, and repeating it per
row is noise — so the only date on the row is the button's target.

### From the Todoist captures, 18 Aug

Nine decisions taken while reading `docs/reference/todoist/`. Each names the
capture it came from so the reasoning can be re-checked against the picture.

**Capture becomes a floating composer, and the Magic Plus FAB is dropped.**
From `quick-add--composer-to-toast.mov`. An `Add task` button opens a floating
input over the list rather than a box that is always sitting there. The two
were competing answers to the same problem — where the add control lives — and
building both would have meant two ways to start a task. Noel's call on the
FAB: a draggable control is too complicated to use. The FAB also carried a
hidden cost the composer does not, in that its most interesting drop target
was a calendar cell and the calendar is Phase 4, so two thirds of the idea was
blocked on unbuilt work. Reversal recorded in §10; §5.1 updated.

**The add-confirmation toast names the day, not the project.** From frame 15
of the same recording, where Todoist shows `Task added to Inbox · Open · ×`
bottom-left, with the destination as a link. Daybook's version says "Added to
Friday 21 Aug", because a Daybook task has no project and the day is the thing
the user cannot see — it is the whole reason the add read as a failure on
18 Aug. `Open` navigates to `/today/:id` and so waits on that route.

**The date chip is present and interactive from the moment capture opens.**
Same recording, frames 4 and 12: it reads `Today ×` before a character is
typed and becomes `Tomorrow 16:00 ×` as the date is recognised. Daybook's
(`capture.ts:69`) appears only once a date parses and is a read-only span.
`scheduled_date` is required on every task, so a default is always being
applied; showing it up front and letting it be corrected without retyping is
honest about that, and hiding it is not.

**A parsed time surfaces a reminder chip.** Same recording — typing a time
adds a second chip, `At time of task`. `parse-capture.ts` already sets
`reminder_at` and nothing in the UI acknowledges it, which is how feature 7
ended up "parsed and stored, never fires".

**The date picker has no "No Date" and no "Repeat".** From
`scheduling--date-picker.png`, which offers both. "No Date" is the someday
bucket §10 has already rejected and `scheduled_date` is `not null`, so the
control would have to fail. "Repeat" has no column, no phase and no request
behind it. What is kept is the shortcut row with **each option's resolved day
printed beside it** — Next week reads `Mon 24 Aug` — which lets the choice be
checked before it is committed.

**Edit reuses the `Capture` component; there is no separate edit form.** From
`task-detail--inline-edit.png`, where clicking edit replaces the row in place
with the quick-add composer: same field, same chip row, cancel and commit on
the right. Two components that parse the same syntax into the same shape would
drift, and the second one to be written is always the one that misses a token.

**Overdue does not get its own group or a bulk "Reschedule" button.** From
`list--today-with-drawer.png`, which has both. Todoist parks slipped work in a
permanent bucket you clear by hand. Daybook rolls it forward automatically and
increments `carried_over_count` by the number of days slipped, and that count
is the product — it is the answer to "what do I keep avoiding". A bucket that
is cleared in one click destroys the signal the app exists to collect.
Recorded here so it is not re-proposed in three months on the grounds that
Todoist does it.

**Mobile navigation is a hamburger sheet mirroring the desktop drawer, and it
opens from the button only — never a left-edge swipe.** From
`nav--mobile-drawer.mov`. One nav model at both widths is one component rather
than two. The gesture restriction is the load-bearing half: Phase 3 puts
swipe-left-to-reschedule on every task row, and a left-edge drawer gesture
competes for the same pixels at the same moment. Todoist's own drawer here is
button-driven, so copying it costs nothing.

**Upcoming becomes a route, not only a strip.** From
`upcoming--week-grouped-by-day.png`. A list grouped by day header with a
per-day `+ Add task` row, which schedules by position instead of by typing a
date, and a week strip that pages forward. It is not the Phase 4 calendar;
that is a grid over months, this is a list over one week. **Still open:** what
happens to the collapsed strip on Today once this exists.

### Building the date picker, 18 Aug

**A date typed after the picker was used wins.** The picker's choice is held
separately from the parse and overrides it, but `Capture.onInput` drops that
choice the moment the text parses to a different day or time. Newer intent
wins, whichever way it was expressed. Without this, picking Friday and then
typing "monday" would silently keep Friday and the box would be lying.

**The reminder travels with the chosen day.** Picking a new date rebuilds
`reminder_at` from that date plus the current time rather than keeping the
timestamp the text produced. A 2pm reminder left behind on the day that was
typed is a bug with no error message.

**Past days are disabled in the grid.** Not a rule about the data —
`scheduled_date` may legitimately sit in the past between rollovers — but a
day already gone is a choice the next rollover immediately undoes, so offering
it is offering nothing.

**The picker holds no state but the visible month.** It takes a date and a
time and emits a new pair. Capture owns the value, and so will edit and
reschedule-from-a-row when they arrive, which is what makes one component
serve all three.

**"This weekend" disappears on a Friday, Saturday and Sunday** rather than
pointing six days out. It resolves to the coming Saturday, and a shortcut that
duplicates an earlier row's day is dropped. On a Sunday the weekend is already
here, so it collapses into Today.

### The add toast, 18 Aug

**The toast fires before the insert resolves,** exactly as the optimistic row
does. Waiting for the round trip would put a spinner's worth of delay in front
of the only feedback the add produces, which §2's performance bar rules out. If
the insert then fails, the add toast is dismissed by id and the error toast
replaces it, so the two are never on screen contradicting each other.

**Undo on an add deletes the task**, and it is the first and only caller of
`TaskStore.remove()`. Undo pressed while the insert is still in flight drops
the row locally and sets a flag; when the insert lands, the store deletes the
server copy it just created. Without that, a fast Undo leaves a ghost row that
is invisible until the next reload.

**The message names the day, not the task.** "Added to Friday 21 Aug." rather
than the text just typed, because the text is not what is in doubt — where it
went is. `sentenceDate` exists for this: `friendlyDate` returns "Today" and
"Fri 21 Aug", which read like a chip that escaped into a sentence.

---

### Phases 3 to 5, 21 Aug

**Completion motion is delegated to the browser, not authored.** Every row
already carried `view-transition-name: task-{id}` for the task-as-object morph.
Running a state change inside `document.startViewTransition()` therefore makes
the browser FLIP every row that moved, so "the row leaves and the list closes
the gap" needs no keyframes and no measured duration. `core/view-transition.ts`
holds the one wrinkle: the app is zoneless, so an explicit `appRef.tick()`
inside the callback is load-bearing — without it both snapshots are identical
and nothing animates.

**The edit box is seeded with the task's tokens spelled back out, but never its
date.** `toCaptureText` writes `call physio #physio !quick`; the day rides in
the picker instead. Round-tripping the date through the text would mean
re-parsing "thursday" against a new today, which silently moves the task a week.

**Editing a task's date later counts as a manual push; pulling it earlier does
not.** `reschedule_count` answers "what do I keep avoiding", and dragging work
forward is not avoidance. Counting both directions would poison the only number
that question has.

**Calendar is a top-level destination, not a tab inside Reporting.** The plan
said three nav items. It is four. A calendar is a way of *finding* a day;
Reporting is statistics *about* days. Filing one under the other makes the
calendar hard to reach for its actual use.

**A past day with no `day_snapshots` row renders differently from a day with
nothing done.** The first is a day the app was never opened and draws a
hairline; the second draws an empty cell. Collapsing them would make a holiday
look like a failure, in both the calendar and the Reporting chart.

**Offline queues on a dropped connection and rolls back on a rejection.**
`isOffline()` in `core/offline-queue.ts` tells them apart. Queueing an RLS
rejection would retry it forever and block every write behind it; rolling back
a network blip would lose work that was only ever going to succeed later.

**Task inserts now carry a client-generated id** rather than stripping it and
letting Postgres allocate one. It makes the optimistic row and the stored row
the same row, which is what lets an offline edit of an offline-created task
queue against an id still valid when both replay.

**Swipe fires on release, not on crossing the threshold.** An action that
commits mid-drag cannot be backed out of. Its four timing constants are
reasoned rather than measured and are gathered at the top of `shared/swipe.ts`
so replacing them is a one-place edit if they ever need to change. Noel used
the gesture and called them fine on 25 Aug, which is the only judgement they
were ever going to get — the iOS captures that would have set them were never
taken.

**Web Push is implemented rather than depended on.** `web-push` assumes Node's
crypto and will not run on Deno Deploy, so RFC 8291 and 8292 are written out on
Web Crypto in `supabase/functions/notify/webpush.ts`. That is ~80 lines against
a dependency that does not work. `webpush.test.mjs` proves the crypto by
round-trip; the wire format is still unproven.

**The digest's "who is due" logic lives in SQL, not in the function.** The cron
runs in UTC and cannot know when 7am is for anybody. `due_digests()` resolves it
with one `at time zone` against `user_settings.timezone`, which is the whole
reason that column exists.

**The cron schedule is not a migration.** It has to carry the service role key
in its command text. It lives in `supabase/cron/schedule-notify.sql` to be run
by hand, and is the one piece of Phase 5 deliberately left unapplied. The two
extensions it needs are a migration, though — `0004_cron_extensions` — because
enabling them carries no secret and should be tracked like any schema change.

### Resend and the digest, 21 Aug

**`notify` authenticates on the JWT `role` claim, not on `verify_jwt` alone.**
`verify_jwt: true` only proves a token was signed by this project, and the anon
key is such a token — it ships in the public browser bundle. Proven, not
theorised: the function was invoked successfully with the anon key and sent a
real email. Since every RPC inside runs with the service role, the
`service_role`-only grants in `0003` were bypassed entirely by the HTTP
endpoint. `isServiceRole()` now decodes the bearer token and requires
`role === 'service_role'`, returning 403 otherwise. It does **not** re-verify
the signature, because the gateway already did — which means **`verify_jwt`
must stay true**, or the guard becomes forgeable. This was chosen over a shared
secret because the cron already had to carry the service role key, so it adds
nothing for Noel to generate, store or rotate.

**`DIGEST_FROM` is Resend's shared sender for now.** `onboarding@resend.dev`
needs no DNS and was the difference between testing the digest that night and
waiting on domain verification. Its limit is real and will bite the moment
Daybook has a second user: Resend only delivers it to the address that owns the
Resend account.

### The clickthrough, 21 Aug

**A `<select>` binds its selection on the `<option>`, never as `[value]` on the
select.** The Settings timezone select carried `[value]="s.timezone"` and
rendered `America/Los_Angeles` while the stored zone was `Australia/Sydney`.
A `[value]` binding on a select is applied before `@for` has rendered the
option children, so the assignment matches nothing and the element falls back
to `selectedIndex 0` — which, because `zones()` is sorted alphabetically, is
Los Angeles. It never corrupted data, because `settings.update()` patches a
single field, but it hid the "Use Australia/Sydney" reconcile button (correctly
— the *stored* value already matched) and so could not be noticed from the UI.
Use `[selected]="zone === s.timezone"` on the option. Applies to every select
added from here.

**VAPID keys are Noel's to generate and hold, and no agent's to see.** The pair
is generated in a terminal outside the session so the private half never enters
a transcript. Only the public half is pasted back, and it ships in
`environment*.ts` by design. The private half lives in Noel's password manager
and in Supabase secrets — **and Supabase secrets are write-only, so the
password manager is the only copy that can be read back.** Losing it means
regenerating, which silently invalidates every existing subscription.

**Three of the four visual "bugs" spotted by eye in the clickthrough were
artifacts of the screenshot tool**, and all three died on a single DOM
measurement. Content centring, the dark bar down the right of every capture,
and the toast's supposed absence from the a11y tree were all wrong. Measure the
DOM before recording a visual defect.

### Phase 6, 21 Aug

**The empty-state and hero illustrations are hand-drawn SVG, not AI-generated
raster art.** The plan called for AI-generated images; there is no
image-generation tool in the build environment, and on inspection a line
drawing wins on every axis this app cares about anyway. It scales to any
screen, weighs a few hundred bytes inside a bundle the service worker already
caches, needs no network on a cold offline load, and cannot drift out of step
with the palette the way a baked-in PNG would. If Noel wants generated artwork
later it drops into the same component behind the same `scene` input.

**`authGuard` sends signed-out visitors to `/welcome`, not `/login`.** A
stranger who lands on the app should be told what it does before being asked to
sign in to it. `/welcome` carries `guestGuard`, so the two guards test
complementary conditions and cannot bounce a request between them. The cost is
one extra click for a returning user whose session expired, which is the right
trade for the only page that ever explains the product.

**The hero performs the carry-over instead of describing it.** A task row lifts
off yesterday's page, lands on today's, and its badge ticks ×1 → ×2. That
mechanic is the only thing about Daybook no other list app does, so it is the
one thing the page spends its attention on. The row is absolutely positioned in
the stack rather than sitting in either card's flow — it has to be over both
mid-flight, and a card that clipped it would cut it in half. **That makes the
116px travel a hard-coded number derived from the two slot positions**; change
any card padding or row height in that component and the keyframe changes with
it.

**No webfont anywhere, including the marketing page.** A landing page that
blocks on a font request is a landing page nobody waits for. The type
personality comes from the scale — a very tight display size against very
wide-tracked micro labels.

**Corrected 25 Aug.** This paragraph used to open "Inter is already the app's
face", which was false when it was written: Inter was named in `--font-sans`
and never once fetched. The conclusion survives the premise being wrong — the
decision is now a deliberate system stack rather than an accident, and the rule
it states holds unchanged.

#### Reactist was evaluated and rejected; its tokens were taken

**25 Aug.** Todoist's interface is the reference Daybook keeps coming back to,
and Doist publish their component library as `@doist/reactist`. It was costed
and **not adopted.**

It is React, and not lightly: `react` and `react-dom` as peer dependencies
alongside `@ariakit/react`, `react-compiler-runtime` and
`react-transition-group`, with `react-focus-lock` and `react-markdown` beneath.
Daybook is Angular 22, standalone and **zoneless**. Using it would mean a React
root inside Angular components with every signal bridged across the boundary —
against `OnPush` everywhere, against no-zone.js, and putting React's reconciler
in front of the sub-100ms bar. It would also fight `view-transition-name`, which
needs Angular to own the DOM at the moment state changes. Not a close call.

**The tokens are separable and were taken.** `src/styles/design-tokens.css` is
a plain `:root` block with no React in it, MIT licensed, and Doist publish the
colour and radius sets separately as `@doist/product-libraries-tokens`. What
was actually adopted:

- **Naming radii for what they sit on** rather than by t-shirt size —
  `radius-card`, `radius-button`, `radius-list-item`. `rounded-card` carries a
  decision; `rounded-lg` carries none. This is the single best idea in the
  package. Daybook took the naming and kept its own values.
- **Naming type steps for the job** — `caption`, `body`, `subtitle`, `header` —
  so a call site says what it is instead of how big it is.
- **A hard ceiling of three font weights.**
- **The system font stack**, with its reasoning (below).

What was deliberately **not** taken:

- **The colour tokens.** All 381 of them, but the shape is the problem, not the
  size: Todoist spends green on *today* and red on *overdue*, where Daybook
  reserves green for *completed*. Adopting their schedule palette would break
  the one colour rule this app has.
- **Their spacing scale**, because Daybook already had it. Doist's
  4/8/12/16/24/32 is exactly Tailwind's default 1/2/3/4/6/8, so aliasing it to
  `p-medium` would only give every value a second name. The scale was never the
  problem — the fractional steps between its rungs were.
- **`px` units.** Doist pin their type scale in px; Daybook's is in `rem` so it
  responds to a browser font-size change instead of ignoring one.
- **Their `hiddenVisually`**, which was checked and is weaker than Tailwind's
  `sr-only` — no `position`, no `overflow`, no clip fallback.

One convention worth stealing later, not taken yet: Doist use `aria-disabled`
rather than the HTML `disabled` attribute for soft-disable, which keeps the
control focusable and lets a screen reader say why it is inert. See §12.

#### The type scale grew a seventh step, and `welcome.ts` was exempted

Finishing the type migration on 26 Aug turned up sizes the six steps had no
answer for. The first survey missed them, because grepping for `text-sm` and
`text-xs` does not find `text-base`, `text-lg`, `text-xl` or `text-3xl`.
**Inventory by grepping for the whole family, not for the two classes you
expect.** Same mistake in kind as transcribing Doist's radii before counting
Daybook's own.

Two populations, decided separately:

- **30px, three sites in the app** — the login wordmark and the two reporting
  figures. Given a seventh step, `text-display-lg` at 1.875rem. A rename, not
  a visual change: nothing moved on screen. The alternative was folding them
  to 24px, which would have shrunk two surfaces to protect a round number, and
  the visual pass is Noel's with references, not a side effect of tokenising.
- **44–60px, all on `welcome.ts`** — the marketing hero, its closer at 30/36px
  and its 18px subhead. **That file is exempt from the UI scale and is the only
  file that is.** A landing page needs a register the app never uses; the
  alternative was four more `@theme` steps used once each on one screen, which
  would have made the scale a list of everything rather than a set of choices.
  The exemption is written into the file's own header comment so it cannot be
  read as an oversight. Everything on that page doing a UI job is on the tokens.

`text-subtitle` and `text-header` stopped being dead tokens without anything
being restyled to suit them: `task-detail.ts`'s title was already exactly 20px,
and `capture.ts`'s textarea already exactly 16px.

**`capture.ts` keeps `leading-6` beside its type token, deliberately.** The
mirror `div` and the `textarea` must share an identical line box or the syntax
highlight drifts off the text by a fraction of a line per row. `text-subtitle`
carries a unitless 1.4 (22.4px); `leading-6` pins both to an integer 24px. It
is the one place a `leading-*` next to a type token is correct rather than a
mistake, and it is commented in place. Verified on screen: both elements report
16px/24px, identical bounding rects and identical `scrollHeight` across a
three-line wrap.

#### What the accessibility pass actually found

Four real defects, not nits. The per-component work was already careful —
`aria-pressed` on the checkbox, `aria-label` on every icon button, the capture
mirror `aria-hidden`, the calendar cells labelled, the toast a live region.
Everything below is cross-cutting, which is exactly the kind nobody adds by
default.

- **`text-ink-500` and `text-ink-700` were dead classes.** Neither token
  existed in `@theme`, so Tailwind emitted no rule for them at all and the
  eleven elements using them — across the shell, calendar, upcoming and task
  detail — silently inherited their parent's colour with hover states that did
  nothing. Both are now defined. **A colour class that names a shade not in
  `@theme` fails silently; it does not error.**
- **`ink-400` failed WCAG AA.** At `#8a90ab` it was 3.15:1 on white, and it is
  the app's helper-text colour, used on nearly every page. Darkened to
  `#676d8b` — 4.74:1 on ink-50, 5.08:1 on white. It is used for text and
  nothing else, so no borders or fills moved. The old value survives as
  `ink-300` for decorative tints.
- **A completed row was faded with `opacity-60`, which took the whole row down
  with it** — text to 2.38:1, the done timestamp to 3.75:1, the energy badge to
  3.24:1. No colour choice inside the row could recover it, because the wrapper
  was washing out the badge backgrounds too. **The fade was never one of the
  four beats of the completion choreography** (`styles.css`: box fills, tick
  pops, strike draws, row re-sorts), so it was removed rather than tuned. A
  struck-through line in ink-400 on white is 5.08:1 and still plainly reads as
  finished.
- **A router navigation announced nothing and every page shared one title.**
  `core/page-title.ts` is a `TitleStrategy` that does both jobs: it sets
  `<page> · Daybook`, and it writes the page name into a signal that `App`
  renders in a visually hidden `aria-live="polite"` region. That region lives
  outside the router outlet on purpose — **a live region that unmounts and
  remounts is not announced at all.**

Also added: one global `:focus-visible` ring in `@layer base` (brand-500 clears
3:1 on both surfaces the app uses — 4.45:1 on white, 4.01:1 on ink-900), a skip
link past the drawer's five links, `<main>` on the two pages outside the shell,
and `aria-pressed` on the energy filters, which the category chips already had.

**The focus ring is in `base`, deliberately.** Three elements draw their own
focus treatment with `outline-none` plus a ring; a utility has to be able to
win against the global rule or they would each get two rings.

**Hosting is Vercel, not Netlify.** Netlify was a placeholder written before
Noel had said what he actually uses. The output is entirely static — every
piece of server-side work already lives in Supabase, so there is no SSR, no API
route and no edge compute to weigh. All three hosts serve it identically, which
makes the tiebreaker the workflow already in place: projects on Vercel, DNS on
Cloudflare. Cloudflare Pages would put hosting and DNS in one account, but
would also put this one project somewhere different from everything else Noel
owns, for no technical gain.

**Cloudflare stays DNS-only in front of Vercel — grey cloud, not orange.**
Proxying Cloudflare in front of Vercel stacks two CDNs and causes certificate
and cache-invalidation trouble; Vercel terminates TLS itself. Cloudflare
remains registrar and DNS, which is all it is wanted for here.

**`vercel.json` no-caches the service worker control files.** `ngsw.json` and
`ngsw-worker.js` are **not** content-hashed, so if either is cached the
installed PWA never learns a new build exists and silently serves whatever was
live the day it was installed. That failure is near-impossible to diagnose from
a phone, and it would have poisoned the push testing specifically. The
hash-named `chunk-*`, `main-*` and `styles-*` files take `immutable` instead.
Vercel checks the filesystem before rewrites, so the catch-all SPA rewrite does
not shadow any of these real files.

**Public keys stay in `environment*.ts`; they are not moved to host env vars.**
GitHub secret scanning flagged the repo on 22 Aug. The finding was the real
legacy **anon** key, committed as a fixture in `auth.test.mjs`. Nothing
privileged had leaked — a scan of every commit in history found no service role
key, no `RESEND_API_KEY` and no VAPID private half, and `schedule-notify.sql`
still holds its placeholder. Moving `supabaseUrl`, the `sb_publishable_` key or
the VAPID public key into Vercel environment variables would buy **nothing**:
Angular inlines them at build time, so they ship in the bundle and are readable
from devtools either way. It would hide them from GitHub while still serving
them to every visitor — the same exposure plus a false sense of having fixed
it. **RLS is the control**, and the security advisors report no missing-policy
errors. The two `SECURITY DEFINER` warnings are `ensure_user_setup` and
`rollover_and_snapshot`, both intended: each derives `v_uid := auth.uid()`,
bails on null, and revokes `anon` in `0002`.

**The fix was to fabricate the fixture and revoke the legacy keys, not to
rewrite history.** `auth.test.mjs` now builds its anon token with a fake
project ref; the guard only reads the `role` claim, so all 12 checks are
unchanged. The real key remains in git history, and rewriting `master` for a
public-by-design value is disproportionate — instead the legacy JWT API keys
are disabled in Supabase, which kills the exposed token outright. Nothing in
the stack used them, checked rather than assumed: the client is on
`sb_publishable_…`, `notify` is on `sb_secret_…`, and the live `daybook-notify`
cron job's command text was confirmed to carry an `sb_secret_` key and no
legacy JWT — the one place a hand-pasted legacy key could have hidden and
broken the digest silently on revocation.

**Actually disabled 22 Aug at 23:50:46Z**, and verified after the fact rather
than assumed. The key in git history now returns `401 Legacy API keys are
disabled`; the publishable key still returns `200` on the Data API and
`/auth/v1/settings` still advertises Google, so the sign-in path is intact. Two
things worth keeping:

- **Disabling propagates to the edge in under 90 seconds, not instantly.** The
  control plane reported `disabled: true` while the data plane still served the
  legacy key `200`. If a revocation looks like it did not work, re-check before
  touching anything.
- **`notify`'s `SUPABASE_SERVICE_ROLE_KEY` was already a modern key**, provable
  without reading it: an `sb_secret_…` token is opaque, so `hasServiceRoleClaim`
  cannot pass it and only the exact match at `auth.ts:57` can — and the guard
  was passing. The post-revocation tick was then confirmed directly by running
  the cron's own command through a `do` block (which executes it without
  printing the key): `200`, both branches clean.

**Capture gets manual controls, and they rewrite the text rather than holding
their own state.** Decided 22 Aug. Typing is a fast path for people who already
know the syntax; it cannot be the *only* path. But the fix is not a parallel
form. Every control writes its token into the textarea, so `value()` stays the
single source of truth and the chips remain a pure render of `parsed()`. That
avoids two states per field and a conflict rule for each — the date picker
already needed one, at `capture.ts:243`, "a date typed after the picker was
used is the newer intent, so it wins" — and it leaves `toCaptureText()`
round-tripping unchanged for the edit flow. It also teaches: the user watches
`#physio` appear in the box and learns the typed form for next time.

**The real defect is discoverability, not the absence of controls.** The date
chip is always visible and already opens a full picker. The category and energy
chips are `<span>`s that render *only once the text has parsed a token* — so a
new user cannot discover that categories or energy exist at all. Four chips,
one idiom, all always visible with placeholders when unset. **Chips only, no
second labelled-field form**: two parallel input UIs would be two things to
maintain and would undercut the premise of the app.

**The Supabase redirect allow list carries a preview wildcard.** Every Vercel
push mints a new preview URL, and Supabase silently rejects a `redirectTo` that
is not on the list — the symptom is a bounce back to login with no error. For a
single-user app the wildcard costs nothing and removes a confusing failure mode
while the device testing is in progress.

### The capture chip controls, 22 Aug

**A chip control replaces every token of its kind, not just the first.**
`parseCapture` honours only the first `#tag` and the first `!energy`
(`categorySlug ??= slug`). Replacing just the first would leave a second one in
the box, highlighted like a chip by the mirror div, meaning nothing — the UI
would be lying. So `writeToken` collapses all tokens of the kind into the one it
writes. This was one of the two details left open on 22 Aug; it is a correctness
constraint, not a preference.

**Tokens append after the task text, never at the cursor.** `toCaptureText`
already emits `text #tag !energy` in that order, so appending is what an edit
box round-trips to. A token dropped at the cursor would land mid-sentence and
the same task would look different after a save-and-reopen. The second open
detail, settled the same way: by what the existing code already guarantees.

**The caret is preserved across a chip write, not pushed to the end.** It falls
out of appending: the user keeps typing in front of the trailing token instead
of inside it. `writeToken` returns the caret alongside the text, and `setToken`
sets the DOM value itself rather than waiting for the `[value]` binding —
change detection lands a frame later and the browser drops the caret to the end
in between, which is visible as a jump.

**A `Popover` shell in `shared/`, not a third copy of the dismiss logic.** The
date picker's backdrop-button trick (a real `<button>` covering the viewport
rather than a document click listener, which would otherwise fire on the very
click that opened the panel) was about to be pasted twice more. It is now one
component owning dismissal and focus; positioning stays with the caller, so two
popovers can sit under two different chips without fighting.

### The signed-in accessibility sweep, 22 Aug

**Today splits into open work and a `Done today` section.** It was built to fix
a real bug: `scene="clear"` — "All clear for today." — was **unreachable**.
The empty state only rendered when the list was empty *and* something had been
completed, but completed rows stayed in that same list, so an empty list could
only ever mean an empty day and `blank` took its place. The one other way to
empty the list is a filter, which `filtered` claimed first. Splitting the list
is what makes the finished-day state expressible at all, and finishing the day
is the moment the app should feel best. Noel chose this over deleting the dead
branch.

**The `Done today` section is expanded by default, and that is load-bearing.**
Completing a row now unmounts it from the open list and mounts it in the done
list; the fourth beat of the choreography is the browser FLIPping it between
the two. Collapsed by default, the row would vanish instead of travel, which is
the "hidden rather than unmounted" failure `AGENTS.md` warns about.

**`filtered` now requires that the filter hid *everything*.** With the list
split, a filter can leave nothing open but still match something done. The
condition is `filtered() && doneTasks().length === 0`, so a day whose only
matching task is finished reads as finished rather than as "nothing matches".

**The composer traps Tab.** It is modal — scrim, Escape, explicit Cancel — but
22 elements behind it stayed tabbable, walking a keyboard user out into a list
dimmed to 20% with nothing to tell them they had left. An open popover renders
inside the panel, so its options join the cycle with no extra bookkeeping.
Verified by dispatching Tab at both ends: it wraps, and it leaves middle tabs
to the browser.

### The iOS install hint, 22 Aug

**The hint draws the Share glyph instead of naming it.** "Tap Share, then Add
to Home Screen" is the instruction that had already failed once — the control
is an icon with no label, sitting in a toolbar, and recognising it is the whole
difficulty. The banner renders the same glyph inline in the sentence, with an
`sr-only` "Share" beside it so the text still reads aloud correctly.

**It is iOS only, not a general install banner.** Android and desktop Chrome
fire `beforeinstallprompt` or offer an address-bar control, so a banner there
is something to close rather than something to learn. iOS offers nothing at
all, which is why it is the one platform that needs telling.

**`isStandalone` moved into `core/install.ts` and `Push` now calls it.** The
banner and the push toggle both hinge on "is this the installed app", and two
copies of that check would eventually disagree — the toggle offering itself
while the banner still nags, or the reverse. One definition, two callers.

**iPadOS 13+ reports itself as a Mac**, so the user agent alone misses every
iPad. The test is a touch-capable `MacIntel`, since no Mac has a touchscreen.
This is covered by a unit test because it is exactly the kind of check that
silently stops working and nobody notices until an iPad user never sees it.

### Swipe on a real thumb, 22 Aug

**A pointer-driven `transform` must set `transition: none`, not `''`.** The row
juddered the whole way through a swipe on an iPhone. The directive was setting
its inline transition to the empty string while dragging, which *removes* the
inline property and hands the row back to its class — and the row carries
Tailwind's `transition` shorthand, which includes `transform` at 150ms. So
every `pointermove` set a new offset the browser then animated toward, and the
next move 16ms later restarted it from wherever it had reached. The row lagged
the thumb and shook. It is now `none` while dragging, the snap-back is the only
animated part, and `settling` is released on a timer so the row gets its own
hover transitions back afterwards. `translate3d` replaces `translateX` to keep
the card, its shadow and its ring off the repaint path.

**This was invisible on a desktop and always would have been.** The gesture is
touch-only by design, so no amount of clicking would have found it. It is the
argument for the device pass rather than a note about one bug.

**Swipe is disabled outright on a finished row.** It used to drag, reveal a
"Tomorrow →" backing, arm at the commit point and then do nothing, because
`onSwipe` has always guarded the push with `!done()`. A gesture that promises an
action and silently declines is worse than one that does not move. The guard
stays where it is, because it is the guard that keeps history honest — a
completed task pins `scheduled_date` to the day it was finished and
`day-detail` reads that pin to say what the day amounted to, so pushing a done
task would rewrite the past. The backing labels are no longer rendered there at
all, and the desktop push button was already hidden by the same condition, so
the two paths finally agree.

**A contrast failure can come from an ancestor, not a token.** The push button
in `task-row.ts` was `text-ink-400 opacity-60` — a compliant token faded to
2.38:1. Every colour *pair* the app uses passed when checked in isolation on
21 Aug, which is exactly why this survived: the defect was in the composite,
not the palette. It is the same `opacity` trap that Phase 6 found on completed
rows, in a second place. De-emphasis is now `ink-400` → `ink-600` on hover,
by colour alone. **Audit the rendered stack, not the token list.**

**Kanban / board view with configurable statuses.** Considered and rejected. It
pulls the app toward being a project tracker when the premise is a daily log,
it requires a status table, drag and drop, fractional index ordering and a
separate mobile interaction path, and every extra column is somewhere tasks go
to sit for weeks.

**A "someday" bucket for tasks with no date.** Rejected deliberately.
`scheduled_date` is required on every task, which forces a decision at capture
time. This is friction by design. Revisit only if it becomes a real reason to
stop using the app.

**The Magic Plus draggable FAB.** Dropped on 18 Aug, having been a §5.1
signature interaction since the brief. Noel's call, and the reason is that a
control you drag onto a target is more work to use than a button that opens a
composer — it asks the user to aim where a tap would do. The floating composer
from `quick-add--composer-to-toast.mov` answers the same question (where does
adding a task start) with less. Its most distinctive drop target, a calendar
cell, was blocked on Phase 4 anyway. Reversal reasoning in §9.

**Priorities, saved filters and task assignment.** Not rejected before because
they were never proposed; visible in `nav--filters-and-labels.png` and worth
naming so the capture does not read as an endorsement. P1–P4 has no column and
duplicates what `energy` already does more usefully. Saved filters need a query
builder to be worth anything on a one-week horizon. Assignment needs a second
user, and this is a personal app. The category list in that screenshot's
sidebar is the part worth having, and it is part of the nav shell.

---

### The redesign that was dropped, 25 Aug

**A ground-up redesign was explored and abandoned inside one session.** Noel
opened with claymorphism in mind, read the case against it, dropped it, asked
for alternatives, and dropped those too. Recorded because the next agent will
otherwise re-run the same conversation.

**Claymorphism was costed and rejected, not refused.** The objection was never
taste. It collides with three things the app has already paid for: the contrast
work — clay reads through low-contrast tonal steps, and `ink-400` was tuned to
4.74:1 the hard way; density — a list app that fits five rows on a phone
instead of eleven has regressed while looking polished; and paint cost — large
soft shadows on rows that carry `view-transition-name` get rasterised into the
snapshot on every completion, which is the one interaction the app is built
around. The workable version was clay restricted to actionable objects only,
so depth means "you can act on this" and two elements carry a shadow instead of
twenty. Noel dropped the direction before choosing.

**Three alternatives were drafted and none was taken.** The Ledger — a daybook
is the book of original entry, so carried work becomes structure, opening the
day under a *brought forward* rule instead of wearing a badge. The Instrument —
no brand hue at all, so green and red are the only colour on screen. Nocturne —
a deep blue-violet field as the identity. Contrast was verified for all three
before proposing; Nocturne's numbers are the interesting ones, because on a
dark field the semantic colours invert: `done-500` reaches 6.50:1 while
`done-700` falls to 3.01:1 and `late-700` to 2.55:1, and the 700 shades are
currently the *text* shades. **A dark theme is not a repaint of this app.**
That holds whenever dark mode is next raised.

**The look will be adapted from references rather than designed from a brief.**
Noel's call. He will collect designs and typefaces and bring them; the change
is expected to be colour and type inside the existing layout. Nothing about the
directions above is committed.

**Design tokens come before any visual change.** Repainting on top of ad-hoc
spacing repaints the ad-hoc spacing. §4.

**The safe-area utilities bake the spacing step into the name.** `safe-py-6`
means 24px plus the notch inset and owns both paddings on that axis; there is
no `py-6` beside it to drift out of sync. The alternative — a `safe-pt`
modifier sitting next to whatever `py-*` the element already had — repeats the
number in two classes and quietly breaks the day one of them changes. Baking it
in costs one rule per step actually used (2, 4, 5, 6) and makes a wrong pairing
unwriteable rather than merely discouraged. `safe-py-5` exists only because the
`/welcome` header was already off the documented scale; it goes when the §12
spacing cleanup reaches that file. 2 Sep.

**The sign-out navigation lives in `onAuthStateChange`, not in `signOut()`.**
Every way a session can end — the button, another tab, a revoked or expired
token — comes through that one callback, and all of them left the same stale
page up. Putting it in `signOut()` would have fixed the button and left the
other two. It is guarded on a real signed-in→signed-out transition because the
same callback fires `INITIAL_SESSION` with a null session for every signed-out
visitor, and navigating on that would throw anyone deep-linking to `/login`
over to `/welcome`. 2 Sep.

### The multi-tenancy audit, 3 Sep

**The schema was audited before anything was built on top of it, not after.**
Multi-tenancy had been deferred four times with "RLS covers it" as the reason,
which was a claim nobody had checked against the live database. Checking it
first turned out to be the cheap move: the claim was true, so no schema work is
needed, and the day was spent finding the four things that are actually broken
instead of rewriting policies that were already correct.

**Nothing was changed during the audit, deliberately.** Read-only throughout —
`execute_sql` for inspection, no migration, no deploy. A schema audit that
fixes as it goes cannot say what the state *was*, and the whole value here is a
trustworthy baseline to plan against. The fixes are Phase 7's job.

**The live database is the source of truth, not these migrations.** Every
finding was read from `pg_catalog` and the advisors. It agreed with the repo
everywhere except the six-vs-four migration count, which is a known
consolidation, and the live `rollover_and_snapshot` body having lost its inline
comments to a `create or replace`. Worth repeating as a habit: `0002_rpcs.sql`
is a *reconstruction* of what ran, not a record of it.

**`force row level security` stays off.** It is the obvious hardening reflex
and it is wrong here. The tables and all seven `SECURITY DEFINER` functions are
owned by `postgres`, so FORCE would break every function rather than protect
any of them. The real mitigation is to treat those seven bodies as
access-control code — see §4 Phase 7 and §6.

**One tenant's data must never be able to break another tenant's job.** That is
the general form of the timezone bug and the rule to design against from here:
`due_digests` evaluates every user's row inside a single statement, so one
unparseable value aborts the lot. Anything the cron reads across all users
needs either validation at the write or per-row isolation at the read. Both,
for the timezone.

**The audit stopped at the database, and the client half was worse.** The
schema came out clean; the Angular side produced C1, a live cross-tenant
delivery leak. The lesson is not that one audit was better than the other but
that **"is this multi-tenant" is not a database question.** The three worst
findings across both halves — C1, C2 and blocker 1 — are all in code that runs
*outside* RLS: a service-role cron, a `localStorage` key, and a single
statement over every user's row. RLS answers "can A read B's rows", which was
never the hard part. Audit the paths where RLS is not in the loop.

**Signup is invite-only until the isolation is proven.** Noel's call, 3 Sep.
The alternative was opening properly at the same time as fixing, which drags
the Resend paid plan, ToS and privacy pages, account deletion and abuse
rate-limiting into Gate 0 and makes the isolation fixes ship later, not sooner.
Invite-only gets a real second account onto the system — which is the only way
C1, C2 and `loadedFor` get verified at all — without owing anyone a service.
The mechanism is the Auth dashboard's "Allow new users to sign up" toggle, not
`shouldCreateUser: false` in the client: the client flag covers only the
magic-link path and leaves Google OAuth open, which is the failure mode where
you believe signup is closed and it is not.

**The app moves to a subdomain of a domain Noel owns**, with a separate
sending subdomain for Resend. Two blockers collapse into one prerequisite: the
custom origin retires the redirect wildcard (C3), and the verified sender
unblocks both the digest (blocker 2) and custom SMTP for magic links (C4). The
sending subdomain is kept distinct from the app's so a deliverability problem
can never reach the root domain's reputation.

---

## 11. Backlog

Not core. Revisit once the main app is solid.

- **Receipt / attachment upload per task**, e.g. a receipt photo on an
  expense-related task. Uses Supabase file storage.
- **Native app wrap.**

---

## 12. Known gaps, deliberately deferred

- ~~`ensure_user_setup` fires twice on every page load.~~ **Closed 22 Aug.** It
  was a race, not a duplicated call site: `getSession().then()` called
  `ensureSetup()` **unconditionally**, while `onAuthStateChange` fired
  `INITIAL_SESSION` separately and called it again. Their order is not
  guaranteed, so whichever landed first, both saw a session. `ensureSetup` now
  latches on the user id and runs once per page load, clearing the latch on
  failure so an error still retries. Verified by counting requests over two
  cold loads: one `ensure_user_setup` to one `rollover_and_snapshot`, where it
  had been two to one.
- ~~A rollover failure is invisible to the user.~~ **Closed 22 Aug.** It now
  toasts `Could not carry unfinished tasks over.` The failure was never
  cosmetic: yesterday's unfinished work stays on yesterday, so Today looks
  emptier than it is and nothing distinguishes that from having finished it.
  **Offline stays silent**, per `AGENTS.md` — rollover runs on every open
  including the ones with no connection, it is retried on the next one, and
  there is nothing the user could do. Still unexplained: `rollover
  failed` plus `InvalidStateError: Transition was aborted` were seen once on a
  genuinely cold first load on 21 Aug and never reproduced across four reloads.
  **Lead, 22 Aug:** `InvalidStateError: Transition was aborted because of
  invalid state` fires on **every** dev-server hot reload, not once — so it is
  reproducible after all, and it is `withViewTransition()` losing its
  transition when the document is replaced mid-flight. That makes it a likely
  cause of the 21 Aug sighting rather than a coincidence beside it. It has not
  been seen in a production build.
- ~~A row's carried badge is dropped the instant it completes.~~ **Closed
  22 Aug, Noel's call: the count survives.** Finishing something carried four
  times is the win, and the badge is the only thing on the row that says so —
  it matters more now that completed rows sit in their own Done today section.
  **It goes neutral once done**, though: the badge escalates to `late-100/700`
  at three or more carries, and red is reserved for overdue or badly avoided.
  A finished task is neither, and keeping the escalation would read as a
  reprimand for work that had just been done.
- ~~Toasts and the composer centre on the viewport, not the content column.~~
  **Closed 22 Aug.** The offset was **120px**, not the ~112px estimated here —
  exactly half the 240px sidebar. Measured, not eyeballed: content column
  centre 871.1, composer centre 751.1. Both now carry `lg:left-60`, which the
  compiled CSS puts inside `@media(width>=64rem)` alongside `.lg\:hidden` and
  `.lg\:translate-x-0` — the same rules that hide the sidebar, so the inset and
  the sidebar can never disagree. Re-measured after: offset 0.
- **The digest sends from a shared Resend address.** `DIGEST_FROM` is
  `onboarding@resend.dev`, which Resend only delivers to the account owner. It
  works for Noel and for nobody else. A verified domain is the fix, and it is
  not urgent while Daybook has one user. **Deliberately left, 22 Aug** — but
  note it is a **hard blocker for multi-tenancy**, not a nicety: a second user
  would silently never receive a digest. Raise it again there.
  **Worse than logged, 3 Sep.** It is not a silent nothing. `index.ts` skips
  `mark_digest_sent` on any failed send, so a rejected user is re-selected by
  `due_digests` on every five-minute tick for the rest of their local day, for
  ever — 288 failed sends a day, each one burning the Resend quota. §4 Phase 7,
  blocker 2.
- ~~The digest's "Yesterday you finished" section has never rendered.~~
  **Closed 22 Aug.** The 07:00 digest arrived with subject `Daybook — 2 on
  today, 1 done yesterday` and rendered `Yesterday you finished 1 · call
  doctor` above the two tasks on today. Both branches of the digest template
  are now proven against a real inbox, and `completed_yesterday` keying off
  `scheduled_date = yesterday` is confirmed correct.
- ~~Web Push has keys but has never sent anything.~~ **Closed 22 Aug. The wire
  format is proven.** Daybook was installed to an iPhone home screen from the
  Vercel deployment, the Settings toggle subscribed, and
  `user_settings.push_subscription` took an Apple endpoint
  (`web.push.apple.com`, `p256dh` 87 chars = a 65-byte P-256 point, `auth` 22
  chars = 16 bytes — both correct). A reminder on `call the doctor` set for
  09:12 Sydney was delivered by the 09:20 tick: `{"reminders":{"sent":1,
  "failed":0}}`, `reminder_sent_at` 09:20:02. **RFC 8291 encryption and RFC
  8292 VAPID signing, hand-written on Web Crypto, were accepted by Apple on the
  first real attempt.** The notification rendered on the lock screen and
  tapping it opened `/today/<id>`, so the `onActionClick` /
  `navigateLastFocusedOrOpen` payload is proven too — the one part that would
  have failed silently even after a successful send. Installed via Chrome on
  iOS, which produces a genuine standalone PWA — Safari is not required.
- ~~A transient auth failure abandons the whole reminders batch.~~ **Closed
  22 Aug, deployed as `notify` v8** with `verify_jwt` left true — `auth.ts`
  depends on that being true for its JWT-claim branch, and deploying with it
  off would make that half forgeable. Both `due_digests` and `due_reminders`
  now go through `readDue`, which retries twice at 200ms and 600ms before
  giving up — the bug was in **both** halves, not only reminders as recorded
  here. The per-row `try`/`catch` inside the send loop was already there, and
  `Promise.allSettled` in the handler already kept a digest failure from
  taking reminders with it; the unguarded call was the "what is due" read that
  runs before either loop. Original finding: the
  `throw new Error(\`due_reminders: ...\`)` killed every reminder that tick,
  not just one row. Seen live: the
  09:15 tick on 22 Aug returned `401 JWT issued at future` — clock skew between
  the token issuer and PostgREST — while 09:05, 09:10 and 09:20 all returned
  200. **It self-healed**, because `due_reminders`' 15-minute grace window is
  wider than the 5-minute tick, so the next tick still found the row; the
  window was written for a missed tick and caught this for free. With one user
  that is invisible. With fifty, one transient 401 delays everybody. A per-row
  try/catch, or a retry on the RPC, is the fix.
- **Web Push and VAPID need explaining to Noel properly.** Agreed on 21 Aug to
  hold this as a discovery step at the end of the build rather than expand on
  it mid-flight.
- ~~The cron is not scheduled.~~ **Closed 21 Aug.** `daybook-notify` is job 1,
  `*/5 * * * *`, active, calling `notify` with the service role key. First
  clean tick 12:05 UTC: `{"digests":{"sent":0,"failed":0},"reminders":
  {"sent":0,"failed":0}}`. Nothing is left waiting on a human for the digest.
- ~~No hosting, no CI, not deployed anywhere.~~ **Closed 22 Aug. Daybook is
  live at `https://daybook-bay.vercel.app`** — Vercel appended `-bay` because
  `daybook.vercel.app` was taken. Verified against the running deployment, not
  assumed: `/today` returns 200 HTML so the SPA rewrite applies, `ngsw.json`
  and `ngsw-worker.js` both come back `no-cache`, the hashed bundles come back
  `immutable`, and it serves from `syd1`, the same region as the database.
  **Everything blocked on HTTPS is now unblocked** — push, swipe, the offline
  queue and the signed-in a11y sweep. No CI beyond Vercel's build on push.
- ~~Swipe and the offline queue are the last unverified features.~~ **Swipe was
  exercised on Noel's iPhone, 22 Aug, and it works** — the first time any touch
  device has touched it. It found two defects, both since fixed; see §9. **The
  offline queue is now the last unverified feature.**
- ~~**Swipe thresholds are guesses.**~~ **Closed 25 Aug.** The four constants
  in `shared/swipe.ts` were reasoned, not measured, because the Todoist iOS
  captures the plan called for were never taken. They stay unmeasured, but Noel
  used the gesture and called them fine, so they are settled by judgement
  rather than left open.
- **The initial bundle budget was raised from 500 kB to 560 kB** to take the
  router features and five new pages. Actual initial total is 527 kB after
  Phase 6. Every page lazy-loads; the growth is in the shared vendor chunk.
- ~~The accessibility pass was verified on `/welcome` and `/login` only.~~
  **Closed 22 Aug. Every signed-in page has now been swept in situ**, driving
  the user's own Chrome so the audit had a real Supabase session — which is
  what had blocked it since 21 Aug. `/today`, `/upcoming`, `/calendar`,
  `/calendar/:date`, `/reporting`, `/settings` and `/today/:id` all return
  **zero contrast failures** by the same canvas-compositing method. Found and
  fixed one real failure the isolated check could not see, because it came from
  an ancestor and not from a token: see §9. **The skip link has been seen**, and
  it lands focus on `MAIN#content`. Three of the four empty states have been
  seen rendered — `filtered`, `quiet` and `clear`; `blank` is reachable but was
  not forced. **The popover keyboard paths are sound**: `closeCategory` /
  `closeEnergy` / `closePicker` each restore focus to their own chip, so
  Escape does not strand anyone, and choosing a value hands the caret to the
  textarea by design. That answers the question left open on 22 Aug.
- **The task rows in the live project are test data**, confirmed by Noel on
  22 Aug — `call the doctor`, `call the agent`, `call physio`, `buy tomato` and
  the completed rows are all fixtures, not his real to-dos. Clicking through the
  signed-in app is therefore cheap: add, complete and reschedule freely instead
  of falling back to read-only checks, which is what made the 22 Aug
  verification slower and more cautious than it needed to be. This does **not**
  make writes free — `day_snapshots` and the rollover counters are the evidence
  base for §7, and a wrecked snapshot costs the next rollover verification.
- **The `ink-300` token is declared but unused.** It holds the old `ink-400`
  value for decorative tints. Nothing needs it yet; it exists so the next
  person reaching for a light grey does not reach for the text colour.
- **The Todoist captures are still the wrong device.** Every reference is the
  web app driven by a mouse. Completion motion no longer needs them; swipe
  still does. See `docs/reference/todoist/NOTES.md`.

---

- ~~**Inter is never loaded, and never has been.**~~ **Closed 25 Aug**, by
  making it true rather than by fetching Inter. `--font-sans` now names the
  system stack every screen was already rendering in, with `'Segoe UI'` ahead
  of `system-ui` so Windows CJK locales do not swap the Latin glyphs. §9.
- ~~**Spacing and radii are ad hoc.**~~ **Closed 25 Aug.** Scales for spacing,
  radius, type and weight are declared in `@theme` and ruled in `AGENTS.md`.
  Radius was migrated app-wide the same day; **type followed on 26 Aug** and is
  now app-wide too, seven steps with `welcome.ts` the single documented
  exemption (§9). No off-scale text size survives on a signed-in surface.
- **`welcome.ts` and `login.ts` were not seen on screen after the type
  migration.** Both are signed-out surfaces and `/welcome` redirects to
  `/today` for a signed-in session, so the 26 Aug verification pass could not
  reach them without signing Noel out. They build, and their diffs are renames
  plus two deliberate 1–2px changes — the nav wordmark 15px→14px to match
  `shell.ts`, and the demo capture line 18px→16px to match the real
  `capture.ts`. Worth one look next time either is open.
- **Fractional spacing survives outside the four core surfaces.** Counted
  26 Aug: **54 sites**, led by `mt-0.5` ×18, `py-1.5` ×10, `py-0.5` ×5 and
  `px-2.5` ×5, on the pages the 25 Aug spacing sweep did not reach. The type
  migration deliberately did not touch them — one rule at a time across a
  twelve-file diff is reviewable, two is not. Note that the `mt-0.5` count
  includes the one sanctioned optical-alignment exception in `task-row.ts`, so
  the real question is what the other 17 are doing.
- **Disabled controls are faded with `opacity`.** Eight or so `[disabled]`
  sites carry `disabled:opacity-30`, `-40` or `-50` — `settings.ts`,
  `capture.ts`, `upcoming.ts`, `login.ts`, `date-picker.ts`. That is the exact
  pattern the Colour rule in `AGENTS.md` bans for de-emphasis, and at 30% a
  control is far under AA. Found 25 Aug while evaluating Reactist, which uses
  `aria-disabled` over the HTML attribute so the control stays focusable and
  can say why it is inert. Not fixed: `composer.ts`'s focus trap filters on
  `hasAttribute('disabled')` and would need to change with it.
- ~~Sign-out left the signed-in page up until a manual reload.~~ **Closed
  2 Sep.** `authGuard` is a `CanActivateFn`, so it only evaluates on a
  navigation; clearing the session while sitting on `/today` re-ran no guard.
  The reload appeared to fix it only because it rebuilt every store from cold
  and re-entered the guard. The navigation is now pushed from
  `onAuthStateChange` in `session.store.ts`, which covers the button, a
  sign-out in another tab and a revoked or expired token in one place, guarded
  on a real signed-in→signed-out transition so `INITIAL_SESSION` does not throw
  a signed-out visitor off `/login`. Confirmed working by Noel.
- ~~Every header lost its top padding on desktop.~~ **Closed 2 Sep.** See §13:
  `.safe-top` was unlayered and beat `py-*`. Replaced by `safe-py-*` /
  `safe-pb-*`, which own the axis and add the inset. Twelve call sites.
  Verified on screen at 24px across `/today`, `/upcoming`, `/calendar`,
  `/reporting`, `/settings` and 16px on the drawer; **the iOS half is
  unverified on device** — the calc is additive by construction but no notched
  screen has been looked at since the change.
- **A second user signing in on the same page load inherits the first one's
  data.** Latent until 2 Sep, when sign-out started navigating without a
  reload; before that a reload always sat between two sessions and rebuilt the
  stores. `TaskStore` and `SettingsStore` now track `loadedFor` (a user id)
  beside `loaded` and refetch when it changes. RLS meant this was never a data
  leak on the server, only the wrong rows on screen. **Not verified** — it
  needs two accounts and one was not to hand.
- **`user_settings.timezone` is unvalidated text, and one bad value stops the
  digest for every user.** Found 3 Sep. Not deferred by choice — it was not
  known. The full mechanism is in §4 Phase 7, blocker 1; it is the highest
  priority thing in the repo.
- **The service role key is stored in plaintext in `cron.job.command`.** Found
  3 Sep. Readable by anything that can query `cron.job` as `postgres`. Vault
  plus a rotation is the fix. §4 Phase 7, blocker 4.
- **`SettingsStore.load()` races `ensure_user_setup` on a brand-new account.**
  Found 3 Sep. A bare `.insert(seed)` against `user_settings_pkey`; the loser
  toasts *"Could not create your settings."* Cannot fire with one existing
  user, will fire on real signups. §4 Phase 7, blocker 3.
- **A device clock a day fast permanently corrupts that day's history.** Found
  3 Sep. `rollover_and_snapshot` clamps to `v_server + 1` and then snapshots a
  still-running today, which `on conflict do nothing` can never correct.
  Per-user, no cross-tenant effect. §4 Phase 7, item 10.
- **A task can point at another user's category.** Found 3 Sep, and left: the
  FK carries no `user_id`, so the reference is accepted, but RLS still blocks
  the read and nothing leaks. §4 Phase 7, item 12. **Inferred, not verified** —
  confirming it needs a write, and the audit was read-only.

## 13. Platform constraints and gotchas

### Tailwind scans Markdown, including this file

Tailwind v4 scans the whole project for class names, and that includes
`AGENTS.md` and `BUILD-PLAN.md`. Both name utility classes in prose in order to
say when *not* to use them, which was enough to emit real rules for
`rounded-lg`, `rounded-xl` and `rounded-2xl` into the stylesheet on the very
commit that removed the last of them from the app — 0.63 kB of CSS generated
purely by documentation, resurrecting classes the code had just retired.

`src/styles.css` carries `@source not "../**/*.md";` to stop it. If a class
that no longer exists anywhere in `src/app` turns up in the built CSS, check
whether a Markdown file mentions it before hunting through components.


### Unlayered CSS beats every Tailwind utility

Tailwind v4 emits its utilities inside `@layer utilities`. **Any unlayered rule
in `src/styles.css` wins against all of them, regardless of specificity** — a
bare `.safe-top { padding-top: env(safe-area-inset-top) }` overrode `py-6`, and
because `env(safe-area-inset-top)` is `0px` on anything without a notch, every
header in the app rendered flush against the top of the desktop viewport while
looking perfect on the installed iPhone. Live for as long as the class existed;
found 2 Sep from the screen, not from the code.

No amount of layering fixes a case like this, because the two rules genuinely
conflict on one property and one of them has to lose. The value has to be a
sum: `calc(1.5rem + env(safe-area-inset-top))`. See §9 and `AGENTS.md`.

Two consequences worth carrying forward. **`env()` insets are zero on desktop**,
so any rule built on one is invisible in every browser the app is developed in.
And a hand-written rule in `styles.css` is not a peer of a utility — it is
above the whole system, which is why the three that remain (`.skip-link`,
`.safe-*`, the completion keyframes) are the only ones there.


### pg_cron and pg_net

- **`cron.job_run_details.status` says `succeeded` even when the HTTP call
  failed.** It reports whether the *SQL statement* ran, and `net.http_post`
  only queues a request — so it returns `1 row` and "succeeds" while the
  endpoint is returning 401. Five ticks were reported as succeeded on 21 Aug
  while every call was rejected. **Always read `net._http_response`**:
  `select status_code, content, created from net._http_response order by
  created desc limit 5;`
- **A 200 there is still not success.** `notify` catches its own failures and
  reports them in the body, by design, so a broken digest cannot take the
  reminders down. Read `content`, not just `status_code`.
- **`cron.schedule` upserts on the job name.** Re-running
  `schedule-notify.sql` replaces the existing job rather than adding a second,
  so a botched run is fixed by running it again. No `unschedule` needed.
- **The cron sends its `sb_secret_` key on `Authorization: Bearer`, against
  Supabase's own advice, and it works. Do not "fix" it.** The migration guide
  says secret keys are not JWTs and must go on the `apikey` header instead,
  because the platform tries to parse a `Bearer` value as a JWT. It works
  anyway: the gateway accepts an `sb_secret_` key on `Bearer`, and `notify`
  then authorises again in code at `auth.ts:57`, matching the bearer token
  against `SUPABASE_SERVICE_ROLE_KEY`. Moving the key to `apikey` would leave
  that match with nothing to read and 401 every tick. Verified working after
  the legacy keys were disabled, 22 Aug.
- **`notify` has `verify_jwt` ON, not off. This bullet said off until 3 Sep and
  was wrong.** The live API reports `verify_jwt: true` for `notify` version 8.
  It matters: `hasServiceRoleClaim` in `auth.ts` reads the `role` claim out of
  a JWT **without verifying its signature**, which is only safe because the
  gateway has already verified it. The function's own comment says exactly that
  — "that holds only while `verify_jwt` stays true" — so the code and this file
  had been contradicting each other for a fortnight. **Do not turn `verify_jwt`
  off.** Doing so would make the second half of `isServiceRole` forgeable by
  anyone who can write a JWT, and the exact-match branch against
  `SUPABASE_SERVICE_ROLE_KEY` is the only thing that would still hold.
- **To run the job by hand without printing its key**, execute the stored
  command instead of selecting it:
  `do $$ declare c text; begin select command into c from cron.job where
  jobid = 1; execute c; end $$;` — useful for proving a change immediately
  rather than waiting for the next five-minute tick.
- **`cron.job.command` contains the service role key in plain text**, since it
  is baked into the job definition. Never `select *` from that table into
  somewhere the key should not be. Select the columns you need, or test with
  `command like '%…%'`. The 3 Sep audit read it despite the warning, which is
  the argument for moving it into Vault rather than restating the warning —
  §4 Phase 7, blocker 4.
- **A newly created API key can be rejected as "JWT issued at future"** for the
  first minute or two, while its `iat` is ahead of some validators' clocks. Seen
  on 21 Aug: at the same millisecond, `due_digests` got a 401 and
  `due_reminders` a 200, on one client with one token. It cleared on the next
  tick with no intervention. Do not debug a fresh key for a couple of minutes.

### iOS PWA

- No automatic install prompt. Needs a custom "Add to Home Screen" hint —
  built, `shared/install-hint.ts`, and seen on a real iPhone 25 Aug.
- No Background Sync API at all. Sync on foreground only.
- Cached storage can be evicted after roughly 7 days of non-use unless the PWA
  is installed.
- Push and badging need iOS 16.4 or later.

### View Transitions

`view-transition-name` must be unique across the live DOM. When the Phase 3
detail card is showing, the list must be **unmounted**, not hidden, or the
transition silently breaks.

### Dates

Never call `toISOString()` to get a calendar date. It converts to UTC first,
which in Sydney puts anything before 10am on the previous day and silently
corrupts rollover. Use `toLocalDate()` from `src/app/core/dates.ts`. A "day" in
this app is always a local `YYYY-MM-DD` string.

### Tooling

- `@angular/cli@22` hard-requires Node 22.22.3, 24.15.0 or 26+. Check `node -v`
  before blaming anything else.
- `ng test` needs `--watch=false` in a non-interactive run.
- `tsc --noEmit` does not check Angular templates. Run the build.
