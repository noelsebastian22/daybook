# Session log

Shared memory across Cowork, Claude Code and Command Code. No agent can see another's
conversation; this file is the handoff.

Not a changelog — git covers that. This records **intent, dead ends, and open threads**:
the things that live in a conversation and would otherwise die with it.

Written by the `session-handoff` skill. Newest entry first. Never edit a past entry; if
it turned out wrong, say so in a new one.

<!-- newest first -->

## 2026-08-18 · claude-code · push button label, todoist reference

**Did**
- First real task added by hand: `call physio` for Fri 21 Aug with `#physio`. Parsed, category chip rendered, landed under the right day header in the Upcoming strip. Capture is now verified by a person; completion and overnight rollover still are not.
- Fixed the push button in `task-row.ts`. It read "Tomorrow" unconditionally while the action is `addDays(task.scheduled_date, 1)`, so on the Friday task it said Tomorrow and would have moved it to Saturday. Now `pushLabel()` → "Tomorrow" on a today task, `shortWeekday()` otherwise, with `aria-label="Move to <full date>"`.
- Button was `opacity-0` until hover, which is why it read as a static date label in the UI. Now `opacity-60` at rest with a `→` glyph.
- Added `shortWeekday()` to `core/dates.ts`. Renamed `Today.pushToTomorrow` → `pushOneDay`; the old name is what made the bug plausible.
- Created `docs/reference/todoist/NOTES.md` — shot list of 8 areas for Todoist captures, naming convention, and a Steal/Adapt/Reject sort. Folder is Noel's; screenshots not taken yet.
- `ng build` 487.22 kB initial / 121.89 kB transferred. `ng test` 10/10. No schema change.

**Decided**
- **Todoist is the UX reference and the captures are committed**, not kept locally, because a folder on one machine is invisible to the other two agent surfaces. Recorded in `BUILD-PLAN.md` §9 with the premise guard: Todoist's project → section → subtask IA pulls against §10, so anything from that pile needs an explicit reversal in §9, never a quiet implementation.
- **Task rows show no date of their own.** The Upcoming strip's day header already carries it. The only date on a row is the push button's target.

**Didn't work**
- Chased `friendlyDate()` in `core/dates.ts` first on the assumption the "Tomorrow" in the screenshot was a computed date label. It is not — `friendlyDate` is correct and always was. The string is a hardcoded button label at `task-row.ts:80`. Anything on the right-hand end of a task row is an action, not metadata; check the template before the date helpers.
- Auto-expanding the Upcoming strip after adding a future-dated task: rejected. It moves the page under the cursor mid-typing. A toast naming the target day is the fix.

**Open**
- **Adding a task still gives no feedback.** `Capture.onKeydown` clears the box and emits with no toast; a future-dated task then lands in a collapsed strip and vanishes. Noel hit this in real use and chose to defer it. Logged in §4 and §12.
- Screenshots not yet captured, so `NOTES.md` has a shot list and no annotations.
- Still unverified by a person: completing a task, and a real overnight rollover.
- Migration numbering drifts from the live DB — 4 applied versions against 2 files in `supabase/migrations/`. Contents match: `daybook_revoke_anon_rpc_execute` and `daybook_carry_count_by_days_not_opens` are both folded into `0002_rpcs.sql`. Nothing to fix, but do not read the count as missing work.
- Unchanged: no edit or delete UI, no offline write queue, PWA icons are Angular defaults, nothing reads `user_settings.timezone`, no hosting, no CI.

**Next**
Complete the physio task and check the timestamp renders, then leave one incomplete overnight to confirm the carried badge. That closes §4 step 0. Then the add-confirmation toast, since it is the one thing already proven broken in real use.

**Touched** — `src/app/core/dates.ts`, `src/app/features/today/task-row.ts`, `src/app/features/today/today.ts`, `docs/reference/todoist/NOTES.md`, `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-17 · cowork · google oauth live

**Did**
- New Google Cloud project `Daybook` / `daybook-505822`, no organisation. Consent screen configured: app name Daybook, External audience, support and contact email noelsimc69@gmail.com. **Published to Production.**
- OAuth client `Daybook Web`, type Web application. One redirect URI, `https://zzacswfongmzpnhcjiqp.supabase.co/auth/v1/callback`. No JavaScript origins.
- Supabase Google provider enabled with the client ID and secret. Site URL `http://localhost:4200`, redirect allow list `http://localhost:4200/**`.
- **Verified by hand:** Google sign-in completes and lands on `/today`, and `ensure_user_setup` seeds the four default categories on first login.
- Full config table added to `BUILD-PLAN.md` §2. `README.md` auth section rewritten from setup steps to a record plus what changes at deploy time.

**Decided**
- **Daybook got its own Google Cloud project rather than reusing `Website Development`.** A project holds unlimited client IDs but only one consent screen, and the consent screen carries the app name and verification status users see. Reusing the general-purpose project would have branded it Daybook permanently and forced a new project for the next app needing Google sign-in anyway.
- **Published to Production, not left in Testing.** Testing expires refresh tokens after 7 days, which means re-signing in on the phone weekly. No verification review is required because email, profile and openid are all non-sensitive.
- **Magic link stays** after Google works, as a recovery path if the OAuth client is ever revoked.

**Didn't work**
- **`Website Development` reported "Google Auth Platform not configured yet"**, so there was no existing OAuth app to reuse in the first place. The premise of the question ("I already have an application") was a Cloud project, not an OAuth application. Worth separating the two concepts before reasoning about reuse.
- **`encoded-pipe-m07pf` is inaccessible**: `oauthconfig.verification.get (Missing)`. Google-generated project name, presumably from AI Studio. Not usable, do not try again.
- The three things that would have cost an hour if guessed: **no JavaScript origins** (Supabase does a full-page redirect, nothing calls Google from the browser), **only the Supabase callback as a redirect URI** (not localhost, not the production URL), and **the `/**` wildcard in the Supabase allow list** without which `redirectTo` is silently rejected and you land back on login with no error.

**Open**
- **The task loop is still unverified by a person.** Sign-in and category seeding are confirmed. Adding a task, completing one, and watching a real overnight rollover are not.
- Unchanged: no offline write queue, PWA icons are Angular defaults, nothing reads `user_settings.timezone`, no hosting, no CI.

**Next**
Put a real day through the app: add a task with `call physio thursday 2pm #physio !quick`, confirm the chips render and it lands on Thursday in the Upcoming strip, complete something and check the timestamp, then leave one incomplete overnight and confirm the carried badge appears. Then Phase 3, starting with task-as-object since the router already has `withViewTransitions()`.

**Touched** — `BUILD-PLAN.md`, `README.md`, `docs/SESSIONS.md`

## 2026-08-17 · cowork · build plan becomes single source of truth

**Did**
- Folded the whole Notion spec into `BUILD-PLAN.md`. It now carries the product definition, tech stack, all 16 features with per-feature state, signature interactions, interaction rules, pages, UI direction, capture syntax, the data model, rollover logic, locked decisions, out-of-scope, backlog, known gaps and platform gotchas. Numbered sections 1 to 13.
- Removed the separate "Spec coverage" status tables. Feature state now lives on each feature in §5 and nowhere else, so there is one place to update rather than two that drift.
- `AGENTS.md` and `README.md` repointed: `BUILD-PLAN.md` named as the single source of truth, Notion marked historical.
- `session-handoff` skill step 4 rewritten. Was "update the phase status table"; now lists the five sections that can go stale (§3 phase status, §5 features, §4 remaining work, §9 decisions, §12 known gaps) and says never to update Notion.

**Decided**
- **`BUILD-PLAN.md` is the single source of truth, and the Notion page is frozen.** Two live documents means two states of truth and the one nobody has open goes stale. The repo wins because it is what an agent reads at the start of a session, it versions with the code, and a decision and the code implementing it land in the same commit. The Notion page stays as the original brief for provenance.
- **Feature state is tracked per-feature in §5, never in a summary table.** A status table beside a feature list is duplication, and the table is what silently rots.

**Open**
- Unchanged from the entry below. Nothing has been exercised through a real signed-in session, `npm install` has not been run on the Mac, Google OAuth is unconfigured, there is no offline write queue, PWA icons are the Angular defaults, and nothing reads `user_settings.timezone`.
- The Notion page has no banner saying it is historical. Anyone opening it directly will not know. Left alone on purpose: this session should not write to Notion when it just declared Notion frozen.

**Next**
Unchanged: `npm install && npm start`, sign in with the magic link, put a real day through the app. Then Phase 3, starting with task-as-object since the router already has `withViewTransitions()`.

**Touched** — `BUILD-PLAN.md`, `AGENTS.md`, `README.md`, `.agents/skills/session-handoff/SKILL.md`, `docs/SESSIONS.md`

## 2026-08-17 · cowork · phases 1 and 2 built from spec

**Did**
- Read the Notion spec (`Daily To-Do App - Project Spec`) and audited it. Seven gaps found; six fixed this session, listed under Decided.
- Supabase project `daybook` created (`zzacswfongmzpnhcjiqp`, ap-southeast-2, free tier). `sweep` keeps the other active slot; the old paused `noelsebastian22's Project` was left alone, not deleted.
- Migration `0001_core_schema.sql`: `categories`, `tasks`, `day_snapshots`, `user_settings`, RLS owner-only on all four.
- Migration `0002_rpcs.sql`: `ensure_user_setup(text)`, `rollover_and_snapshot(date)`. Both `SECURITY DEFINER`, both revoked from `anon`/`public`. `get_advisors` clean after the revoke.
- Angular 22.1.2 scaffold, zoneless, standalone, Tailwind v4 via `.postcssrc.json`, `@angular/pwa`.
- `core/`: `supabase.ts`, `session.store.ts`, `task.store.ts`, `toast.store.ts`, `auth.guard.ts` (+`guestGuard`), `dates.ts`, `parse-capture.ts`, `models.ts`.
- `features/login` (Google + magic-link fallback), `features/today` (capture box, energy filter, task list, collapsed Upcoming strip), `shared/toasts.ts`.
- Rollover verified live against the real DB with a seeded 4-day gap: 4 snapshot rows written, 1 task rolled, future-dated task untouched, second run a no-op, `current_date + 400` clamped to server+1. Test user deleted afterwards; all four tables back to 0 rows.
- `ng build` 486.78 kB initial / 121.86 kB transferred, lazy chunks for `today` (63.12 kB) and `login` (39.05 kB). `ng test` 10/10.
- Source unpacked to `~/Website Dev/todo/daybook`. `npm install` not yet run there.

**Decided**
- **`carried_over_count` counts days slipped, not rollover runs.** The spec said "increments each time a task rolls over". That makes the number depend on how often the app is opened — a task ignored for a week reads 1 if you open the app once, 7 if you open it daily. Same avoidance, different number. Now `+= (v_today - scheduled_date)`.
- **`day_snapshots` are written for every day in the gap, not just the closing day.** The spec's single-row-per-run design loses Friday and Saturday when you skip a weekend. The RPC loops from the last snapshot to today, and each day counts every task open on that date (`scheduled_date <= day`), not only tasks sitting exactly on it.
- **`categories` and `user_settings` tables added.** Neither was in the spec. `tasks.category_id` referenced a table that did not exist; Phase 5 needs somewhere to put digest prefs, timezone and the push subscription.
- **RLS added on all four tables.** The spec never mentioned it. Without it the publishable key reads the whole database.
- **First-login setup is an idempotent RPC, not a trigger on `auth.users`.** Triggers on that table fail in ways that are painful to debug and can block sign-up entirely.
- **An unknown `#tag` creates the category** rather than silently dropping it. Dropping input the user clearly meant is worse than an occasional stray category, and categories are trivial to delete.
- **Magic link ships alongside Google and stays afterwards.** Google needs manual Google Cloud config; the fallback makes Phase 1 testable now and is a useful recovery path later.
- **`@ngrx/signals` on `22.0.0-rc.0`.** Stable 21.x peer-requires Angular 21. Reverting to Angular 21 LTS is a one-command change if the RC misbehaves.
- App named **Daybook**, chosen over Cairn / Tide / Carryover. Repo folder is `todo/daybook`.

**Didn't work**
- **`ng new` refuses to run on Node 22.22.2.** Angular 22 CLI hard-requires 22.22.3 / 24.15.0 / 26+. `nodejs.org` downloads are blocked in this container (403), and `@nodejs/node-linux-x64` does not exist. The path that worked: `npm pack node-linux-x64@24.15.0`, extract to `/opt/node24`, then shim `npm`/`npx` to run the existing npm CLI under that binary. Only relevant to cloud sessions; a local machine will not hit this.
- **`npm i @ngrx/signals` fails with ERESOLVE on Angular 22.** Latest stable is 21.1.1 and peers Angular 21. Needs the explicit `@22.0.0-rc.0`, not `--legacy-peer-deps`.
- **Tailwind v4 does not import cleanly from a `.scss` global stylesheet.** Sass tries to resolve `tailwindcss` as a Sass module. Switched the global sheet to `src/styles.css` and repointed `angular.json`; component styles can still be scss.
- **The Supabase security linter flags `SECURITY DEFINER` functions even when they `raise exception` on a null `auth.uid()`.** The `raise` is real protection but the linter only reads grants. Explicit `revoke ... from anon, public` clears it.
- First attempt at the RPC returned `rolled_count` correct but assigned `scheduled_date` before computing the day delta — the `update` sets both columns from the *old* row values in Postgres, so the ordering in the SET clause does not matter. Verified rather than assumed.

**Open**
- **Nothing has been exercised through a real signed-in session.** Every rollover path was proven with a seeded auth user and `set local request.jwt.claims`, but no human has signed in, added a task or completed one. `npm install` has not been run in the repo on the Mac.
- **Google OAuth is not configured.** Button renders and calls `signInWithOAuth`, Supabase will reject it until the Google Cloud client ID and secret are pasted in. Steps are in `README.md`.
- **No offline write queue.** Optimistic updates cover an in-session drop; a write made with no connection is lost on reload. iOS has no Background Sync API, so this has to be a foreground replay queue in `TaskStore`.
- **PWA icons are the Angular schematic defaults.** Purple Angular shield, not a Daybook icon.
- `user_settings.timezone` is written by `ensure_user_setup` and read by nothing.
- No hosting. No CI. Not deployed anywhere.

**Next**
Run `npm install && npm start` in `~/Website Dev/todo/daybook`, sign in with the magic link, and put a real day through it: add a task with `call physio thursday 2pm #physio !quick`, confirm the chips render and the row lands on Thursday in the Upcoming strip, complete something and check the timestamp. That is the first real proof the whole loop works. Then Phase 3.

**Touched** — `supabase/migrations/0001_core_schema.sql`, `supabase/migrations/0002_rpcs.sql`, `src/app/core/*`, `src/app/features/login/login.ts`, `src/app/features/today/{today,capture,task-row}.ts`, `src/app/shared/toasts.ts`, `src/styles.css`, `src/index.html`, `public/manifest.webmanifest`, `angular.json`, `AGENTS.md`, `BUILD-PLAN.md`, `README.md`
