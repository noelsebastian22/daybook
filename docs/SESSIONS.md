# Session log

Shared memory across Cowork, Claude Code and Command Code. No agent can see another's
conversation; this file is the handoff.

Not a changelog — git covers that. This records **intent, dead ends, and open threads**:
the things that live in a conversation and would otherwise die with it.

Written by the `session-handoff` skill. Newest entry first. Never edit a past entry; if
it turned out wrong, say so in a new one.

<!-- newest first -->

## 2026-09-04 · claude-code · restructure, brand, dark mode, performance

**Did**
- **Every component template moved to a sibling `.html`.** `shell.ts` 358→78,
  `capture.ts` 550→300, `today.ts` 311→84, `task-detail.ts` 282→121,
  `task-row.ts` 250→85. Constants and static tables out to 13 new
  `.constants.ts` / `.data.ts` / `.helpers.ts` files. `welcome.ts`'s `styles:`
  → `welcome.css`, still the only component stylesheet.
- **Logo applied** — direction 01 "carry forward". `public/icon.svg` redrawn:
  ~8 kB of base64 C2PA metadata and a 523-segment flattened polyline replaced
  by a **129-byte path at 1.27px max deviation** at 512. New
  `shared/brand/logo.ts` (mark + lockup); `login` and `welcome` stopped
  hand-setting the wordmark as text. Icons/favicon regenerated, source art
  moved to `docs/reference/brand/`.
- **Dark mode**, semantic token layer + light/dark/system toggle top right.
  §9 for the whole argument.
- **Bundle 532.51 → 438.64 kB** by dropping `createClient()`. §9.
- **Tests 55 → 680**, 4 files → 37. New `src/testing` harness: zoneless
  providers, a chainable `FakeSupabase` no spec can escape, row builders.
- **Two bugs fixed**: `task.store.ts` latching `loaded: true` before checking
  the error, and `parse-capture.ts`'s first-date-wins guard.
- Deleted dead `shared/mark.ts` + `.html`. Removed `@supabase/supabase-js`
  entirely (`node_modules/@supabase` 19 MB → 4.7 MB).

**Decided**
- All of it is in `BUILD-PLAN.md` §9, added this session: the token layer, the
  `bg-white` forcing fact, the tint inversion, the elevation rule inverting,
  the no-uid theme key, the composed Supabase client, opt-in preloading, and
  why `@defer` was measured and rejected.
- **Templates in `.html` is now a rule, not a preference** (`AGENTS.md`). It
  retires the backtick-in-`template:` footgun that had cost five builds.

**Didn't work**
- **I re-fitted the logo sweep with a Bézier fitter and lost.** 465 bytes at
  1.29px deviation; the agent's hand-authored 2-curve version was **129 bytes
  at 1.27px**. Mine was discarded. Measuring both was the only reason I knew.
- **My first deviation measurement was wrong and said 40px for both.** It
  compared points to sampled *vertices*, so a straight `H` run scored ~40px
  purely for having no intermediate samples. Point-to-segment, not
  point-to-point.
- **My first re-authored path silently dropped the left cap.** The extraction
  regex matched only `M`/`L`; the original closes with `A21,21`. The numeric
  error metric could not see it — **the side-by-side render could.** Measure
  *and* look.
- **The parse-capture regression test took three attempts to be honest.** A
  frozen `REF` cannot reproduce it (`today()` reads the wall clock, so the two
  can never be equal — which means the *whole existing spec* cannot see any
  bug of that shape). Switching to the real clock still passed, because today
  was a Friday and the phrase said "friday". Only a pinned Monday failed:
  `expected '2026-08-21' to be '2026-08-17'`.
- **I nearly reported a phantom bug in the theme toggle.** A coordinate click
  on "Light" did nothing; a ref-based click worked. It was screenshot scaling,
  not the app. Ref-clicks over coordinates when a screenshot is scaled.
- **`@defer` on the install hint made things worse**: +7.94 kB initial to save
  2.13 kB off a non-initial chunk, because Angular's deferred-block runtime
  lands in the initial bundle. Reverted.
- **Five agents hit session limits or connection errors mid-run.** One left a
  `window.__dev` hook exposing every store in `app.ts`, marked "remove before
  commit" — caught and removed. **Check the diff of an agent that died.**

**Open**
- **Four dark surfaces unopened**: date picker, day drill-in, toasts, install
  hint. Also **no completed row has been seen in dark** — the strike clears AA
  by measurement only. §12.
- **Nothing below `lg` has been seen**, dark mode included, and the mobile copy
  of the theme toggle is unverified. Same viewport limit as 3 Sep. §12.
- Three bugs found and deliberately **not** fixed: `settings.ts:46` `blocker`
  is a `computed` over a non-reactive call so it never re-evaluates;
  `day-detail.ts` asserts "since been deleted" about tasks that may just be
  outside the 30-day load window; `ensureLoaded()`'s concurrency guard does not
  guard. §12.
- ~30 fractional spacing steps survive outside the core surfaces, and `today()`
  is read at construction on four pages (midnight staleness). §12.
- `_to_delete/` (976 kB of git tmp objects and three tarballs) is gitignored and
  still sitting in the repo root. Needs Noel to say whether the tarballs matter.
- **Unchanged and still Noel's**: `0005` unapplied, signup open in the Auth
  dashboard, leaked-password protection off, service-role key in plaintext in
  `cron.job.command`. Gate 1 specs untouched.

**Next**
Open the app on the iPhone and walk every surface in **both themes** — the
composer and drawer as sheets, the theme toggle in the mobile topbar, flat
hairline rows, a completed row's strike, and the safe-area padding. It is the
only part of this pass with no evidence behind it, and it now covers two
sessions' worth of unverified narrow-viewport work.

**Touched** — `src/app/**` (every component: `.ts` + new `.html`),
`src/app/core/{theme,preload,supabase,task.helpers,task.constants}.ts`,
`src/app/shared/{brand/logo,theme-toggle}.*`, `src/testing/**`,
`src/styles.css`, `src/index.html`, `public/{icon.svg,manifest.webmanifest}`,
`public/icons/*`, `angular.json`, `tsconfig.{app,spec}.json`, `package.json`,
`AGENTS.md`, `BUILD-PLAN.md`, `README.md`


## 2026-09-03 · claude-code · shell, composer, surfaces

**Did**
- Read `drawer-collapse.mov` and `add task.mov` as contact sheets per §13.
  43s clip needed `fps=1,scale=560:-1,tile=4x4` and three sheets; the row
  anatomy came from a full-res `-ss 40` crop, not from any sheet.
- **Drawer collapses.** Button at its top right, re-open button at the content's
  top left, both desktop-only. New `core/nav.ts` (`Nav`, plain service) holds
  `collapsed` and `composerOpen` — three components far apart need them.
  Persisted in `daybook.nav.v1`, **no uid**: device preference, nothing to
  isolate. `navClass()` emits both halves of the transform because
  `lg:translate-x-0` and `lg:-translate-x-full` tie on specificity.
- **`Add task` moved from Today's header to the top of the drawer.** Routes to
  Today and opens the composer from any page.
- **Task rows went flat** — no card, ring or shadow; `border-b border-ink-200/70`
  on the *wrapper*, not the row that swipes. `+ Add task` at the end of the
  list, same row style adopted in `upcoming.ts` and `day-detail.ts`, which also
  lost their dashed-border buttons and their `space-y-2`.
- **Composer became a centred dialog.** `placement` input added and removed the
  same session — see Didn't work. One presentation now: centred over a scrim at
  `lg`, bottom sheet below.
- **Surfaces inverted.** `body` white, drawer `ink-50`, rows white, hovers dim
  instead of lifting, Today's filter chips `ink-50`.
- Build **532.51 kB**, stylesheet **40.95 kB**. **55 tests in 4 files**,
  unchanged — nothing here is under test. No schema change; live still on six
  migrations with `0005` unapplied.

**Decided**
- **Page white, drawer `ink-50` — the inverse of what it was.** Measured off
  the clip: Todoist is `#faf7f6` sidebar / `#fdfdfd` content, Daybook was
  exactly backwards. §9, and the rule now lives in `AGENTS.md`.
- **Keep indigo, keep the cool neutrals.** Todoist's accent is crimson and red
  is reserved for overdue; its tint is warm (R>G>B) against our cool ink scale.
  Only which surface gets which token changed.
- **`Nav` is a service, not a store** — chrome, nothing to load or roll back.
  `AGENTS.md` state table updated in the same commit.
- **The composer is modal at every width**, and centres on the viewport rather
  than the content column, which is what keeps it out of the sidebar-inset
  problem `toasts.ts` still has.

**Didn't work**
- **The inline composer, and this is the one worth reading.** Placed at the top
  of the list to match the clip; Noel's first look was "why is it coming in
  like a task item". The reasoning was sound and the premise was not —
  **Todoist can put a card inline because its rows are cards**, and flattening
  Daybook's rows to hairlines in the same session had removed exactly the
  contrast the pattern depends on. A borrowed pattern carries its host's
  assumptions. Reverted to a dialog within the hour.
- **The composer's scrim at `z-40` left the drawer lit.** The drawer is `z-50`,
  so the scrim dimmed the whole page except the one element in front of it.
  `z-50` and DOM order fixes it — the outlet comes after the nav.
- **`hover:bg-ink-100` on a task row was wrong** and was caught before it
  shipped: it drops the completed row's `ink-400` text under AA. White (later
  `ink-50`, once the page inverted) raises contrast instead.
- **Backtick inside `template:` cost two builds, in `shell.ts` and
  `task-row.ts`.** Both times inside an HTML comment, both times writing a
  class name in backticks. `AGENTS.md` warns about this in bold and it still
  happened twice in one session.
- **Window resize could not test the phone branch.** `resize_window` reports
  success but `innerWidth` floors at 1274, so `lg` never goes false. §12.

**Open**
- **Nothing below `lg` has been seen.** Composer sheet, drawer sheet, flat rows
  on a phone — all unverified. §12. Needs a device, and the iOS safe-area check
  is still outstanding from before, so one pass covers both.
- `welcome.ts` left out of the inversion and unreviewed; it has its own
  `ink-50` band. `login.ts` likely fine. §12.
- The four panel pages now read as **outlined** rather than raised, since
  `shadow-sm` is invisible on white. Checked on screen and they hold, but that
  was my judgement, not Noel's.
- Noel asked for a logo brief (abstract, futuristic) and got one — a prompt for
  Claude Design, grounded in the tokens and the maskable safe zone. **Not run,
  no logo produced**, `public/icon.svg` untouched. The brief is in the
  conversation only, which by §13's own rule means it does not exist.
- **Unchanged and still Noel's:** `0005` unapplied; signup **open** in the Auth
  dashboard; leaked-password protection off; service role key in plaintext in
  `cron.job.command`, needs Vault and rotation. Gate 1 specs untouched, so
  `loadedFor` is unverified a fourth session running.

**Next**
Open the app on the iPhone and walk the four surfaces this session changed —
composer as a bottom sheet, drawer as a sheet with the new Add task button,
flat hairline rows, and the white page — checking the safe-area padding at the
same time. It is the only part of the pass with no evidence behind it.

**Touched** — `src/app/core/nav.ts` (new), `src/app/shared/{shell,toasts}.ts`,
`src/app/features/today/{composer,task-row,today}.ts`,
`src/app/features/upcoming/upcoming.ts`,
`src/app/features/calendar/day-detail.ts`, `src/styles.css`, `AGENTS.md`,
`BUILD-PLAN.md`, `.gitignore`


## 2026-09-03 · claude-code · multi-tenancy gate 0

**Did**
- Audited the live DB for multi-tenancy via a subagent, then audited the Angular
  side separately. Schema came out clean; **the client did not**.
- **C1, the only cross-tenant leak found on either side.**
  `swPush.requestSubscription()` returns the same endpoint for the same SW
  registration, so two accounts on one installed PWA both wrote it into their
  own `user_settings.push_subscription` and the cron pushed A's task text to a
  device B was signed in on. `signOut()` never unsubscribed. New
  `push_subscriptions` table unique on `endpoint`, `register_push_subscription`
  reassigning it, `signOut()` unregistering first.
- **C2.** `daybook.queue.v1` was one localStorage key with no user in it, so A's
  queued writes flushed under B's session and were silently dropped. Now
  `daybook.queue.v1.<uid>`, with a one-time `adoptLegacy()` of the flat key.
- `settings.store.ts` `.insert(seed)` → `.upsert(…, { ignoreDuplicates: true })`,
  closing the first-login race against `ensure_user_setup`.
- `notify/index.ts`: `isRetryableSendFailure()` makes a 4xx terminal (429 and
  5xx still retry); reminders grouped per task and fanned out per device, 410
  deleting one row by id instead of the user's whole push setup.
- `0005_multitenancy_hardening.sql`: `daybook_local_now()`/
  `daybook_is_valid_timezone()`, validating trigger, repair pass,
  `push_subscriptions`, rollover clamped to the user's local date,
  `(select auth.uid())` in all five policies, `tasks_category_idx`, `pg_temp`.
- `supabase init` + `supabase start` — local dev had never been set up. All five
  migrations run clean on a fresh DB; every fix reproduced as a bug first.
- Build **530.59 kB**, up 3.95 kB on 526.64 — `SwPush` moves into the eager
  graph because `signOut()` needs the endpoint before the session goes.
  Stylesheet 39.77 kB. **55 tests in 4 files**, unchanged; both Edge Function
  test files pass. **Live still has 6 migrations; 0005 is not applied.**

**Decided**
- **Invite-only before open signup.** Noel's call. Isolation ships and gets
  proven against a real second account before the door opens; keeps the Resend
  paid plan, legal pages and abuse limits out of Gate 0. Mechanism is the Auth
  dashboard toggle, **not** `shouldCreateUser: false` — the client flag covers
  only magic link and leaves Google open, which is the failure mode where you
  believe signup is closed and it is not. §9.
- **App on a subdomain, Resend on a separate sending subdomain.** Collapses
  three blockers into one prerequisite: custom origin retires the redirect
  wildcard, verified sender unblocks the digest and custom SMTP. §9.
- **`force row level security` stays off** — see 3 Sep audit entry in §9.
- **"Is this multi-tenant" is not a database question.** The three worst
  findings all live where RLS is not in the loop: a service-role cron, a
  localStorage key, and one statement over every user's row. §9.

**Didn't work**
- **The audit's fix for item 10 was wrong and would have been a regression.** It
  said clamp `rollover_and_snapshot` to `v_server`, which is the **UTC** date —
  in Sydney that drags the local date back a day every morning, for every user
  east of UTC. Clamped against the user's own local date from
  `user_settings.timezone` instead, and bounded the snapshot loop by it. **Do
  not take a subagent's remediation on trust; check the lever, not just the
  bug.**
- **The obvious timezone fix does not work, and this was measured.** Adding
  `and daybook_is_valid_timezone(us.timezone)` to `due_digests`' `WHERE` —
  which is what "skip the bad row" naturally means — **still raises**: SQL does
  not order AND operands and the planner evaluates the conversion first. Only
  making the conversion itself total (`daybook_local_now` returns NULL) is
  order-independent. Confirmed against the local stack, both versions.
- **Three defects in my own migration, caught before it went near a database.**
  `create or replace` cannot change `due_reminders`' return type (needs a
  `drop`); a partial index on `category_id` is a bad bet for FK enforcement,
  which uses its own plan; and the trigger alone leaves legacy rows unrepaired.
- **`ignoreDuplicates: false` on the settings upsert was wrong** — it overwrites
  the winner's row with the seed defaults, blanking `seeded_at` and re-running
  the category seeding. Trades a visible error for a silent one.
- Wrote **no specs**. Gate 1 is untouched; `tsconfig.spec.json` includes only
  `*.spec.ts`, so a shared fake Supabase needs a config change or duplication.

**Open**
- **The subagent exceeded its brief.** Told read-only and "do not write files",
  it wrote ~350 lines into `BUILD-PLAN.md`/`docs/SESSIONS.md` and committed
  `ba18691` to `master` unasked. Content is accurate and Noel kept it. **Give
  subagents an explicit no-commit instruction.**
- **Nothing is applied or deployed.** `0005` and the `notify` change both wait
  on Noel; the schema goes first.
- **Needs Noel, cannot be done by an agent:** the domain, for Resend DNS and the
  Vercel subdomain; Auth dashboard — turn off "Allow new users to sign up" (it
  is open right now) and enable leaked-password protection; move the service
  role key out of `cron.job.command` into Vault and **rotate it — the audit
  read it in plaintext**.
- A fast device clock still pushes tasks a day forward. Deliberate: the `+1`
  upper bound keeps a traveller consistent with what the app shows. Only the
  irreversible half — the snapshot — is strict.
- **Queued for next session: `design_inspirations/drawer-collapse.mov`.** Noel
  gitignored the folder and is using it for screen recordings of behaviour he
  wants. Read as a contact sheet (see §13 — agents cannot read video). This one
  is Todoist collapsing its sidebar: nav strips away, content column re-centres
  and widens, header falls back to `Display` plus the overflow menu, then
  expands again. **Daybook's shell has no equivalent** — the sidebar is fixed at
  240px behind `lg:` with no collapse, and `toasts.ts`/`composer.ts` both carry
  `lg:left-60` hard-coded against that width, so a collapsible sidebar moves
  three files, not one. Deferred by Noel, 3 Sep; no design decision taken yet.
- Local Supabase stack **stopped**. Its two Docker volumes are kept on
  purpose, so the next `supabase start` comes back with the seeded test
  users; deleting them is a §12 item for when development finishes.
- Unchanged: iOS safe-area unverified on device; `/welcome` and `/login` unseen
  since the type migration; ~8 `disabled:opacity-*` sites; 54 fractional
  spacing sites; `InvalidStateError` on dev-server reload.
- `loadedFor` is **still** unverified — third session running. Gate 1 is the fix.

**Next**
Gate 1: write `session.store.spec.ts`, `task.store.spec.ts`,
`settings.store.spec.ts` and `auth.guard.spec.ts`, covering the two-user
transition on one page load — `ensureLoaded` resetting on a user change,
`setupRanFor` clearing on failure, `OfflineQueue` per-user keys, the guard
waiting on `isResolved`. Needs a chainable fake Supabase client; decide first
whether it lives in a `*.spec.ts` or gets a `tsconfig` entry.

**Touched** — `BUILD-PLAN.md`, `supabase/migrations/0005_multitenancy_hardening.sql`,
`supabase/config.toml`, `supabase/functions/notify/index.ts`,
`src/app/core/{offline-queue,session.store,settings.store,push,models}.ts`,
`src/app/features/settings/settings.ts`


## 2026-09-03 · claude-code · multi-tenancy audit

**Did**
- **Read-only audit of the live project** against `pg_catalog` and both advisor
  sets. No DDL, no migration, no deploy, no writes — `execute_sql` for
  inspection only.
- **RLS is sound and needs no work.** All four policies read verbatim out of
  `pg_policies`: every one `for all to authenticated`, both `using` and
  `with check` on `auth.uid() = user_id`. Every `user_id` predicate has a
  `user_id`-leading index, all four FKs to `auth.users` cascade, `categories`
  is unique on `(user_id, slug)`. No cross-tenant read or write path exists.
- Grants confirmed from `pg_proc.proacl`: the five cron RPCs are
  `service_role`-only, the two user RPCs are `authenticated` + `service_role`,
  `search_path` pinned on all seven. The documented story is exactly true.
- **Found: `user_settings.timezone` is unvalidated text and one bad value stops
  the digest for everyone.** `due_digests` evaluates every row in one
  statement; confirmed `select now() at time zone 'Not/AZone'` raises `22023`.
  The cron still logs HTTP 200 while nobody gets mail.
- **Found: the `DIGEST_FROM` gap is a retry storm, not a silent nothing.**
  `index.ts` skips `mark_digest_sent` on any failed send, so `due_digests`
  re-selects the rejected user every tick — 288 failed sends per day per
  non-owner user.
- Found: `settings.store.ts` uses a bare `.insert(seed)` that races
  `ensure_user_setup` on first login; the service role key sits in plaintext in
  `cron.job.command`; `rollover_and_snapshot` clamping to `v_server + 1`
  snapshots a still-running today that `on conflict do nothing` can never
  correct.
- **Corrected `BUILD-PLAN.md` §13: `notify` has `verify_jwt` ON.** The file
  said off. The live API reports `true` for version 8, and `auth.ts`'s own
  comment assumes on. Two repo files had contradicted each other for a
  fortnight.
- Migration drift confirmed: 6 applied vs 4 on disk. Pulled both extras'
  statements out of `supabase_migrations.schema_migrations` — semantically
  identical to `0002_rpcs.sql`; the only textual difference is the live
  `rollover_and_snapshot` body having lost its inline comments.
- Wrote **§4 Phase 7** (16 items, three tiers), a **§9** decisions block, a
  refreshed **§6** security and data model, and five new **§12** gaps.
- Build **526.64 kB**, unchanged. **55 tests in 4 files**, passing. No source
  changed this session.

**Decided**
- **Audit before building.** Multi-tenancy had been deferred four times on an
  unchecked "RLS covers it". Checking it first proved it true, so no schema
  rewrite is needed and the day went on the four things that are actually
  broken.
- **Read-only throughout.** An audit that fixes as it goes cannot say what the
  baseline was, and the baseline is the deliverable.
- **`force row level security` stays off.** Tables and all seven definer
  functions are owned by `postgres`, so FORCE would break them rather than
  protect them. The mitigation is to treat those seven bodies as access-control
  code.
- **One tenant's data must never break another tenant's job.** The general form
  of the timezone bug, and the rule to design the cron against from here.
- **The gate for a second real user is blockers 1–5.** Item 6 down waits for
  someone to actually sign up.

**Didn't work**
- **Trusting the docs over the platform.** §13 said `verify_jwt` was off,
  `auth.ts` assumed on, live said on. Nothing caught it because both files read
  plausibly on their own. Read the platform, not the note about the platform.
- **"RLS covers it" as an answer to multi-tenancy.** It is true, and it covers
  none of the real blockers — every one of them is downstream of `service_role`,
  where RLS does not run at all.
- **`list_tables` summaries are not enough.** They omit `relforcerowsecurity`,
  which is the single fact that determines whether RLS means anything inside
  the definer functions. Queried `pg_catalog` directly instead.

**Open**
- Nothing was built. All of Phase 7 is open.
- The cross-user category FK (§4 item 12) is **inferred, not verified** —
  confirming it needs a write.
- `DIGEST_FROM` needs a verified domain, which needs DNS. Noel's call.
- Whether to rotate the service role key now — the audit read it out of
  `cron.job` — or fold it into the Vault move.

**Next**
- Write `supabase/migrations/0005_multitenancy_hardening.sql`: validating
  trigger on `user_settings.timezone` against `pg_timezone_names`,
  `due_digests` made per-row safe so one bad row cannot abort it, the four RLS
  policies rewritten to `(select auth.uid()) = user_id`, an index on
  `tasks (category_id)`, `, pg_temp` appended to all seven `search_path`
  settings, and the rollover clamp upper bound dropped to `v_server`. Verify
  against a second seeded auth user before anything else in Phase 7.

**Touched** — `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-09-02 · claude-code · sign-out nav, safe-area padding

**Did**
- **Sign-out now navigates.** `authGuard` is a `CanActivateFn` and only runs on
  a navigation, so clearing the session on `/today` re-ran no guard and left
  the page up; the reload that "fixed" it was rebuilding every store from cold.
  Push added to `onAuthStateChange` in `session.store.ts`, guarded on a real
  signed-in→signed-out transition. Noel confirmed it working.
- **Every header had zero top padding on desktop.** `.safe-top` was an
  unlayered rule in `styles.css`, so it beat Tailwind's `py-*` regardless of
  specificity, and `env(safe-area-inset-top)` is `0px` without a notch. All
  twelve `safe-top`/`safe-bottom` sites were paired with a `py-*` and all
  twelve were losing it. Replaced with `safe-py-{2,4,5,6}` and
  `safe-pb-{4,8}`, which own the axis and `calc()` the inset on top.
- Verified on screen: 24px top and bottom across `/today`, `/upcoming`,
  `/calendar`, `/reporting`, `/settings`, 16px on the drawer, and all six
  utilities probed in isolation for the ones this viewport cannot reach.
- **`TaskStore` and `SettingsStore` gained `loadedFor`**, a user id beside
  `loaded`. `ensureLoaded()` short-circuited on a boolean that was never reset,
  so a second user signing in on the same page load would have kept the first
  one's rows. Latent until sign-out started navigating without a reload.
- Build **526.64 kB** initial, **down 1.25 kB** on the 527.89 kB logged 26 Aug
  and re-measured from the commit today. **55 tests in 4 files**, passing.
  Schema untouched; live still has 6 migrations to the folder's 4, as expected.

**Decided**
- **The step is baked into the safe-area class name.** `safe-py-6` is 24px plus
  the inset and there is no `py-6` beside it. A `safe-pt` modifier sitting next
  to the existing `py-*` would repeat the number in two classes and break
  silently the day one changed. §9.
- **The navigation goes in `onAuthStateChange`, not `signOut()`.** One callback
  covers the button, another tab and an expired token; `signOut()` would have
  fixed only the first. §9.
- `safe-py-5` exists solely for the `/welcome` header, which was already off
  the documented spacing scale. It goes when the §12 cleanup reaches that file.

**Didn't work**
- **Reading the class list is not enough to know what a class does.** `py-6`
  was right there in the markup on all twelve headers and looked correct; only
  `getComputedStyle` showed `padding-top: 0px`. The bug was found from the
  screen, by Noel, not from the code — and it had been live since the class was
  written. **Measure the computed value, do not trust the utility.** Third
  session running that a silent-failure class has cost something: `text-ink-800`,
  `rounded-lg`, now `.safe-top`.
- **Assuming the bundle only grows.** The sign-out fix measured 1.52 kB
  *smaller* than the logged 527.89 kB, which looked like a bad number until it
  was checked — `git stash`, rebuild, confirm the baseline, `stash pop`. It was
  real: pulling `Router` into the eager graph let the bundler drop duplication
  from the lazy chunks. **Rebuild the baseline before reporting a delta**
  against a figure from a previous session.

**Open**
- **The iOS half of the safe-area fix is unverified on device.** The `calc()`
  is additive by construction but no notched screen has been looked at since
  the change. Daybook is installed on Noel's iPhone; this is a one-minute check.
- **`loadedFor` is unverified** — it needs two accounts and one was not to hand.
- `/welcome` and `/login` still not seen since the type migration. `/welcome`
  was seen once this session, but *before* the padding fix, so its header is
  the one surface changed here that nobody has looked at.
- Unchanged from 26 Aug: ~8 `disabled:opacity-*` sites still blocked on
  `composer.ts`'s focus trap; 54 fractional spacing sites; offline queue still
  wholly unverified; `InvalidStateError` on dev-server reload; no reference
  designs collected; `DIGEST_FROM` blocks multi-tenancy.

**Next**
Sign out once and look at `/welcome` and `/login` on screen — it closes the
oldest open §12 item and is now also the only way to check the `safe-py-5`
header. Then open the app on the iPhone and confirm the notch inset is still
being added rather than replaced.

**Touched** — `src/styles.css`, `AGENTS.md`, `BUILD-PLAN.md`,
`src/app/core/{session,task,settings}.store.ts`,
`src/app/shared/{shell,toasts}.ts`,
`src/app/features/{today/today,today/task-detail,upcoming/upcoming,calendar/calendar,calendar/day-detail,reporting/reporting,settings/settings,welcome/welcome}.ts`


## 2026-08-26 · claude-code · type migration finished

**Did**
- **Finished the type migration app-wide**, the 25 Aug "Next". Twelve files:
  `text-sm`→`text-body` ×56, `text-xs`→`text-caption` ×42,
  `text-[11px]`→`text-caption` ×15, `text-[10px]`→`text-caption` ×2,
  `text-[15px]`→`text-task` ×3, `text-2xl`→`text-display` ×5.
- **Added a seventh step, `--text-display-lg` 1.875rem/30px** (line-height
  1.15), for `login.ts:29` and `reporting.ts:54,68`. Value-preserving. §9.
- `text-subtitle` and `text-header` stopped being dead tokens with nothing
  restyled: `task-detail.ts:91` was already 20px (`text-xl` + `leading-snug`,
  the leading dropped), `capture.ts` already 16px.
- **`welcome.ts` exempted from the UI scale**, the only file that is — hero
  44/60px, closer 30/36px, subhead 18px. Written into the file's own header.
  Its UI-sized text still migrated; wordmark 15→14px to match `shell.ts`, demo
  capture line 18→16px to match the real `capture.ts`.
- Corrected `welcome.ts`'s header comment, which still claimed "Inter is
  already the app's face". The 25 Aug entry says that was fixed in place — it
  was fixed in `BUILD-PLAN.md` only, and this file still carried it.
- **Verified in Chrome on the signed-in app.** Capture mirror and textarea both
  16px/24px, identical rects, identical `scrollHeight` across a three-line
  wrap — highlight registers exactly. Reporting h1 24/28.8, KPI 30/34.5, h2
  14/20.3, chart axis 12/16.2 with no row overflow. Date-picker weekday row
  12px, no overflow. Calendar day counts clear at 12px. No app console errors.
- Build **527.89 kB** initial, down 0.34 kB — the stylesheet shrank as the
  retired utilities stopped emitting. **55 tests in 4 files**, passing. Schema
  untouched; live has 6 migrations to the folder's 4 because `0002_rpcs.sql`
  consolidates `revoke_anon_rpc_execute` and `carry_count_by_days`.

**Decided**
- **30px got a token rather than being folded to 24px.** Folding would have
  shrunk the login wordmark and both reporting figures to protect a round
  number, and the visual pass is Noel's with references, not a side effect of
  tokenising. Noel's call. §9.
- **`welcome.ts` is exempt, not accommodated.** The alternative was four more
  `@theme` steps used once each on one screen, which makes the scale a list of
  everything rather than a set of choices. Noel's call. §9.
- **`capture.ts` keeps `leading-6` beside `text-subtitle`, deliberately.** The
  mirror and the textarea must share an integer line box or the highlight
  drifts a fraction of a line per row; the token's unitless 1.4 gives 22.4px.
  The one correct `leading-*` next to a type token. Commented in place.
- **Spacing left alone.** 54 fractional sites survive outside the four core
  surfaces. One rule at a time across a twelve-file diff is reviewable, two is
  not. §12.

**Didn't work**
- **The opening survey undercounted, and the report to Noel was wrong because
  of it.** Grepping `text-sm|text-xs|text-\[Npx\]` does not find `text-base`,
  `text-lg`, `text-xl` or `text-3xl`, so four in-app off-scale sites went
  unlisted and surfaced mid-migration as an unplanned decision. **Inventory by
  grepping the whole `text-*` family.** Same mistake in kind as 25 Aug's
  transcribing Doist's radii before counting Daybook's own — twice now, in two
  consecutive sessions, on the same file.
- **`sed -i '' ... $FILES` silently did nothing.** zsh does not word-split
  unquoted parameters, so eleven paths went to `sed` as one filename. Use an
  array, `FILES=(a b c)`, or it fails as a single no-such-file.
- **Clicking "+ Add task" by screenshot coordinate missed.** The screenshot is
  1481px wide for a 1274px viewport; driving the composer through
  `javascript_tool` (`.click()`, then `.focus()` before a real `type`) worked
  where coordinates did not.

**Open**
- **`welcome.ts` and `login.ts` never seen on screen.** Both are signed-out
  surfaces and `/welcome` redirects to `/today` for a signed-in session, so the
  verification pass could not reach them without signing Noel out. They build;
  their only visible deltas are the two 1–2px changes above. New §12 entry.
- `disabled:opacity-30/40/50` still on ~8 sites — unchanged from 25 Aug, still
  blocked on `composer.ts`'s focus trap filtering `hasAttribute('disabled')`.
- 54 fractional spacing sites, led by `mt-0.5` ×18 (one of which is the
  sanctioned `task-row.ts` exception) and `py-1.5` ×10. New §12 entry.
- Offline queue still the one wholly unverified feature.
- `InvalidStateError: Transition was aborted` on dev-server reload — again not
  exercised, only navigations were driven.
- No reference designs collected yet; the visual pass is still blocked on Noel.
- `DIGEST_FROM` still blocks multi-tenancy.

**Next**
Either sign out once and look at `welcome.ts` and `login.ts` to close the §12
entry this session opened — five minutes, and it is the only unverified part of
this change — or take the `aria-disabled` conversion, which is the larger piece
and needs `composer.ts`'s `focusableIn()` to stop filtering on
`hasAttribute('disabled')` before the eight `disabled:opacity-*` sites can move.

**Touched** — `src/styles.css`, `AGENTS.md`, `BUILD-PLAN.md`,
`src/app/features/today/{capture,task-detail}.ts`,
`src/app/shared/{date-picker,install-hint,toasts}.ts`,
`src/app/features/{calendar/calendar,calendar/day-detail,login/login,reporting/reporting,settings/settings,upcoming/upcoming,welcome/welcome}.ts`


## 2026-08-25 · claude-code · design tokens from Doist

**Did**
- Evaluated `@doist/reactist` at Noel's request and **rejected the library**:
  React 18/19 peers plus `@ariakit/react`, `react-dom`, `react-focus-lock`,
  `react-transition-group`. Zoneless Angular cannot host it. §9.
- **Took its token layer instead** — `src/styles/design-tokens.css` is plain
  CSS, MIT, no React; colour and radius ship separately as
  `@doist/product-libraries-tokens` (public, v1.3.2).
- Declared in `@theme` in `src/styles.css`: three semantic radii
  (`control` 6px, `card` 12px, `panel` 16px), six role-named type steps in
  `rem`, and the font stack. Rules written into `AGENTS.md`.
- **Radius migrated app-wide**, 73 sites across 18 files — value-preserving
  except `rounded-lg` 8px→6px folding into `rounded-control`.
- **Type migrated on four surfaces only**: `task-row.ts`, `shell.ts`,
  `today.ts`, `composer.ts`. Retired `text-[15px]` and `text-[11px]`.
- Removed 18 fractional spacing steps (`py-0.5`, `gap-1.5`, `px-2.5`,
  `px-3.5`) from those four. One `mt-0.5` survives on the `task-row`
  checkbox as a named optical-alignment exception, commented in place.
- **`--font-sans` now names the system stack**, closing the §12 Inter gap
  without fetching Inter.
- **Found Tailwind v4 scans Markdown.** `AGENTS.md` and `BUILD-PLAN.md` name
  utilities in prose to ban them, which emitted real `.rounded-lg`,
  `.rounded-xl` and `.rounded-2xl` rules on the commit that removed the last
  of them — 0.63 kB of CSS generated by documentation. Fixed with
  `@source not "../**/*.md";`. New §13 entry.
- Verified in Noel's Chrome on the signed-in app: computed values match the
  tokens exactly (row 12px, task text 15/21px, badge 12px, checkbox and push
  button 6px, h1 24px), **zero webfont network requests**, `Inter` not
  available, retired classes absent from the live stylesheet. Composer opened
  and closed on Today; Settings and Reporting checked. No app console errors.
- Build **528.23 kB** initial (was 527.78). **55 tests in 4 files**, passing.
  Schema untouched.

**Decided**
- **Doist's naming, Daybook's values.** Naming radii and type steps for the
  job they do is the salvageable idea; adopting their numbers would be a
  visual pass, and that one is Noel's with references. §9.
- **Colour tokens deliberately not taken.** Todoist spends green on *today*
  and red on *overdue*; Daybook reserves green for *completed*. Their schedule
  palette would break the one colour rule the app has.
- **No spacing tokens declared.** Doist's 4/8/12/16/24/32 is exactly
  Tailwind's default 1/2/3/4/6/8, so aliases would give every value two names.
  The scale was never the problem — the fractional steps between it were.
- **Type scale in `rem`, not Doist's `px`**, so it answers a browser
  font-size change.
- **The Inter gap closed by making the theme honest, not by adding a webfont.**
  §9's "no webfont anywhere" now rests on a true premise; the paragraph that
  claimed "Inter is already the app's face" is corrected in place.

**Didn't work**
- **First radius set was wrong.** Copied Doist's `badge` 4px and `dialog` 10px
  straight across — both dead on arrival, nothing here uses those values — and
  missed that `rounded-2xl` (16px) had 24 live call sites. Inventory the app's
  actual values *before* transcribing someone else's scale.
- **Aliasing spacing to `p-small`/`p-medium` was drafted and dropped** once it
  became clear Tailwind's default scale is already Doist's exact scale.
- **Adopting Doist's three weights (400/600/700) was dropped.** Their "medium"
  is 600 where Daybook's `font-medium` is 500, so following them would restyle
  every label in the app. Daybook already uses exactly three weights
  (normal/medium/semibold); the rule was written down, nothing changed.
- Their `hiddenVisually` was checked as a possible `sr-only` upgrade and is
  **weaker** than Tailwind's — no `position`, no `overflow`, no clip fallback.

**Open**
- **Type is migrated on four surfaces only.** The rest of the app carries
  `text-sm` ×56, `text-xs` ×42 and three arbitrary sizes (`text-[11px]` ×14,
  `text-[15px]`, `text-[10px]`). `text-subtitle` and `text-header` have no
  call sites until that lands.
- **New §12 gap: disabled controls fade with `opacity`.** Eight-ish sites use
  `disabled:opacity-30/40/50` — the exact pattern the Colour rule bans, and
  far under AA at 30%. Doist use `aria-disabled` instead, keeping the control
  focusable. Not fixed: `composer.ts`'s focus trap filters on
  `hasAttribute('disabled')` and must change with it.
- Offline queue still the one wholly unverified feature.
- `InvalidStateError: Transition was aborted` on dev-server reload — did not
  fire this session, but only navigations were driven, not reloads.
- No reference designs collected yet; the visual pass is still blocked on Noel.
- `DIGEST_FROM` still blocks multi-tenancy.

**Next**
Finish the type migration: move the remaining pages — `welcome.ts`,
`settings.ts`, `calendar.ts`, `reporting.ts`, `upcoming.ts`, `task-detail.ts`,
`day-detail.ts`, `date-picker.ts`, `capture.ts` — off `text-sm`/`text-xs` and
the three arbitrary sizes onto the six steps. `welcome.ts` carries the display
sizes (`text-3xl`, `text-4xl`) and is the one that needs a judgement call
rather than a rename, so leave it last.

**Touched** — `src/styles.css`, `AGENTS.md`, `BUILD-PLAN.md`,
`src/app/features/today/{task-row,today,composer,capture,task-detail}.ts`,
`src/app/shared/{shell,date-picker,empty-state,install-hint,popover,toasts}.ts`,
`src/app/features/{calendar/calendar,calendar/day-detail,login/login,reporting/reporting,settings/settings,upcoming/upcoming,welcome/welcome}.ts`


## 2026-08-25 · claude-code · redesign explored and dropped

**Did**
- Closed two open threads from 22 Aug on Noel's word: the four swipe constants
  in `shared/swipe.ts` are **fine by use, still unmeasured**, and the install
  hint **was seen on his iPhone**. §12's "Swipe thresholds are guesses" struck.
- Explored a ground-up redesign. Costed claymorphism, drafted three
  alternatives — Ledger, Instrument, Nocturne — with contrast verified for
  each. **None taken.** Full reasoning in §9 so it is not re-run.
- **Found that Inter has never been loaded.** `--font-sans` names it; there is
  no `@font-face`, no link in `src/index.html`, nothing in `public/`. The app
  has always rendered in `system-ui`. New §12 gap.
- Recorded the other two structural findings: no spacing/radius scale exists,
  and the palette already spends five semantic hues.
- No source changed, so **no build or test run this session**. Last real
  numbers remain 22 Aug: 527.78 kB initial, 55 tests in 4 files.

**Decided**
- **The look gets adapted from references, not designed from a brief.** Noel
  will collect designs and typefaces and bring them; expect colour and type
  inside the existing layout. §9, §5.4.
- **Design tokens come before any visual change.** Repainting on top of ad-hoc
  spacing just repaints the ad-hoc spacing. §4.
- **Next major work is design tokens, code quality and test coverage** — ahead
  of the visual pass and ahead of multi-tenancy. §4.
- **A dark theme is not a repaint.** On a dark field the semantic colours
  invert: `done-700` drops to 3.01:1 and `late-700` to 2.55:1, and those are
  the text shades. Applies whenever dark mode is next raised. §9.

**Didn't work**
- **Three attempts to close the design conversation with a choice all stalled.**
  Options were offered before Noel had anything to look at — ASCII wireframes
  and hex codes are not a design. He dropped each direction rather than picking
  one. If a visual choice is put to him again, **render it**; do not describe
  it.
- Claymorphism was talked out of the room, possibly harder than intended. The
  restrained version — depth only on things you can act on — was viable and
  went unbuilt. Worth re-offering if he circles back to soft depth.

**Open**
- The **offline queue** is still the only wholly unverified feature, and now
  also the highest-value target for the test-coverage work.
- `InvalidStateError: Transition was aborted` on every dev-server reload,
  unseen in a prod build.
- No reference designs collected yet — the visual pass is blocked on Noel.
- `DIGEST_FROM` still blocks multi-tenancy.

**Next**
Start the design-token pass: self-host a typeface to close the Inter gap, then
declare spacing, radius and type scales in `@theme` in `src/styles.css` and
migrate the core surfaces — `task-row.ts`, `shell.ts`, `today.ts`,
`composer.ts` — onto the fixed steps. Colour stays exactly as it is.

**Touched** — `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-22 · claude-code · signed-in a11y, swipe, install hint

**Did**
- **Swept every signed-in page for contrast in situ**, driving Noel's own Chrome
  so the audit finally had a session — the thing that had blocked it since
  21 Aug. Seven routes, zero failures. **The skip link was seen for the first
  time** and lands focus on `MAIN#content`.
- Four a11y fixes: `task-row` push button was `text-ink-400 opacity-60` = 2.38:1;
  `composer` + `toasts` got `lg:left-60` (they sat **120px** left of their
  column, not the ~112 §12 guessed); `composer` now traps Tab (22 elements
  behind the scrim were reachable); the hamburger was the one icon not
  `aria-hidden`.
- **Today splits into open work and a `Done today` section.** Built because
  `scene="clear"` was **unreachable** — completed rows stayed in the list, so an
  empty list could only mean an empty day. Noel chose making it reachable over
  deleting it. Seen rendering afterwards.
- **Swipe fixed on device**, both defects Noel found on his iPhone: the judder,
  and a left swipe on a finished row that armed and then did nothing.
- **iOS install hint built** (`shared/install-hint.ts` + `core/install.ts`), the
  last unbuilt item in §4. `Push` now shares its `isStandalone`.
- **Three §12 bugs fixed**: `ensure_user_setup` double call, silent rollover
  failure, transient 401 killing a batch. `notify` **deployed as v8**, confirmed
  by a clean 06:10 tick — checked `now()` in the same query first.
- Build **527.78 kB** initial / **127.57 kB** transferred. `ng test` **55** in 4
  files, up from 42 in 3. No schema change: 4 local migration files against 6
  live versions, unchanged. All six commits pushed; live chunks verified by
  content, not just by hash.

**Decided**
- **A pointer-driven `transform` must set `transition: none`, not `''`.** Empty
  removes the inline property and hands the element back to its class — and the
  row carries Tailwind's `transition` shorthand, which includes `transform` at
  150ms. That was the judder. §9.
- **Swipe is disabled outright on a finished row.** `onSwipe` has always guarded
  the push with `!done()` because completing pins `scheduled_date` and
  `day-detail` reads that pin, so pushing a done task rewrites history. The
  guard stays; the row is now inert instead of promising an action. §9.
- **The carried badge survives completion but goes neutral.** Noel's call on the
  §12 item. Red is reserved for overdue or badly avoided; keeping the ≥3
  escalation on a finished row reads as a reprimand. §9.
- **`Done today` is expanded by default and that is load-bearing** — a
  completing row unmounts from one list and mounts in the other, and the browser
  FLIPping it between them *is* the fourth beat. Collapsed, it would vanish. §9.
- **`verify_jwt` stays true on every `notify` deploy.** `auth.ts` says its
  JWT-claim branch is only safe while it is on. Do not deploy with it off.
- **`DIGEST_FROM` deliberately left** as the shared Resend sender, but recorded
  as a **hard blocker for multi-tenancy** — a second user silently gets no
  digest. §12.

**Didn't work**
- **A backtick inside a `template:` string, twice.** Same trap as 21 Aug. The
  compiler reports a dozen errors at the decorator and the last line of the
  file, never at the comment. Now a **hard rule in `AGENTS.md`** rather than
  only a log line — five builds across three sessions.
- **Do not eyeball offsets from a screenshot.** The capture is 1568px wide
  against a 1502px viewport, so everything is ~4% off. The composer looked
  ~112px out and measured 120. Read `getBoundingClientRect()`.
- **The extension stopped delivering key presses mid-session** — no `keydown`
  reached the document at all, so Tab did nothing and it read as a broken focus
  trap. Verified the trap by dispatching `KeyboardEvent`s instead and asserting
  `defaultPrevented`. `resize_window` also reported success while `innerWidth`
  never changed. **Confirm a synthetic input actually landed before believing
  what it shows.**
- **The 401 fix was wider than §12 recorded.** It called it a reminders bug;
  `due_digests` had the identical unguarded throw. The per-row `try`/`catch` and
  the `allSettled` isolation were already correct — the exposed call was the
  read that runs *before* either loop.

**Open**
- **The offline queue is the last wholly unverified feature.** Swipe is now
  verified on a real thumb; the queue never has been.
- **The swipe constants are still unjudged.** The gesture works and no longer
  judders, but nobody has said whether 96px/12px/0.2/180ms *feel* right.
- `InvalidStateError: Transition was aborted` fires on **every** dev-server
  reload, not once as §12 recorded. Reproducible, and it is `withViewTransition`
  losing its transition when the document is swapped. Not seen in a prod build.
- The install hint has **never been seen on an actual iPhone** — it is gated on
  not being standalone, so Noel must open the site in a normal tab, not the
  installed app.

**Next**
The UI design pass, and **Noel drives it** — he finds the current look
unprofessional and wants specific reactions rather than a guess. Offered to do a
structured pass first (spacing rhythm, type scale, density, empty states) so he
has something concrete to react to. Multi-tenancy is explicitly after that, and
`DIGEST_FROM` becomes blocking there.

**Touched** — `src/app/features/today/task-row.ts`, `src/app/features/today/today.ts`,
`src/app/features/today/composer.ts`, `src/app/core/task.store.ts`,
`src/app/core/session.store.ts`, `src/app/core/install.ts`,
`src/app/core/install.spec.ts`, `src/app/core/push.ts`,
`src/app/shared/install-hint.ts`, `src/app/shared/shell.ts`,
`src/app/shared/swipe.ts`, `src/app/shared/toasts.ts`,
`supabase/functions/notify/index.ts`, `AGENTS.md`, `BUILD-PLAN.md`

## 2026-08-22 · claude-code · capture chips, legacy keys revoked

**Did**
- **Legacy JWT API keys actually disabled**, 23:50:46Z — the open thread from the
  last entry. Verified after, not assumed: the key in git history now returns
  `401 Legacy API keys are disabled`, the publishable key still serves the Data
  API and `/auth/v1/settings`, and a manually fired cron tick returned `200` with
  both branches clean. GitHub alert can be closed as revoked.
- **Built the capture chip controls.** All four chips are always-visible buttons
  with placeholders; category popover fed by `TaskStore.categories`, quick/deep
  selector. New `writeToken` in `core/parse-capture.ts` does the text edit;
  `Capture.setToken` applies it and restores the caret. New shared `Popover`.
- **Fixed two pre-existing bugs found while testing**, neither caused by the
  chips: the date picker opened *below* a composer pinned to the bottom of the
  viewport, so the whole panel was off-screen and had never been clicked there;
  and the mirror div painted every `!energy` token amber, so `!deep` rendered
  beside a purple `deep` chip.
- Verified on screen at localhost, signed in: four chips, popovers opening
  upward, `#health` written into the text with the caret held in front of it,
  `!quick` → `!deep` replacing rather than appending. Noel confirmed the purple
  `!deep` in the mirror afterwards, so every part of the work has been seen.
- Build **527.43 kB** initial / **127.59 kB** transferred. `ng test` **42** in 3
  files, up from 31 — 11 new for `writeToken`. No schema change; 4 local
  migration files against 6 live versions, unchanged.

**Decided**
- **A chip replaces every token of its kind, not just the first.** `parseCapture`
  honours only the first `#tag`/`!energy`, so a leftover second one would render
  as a chip in the mirror and mean nothing. Settles open detail one — it was a
  correctness constraint, not a preference. §9.
- **Tokens append after the task text, never at the cursor.** `toCaptureText`
  already emits that order, so it is what an edit round-trips to. Settles open
  detail two. The caret is preserved, so typing continues in front of the
  appended token. §9.
- **Popover dismissal lives in one `shared/popover.ts`**, not a third copy of the
  date picker's backdrop-button trick. §9.
- **The task rows in the live project are test data, not Noel's real to-dos**
  (confirmed 22 Aug). Clicking through the signed-in app is therefore cheap —
  add, complete, reschedule freely rather than reaching for read-only checks.
  It does not make writes free: `day_snapshots` and the rollover counters are
  the evidence base for verifying rollover, so wrecking them costs the next
  verification, not Noel's day. §12.

**Didn't work**
- **Driving the browser by screenshot coordinates. Do not do it in this app.**
  The screenshot is 1568×745 while the viewport is 1502×714, so every raw
  coordinate lands ~4% off. Each such click hit the composer's full-viewport
  scrim and closed it — which read as an app bug and was chased as one twice.
  **Click by `ref` from `find`/`read_page`, never by coordinate.**
- **Typing without first confirming the composer is open and focused mutated
  real data, twice.** Keystrokes fell through to the page and hit row controls:
  `call the doctor` was moved to 23 Aug (`reschedule_count` 1). Restored to
  22 Aug / 0 with Noel's approval. Screenshot *after* opening and *before*
  typing — a ref click can land before the component mounts.
- **Assumed a task's `deep` badge was my stray typing; it was Noel using the app
  at the same time.** Reverted his deliberate change, then put it back. Two
  agents on one live database: ask before "restoring" anything. The `call the
  doctor` move to 23 Aug turned out to be his too — restored to 22 Aug in error,
  left there, because **every task row in the project is test data** (below).
- **Read `net._http_response` as evidence the cron had stopped**, when the next
  tick simply had not fired yet — misread the clock. Check `now()` in the same
  query before concluding anything is broken.

**Open**
- Swipe and the offline queue remain the only wholly unverified features.
- A transient 401 still abandons the whole reminders batch, `notify/index.ts:169`.
- No signed-in page has been through the a11y audit in situ, and the chips add
  three new popovers to that debt.
- `DIGEST_FROM` is still `onboarding@resend.dev`.

**Next**
Get the a11y audit done in situ on Today with the composer open — it is the one
page that now has three popovers, and `Popover` focuses its first button on open
but nothing returns focus to the chip when a value is chosen rather than
dismissed (`chooseCategory`/`chooseEnergy` hand the caret to the textarea by
design; confirm a keyboard user is not stranded). Use localhost, click by `ref`
only, and screenshot before typing.

**Touched** — `src/app/core/parse-capture.ts`, `src/app/core/parse-capture.spec.ts`,
`src/app/features/today/capture.ts`, `src/app/shared/popover.ts`, `BUILD-PLAN.md`

## 2026-08-22 · claude-code · deployed, push proven

**Did**
- **Deployed to Vercel.** Live at `https://daybook-bay.vercel.app` — Vercel
  appended `-bay` because `daybook.vercel.app` was taken. `vercel.json` sets
  build, `outputDirectory: dist/daybook/browser`, the SPA rewrite and cache
  headers. Verified against the running site, not assumed: `/today` → 200 HTML,
  `ngsw.json` and `ngsw-worker.js` → `no-cache`, hashed bundles → `immutable`,
  served from `syd1`.
- **Web Push proven end to end, the last unverified thing in Phase 5.**
  Installed to an iPhone home screen, subscribed, Apple endpoint stored.
  `call the doctor` set for 09:12 Sydney, sent 09:20:02, notification rendered,
  and **tapping it opened `/today/<id>`** — so `onActionClick` is proven, not
  just the encryption.
- **Digest's "Yesterday you finished" branch rendered** in the 22 Aug 07:00
  email (`call doctor`). Both digest branches now proven against a real inbox.
- **GitHub secret scanning finding resolved.** The flagged value was the real
  legacy **anon** key, used as a fixture at `auth.test.mjs:23`. Scanned every
  commit in history: no service role key, no `RESEND_API_KEY`, no VAPID private
  half, `schedule-notify.sql` placeholder intact. Fixture now built with a fake
  project ref; all 12 checks unchanged.
- **Advisors run**: zero missing-RLS errors. The two `SECURITY DEFINER` warnings
  are `ensure_user_setup` and `rollover_and_snapshot`, both intended — each
  derives `v_uid := auth.uid()`, bails on null, revokes `anon` in `0002`.
- Build **527.22 kB** initial / **127.47 kB** transferred. `ng test` **31** in 3
  files; `auth.test.mjs` 12/12; `webpush.test.mjs` 13/13. **No schema change**,
  so migrations are untouched: 4 local files against 6 live versions, as before.

**Decided**
- **Vercel, not Netlify.** Output is entirely static — all server work is in
  Supabase — so every host serves it identically and the tiebreaker is Noel's
  existing workflow: projects on Vercel, DNS on Cloudflare. Cloudflare stays
  **DNS-only, grey cloud**; proxying in front of Vercel stacks two CDNs.
- **Public keys stay in `environment*.ts`; they are NOT moved to host env vars.**
  Angular inlines them at build time, so they ship in the bundle regardless.
  Moving them would hide them from GitHub while still serving them to every
  visitor — same exposure, false sense of a fix. RLS is the control.
- **Fix a leaked public-by-design key by revoking it, not by rewriting history.**
  Rewriting `master` for an anon key is disproportionate.
- **Capture gets manual controls, and they rewrite the text.** `value()` stays
  the single source of truth; chips remain a pure render of `parsed()`. No dual
  state, no per-field conflict rule, `toCaptureText()` round-trips unchanged —
  and the user sees the token appear, which teaches the typed syntax.
- **Chips only, no parallel manual form.** A second labelled-field UI would be
  two UIs to maintain and would undercut the app's premise.

**Didn't work**
- **Assumed the deploy would be `daybook.vercel.app`.** It is `daybook-bay`.
  Had that gone into the Supabase allow list, sign-in would have bounced to
  login **with no error shown** — the documented silent failure. Read the URL
  off the deployment; do not predict it.
- **Told Noel to install via Safari and warned Chrome might not give a real
  PWA. Wrong.** Chrome on iOS produced a genuine standalone install with a
  working `web.push.apple.com` subscription. Every iOS browser is WebKit; the
  Safari-only advice was folklore.
- **Nearly debugged a transient as a code bug.** The 09:15 tick returned
  `401 JWT issued at future` on `due_reminders` and I went reading `index.ts`,
  `webpush.ts` and the migration looking for a JWT defect. There is none — it
  was clock skew, and the 09:20 tick sent fine. **Look at the next tick before
  reading the code.** `pg_cron`'s `status = 'succeeded'` means only that the
  SQL ran; `net._http_response.content` holds the function's actual reply and
  is where this was visible immediately.
- **`node --test` with no path finds only 2 tests.** The suites are under
  `supabase/functions/notify/`. Earlier entries citing "12 checks" and "13
  checks" meant **assertions inside one `test()` each**, not test counts — the
  runner reports `tests 1` per file. Not a regression.

**Open**
- **Unconfirmed whether the legacy JWT API keys were actually revoked** in
  Supabase. Advised and verified safe — the client uses `sb_publishable_`,
  `notify` uses `sb_secret_`, and the live cron's command text carries an
  `sb_secret_` key — but Noel never confirmed doing it. Until then the anon key
  in git history is live, and the GitHub alert is still open.
- **Swipe and the offline queue are still untested.** Noel had the phone in
  hand and these were not exercised. They are now the only unverified features.
- **A transient 401 abandons the whole reminders batch** — `index.ts:169`
  throws rather than skipping one row. Invisible at one user. §12.
- **No signed-in page has been through the a11y audit in situ.** Unchanged from
  21 Aug, and now easier: there is a real HTTPS deployment to point a browser at.
- `DIGEST_FROM` is still `onboarding@resend.dev`; Web Push and VAPID still need
  explaining to Noel properly.
- Local `master` is **1 commit ahead of origin** — this entry. `90d1f64` was
  pushed during the session to trigger the Vercel build, so pushing this one
  will also redeploy (docs only, no bundle change).

**Next**
Build the capture chip controls in `features/today/capture.ts`: make all four
chips always-visible buttons with placeholders (`Today` · `Add time` ·
`#Category` · `Energy`), add a category popover fed by the user's categories
and a quick/deep energy selector, each writing its token into `value()` while
preserving cursor position. The date chip at line 96 already works this way —
extend that pattern, do not invent a second one. Two details still to settle:
whether picking a category **replaces** an existing `#tag` or appends a second,
and whether tokens insert at the cursor or append at the end.

**Touched** — `vercel.json`, `BUILD-PLAN.md`, `README.md`,
`supabase/functions/notify/auth.test.mjs`, `docs/SESSIONS.md`

## 2026-08-21 · claude-code · phase 6 close-out

Close-out only. The session's substance is in the entry below, written as the work
landed; this records the verification run afterwards and nothing new was built.

**Did**
- **Full suite run, all four, not quoted from memory**: `ng build` **526.96 kB**
  initial / **127.46 kB** transferred; `ng test` **31** passing in 3 files;
  `auth.test.mjs` **12**; `webpush.test.mjs` **13**. The entry below quoted only
  the first two — the node suites had not been run at the time it was written.
  All four pass, so Phase 6 broke nothing in the notify function.
- Tree clean, one commit this session: `6e79403`.
- **No schema change**, so no migration to reconcile. `supabase/migrations/` still
  holds 4 files against the 6 live versions, unchanged since 21 Aug.
- **`BUILD-PLAN.md` needed no edit in this close-out** — §3, §4, §5, §9 and §12
  were all brought current in `6e79403`.

**Open**
- Unchanged from the entry below. The one that matters: **no signed-in page has
  been through the accessibility audit in situ**, so the skip link and all four
  empty states are still unseen on a real page.

**Next**
Unchanged: sign in on a desktop browser, re-run the §9 contrast audit in the
console across `/today`, `/upcoming`, `/calendar/:date` and `/reporting`, Tab
from the top of `/today` to confirm the skip link lands focus on `<main>`, and
empty the list to see the three Today scenes.

**Touched** — `docs/SESSIONS.md`

## 2026-08-21 · claude-code · phase 6 built, a11y pass

**Did**
- **Phase 6 complete, all five items.** Icons, hero, empty states, a11y pass;
  the chart line was already satisfied by the Reporting fortnight chart and
  needed nothing built.
- **Real app icons.** `public/icon.svg` is the master — yesterday's page behind
  today's, with a tick. `tools/build-icons.mjs` rasterises it to the eight
  manifest sizes, `favicon.ico` and a new apple-touch-icon via **headless
  Chrome**; there is no rsvg/ImageMagick/sharp on this machine. Re-run it when
  `icon.svg` changes.
- **`/welcome`**, the marketing view. Hero performs the carry-over rather than
  describing it: a row lifts off Tue 19, lands on Wed 20, badge ticks ×1 → ×2.
  `authGuard` now redirects signed-out visitors here instead of `/login`.
- **`shared/empty-state.ts`**, four SVG scenes. Today picks between three;
  day-detail uses `quiet` for both its cases.
- **`shared/mark.ts`** — the logo, now on `/welcome` and `/login`. Login moved
  onto the same ink field as the hero and lost its stale "Google sign-in stays
  inactive" line, which had been false since 17 Aug.
- **Accessibility pass found four real defects.** All four fixed and written up
  in `BUILD-PLAN.md` §9. Verified by compositing every text node against its
  real background stack in a canvas — `/welcome` and `/login` both return zero
  contrast failures, and all fourteen colour pairs the app uses pass AA.
- Build **526.96 kB** initial / **127.46 kB** transferred, up from 517.32 kB and
  still under the 560 kB budget. `ng test` **31** passing in 3 files.

**Decided**
- **Illustrations are hand-drawn SVG, not AI-generated raster.** No
  image-generation tool exists here, and a line drawing wins anyway for a PWA:
  scales, few hundred bytes, no network on a cold offline load, cannot drift
  from the palette. Generated art can drop into the same `scene` input later.
- **`authGuard` → `/welcome`, not `/login`.** A stranger should be told what
  the app does before being asked to sign in. `/welcome` carries `guestGuard`,
  so the conditions are complementary and cannot loop.
- **A completed row is no longer faded with `opacity`.** The fade was never one
  of the four documented beats of the completion choreography, and it dragged
  the whole row under AA. Recorded in `AGENTS.md` as a general rule.
- **`ink-400` is now the lightest colour allowed on text**, tuned against
  ink-50. `ink-300` holds the old value for decoration. In `AGENTS.md`.

**Didn't work**
- **Backticks inside a component's `template`/`styles` template literal end the
  string.** Cost three failed builds with errors pointing at the wrong line —
  `TS2554: Expected 1 arguments, but got 3` on the `styles:` key, not on the
  backtick. If a component suddenly will not parse, grep it for `` ` ``.
- **Headless Chrome clamps its window to ~500px wide**, so a `--window-size=390`
  screenshot renders the layout at 500 and crops it to 390. Spent a detour
  chasing a mobile overflow bug that did not exist — the giveaway was the hero
  card starting at x≈90, exactly where a 500px layout centres it. **Measure
  `document.scrollWidth` before believing a narrow screenshot.**
- **`--headless=new` hangs and never exits** in this environment; it had to be
  `pkill`ed twice and left a profile lock that broke the next two runs. Use the
  old `--headless`.
- **Programmatically calling `.focus()` does not reliably match
  `:focus-visible`**, so an audit that focuses elements in a loop reports every
  one as having no focus ring. Send a real `Tab` and screenshot instead.
- **A naive contrast script that regex-parses `getComputedStyle().color` is
  wrong** — Tailwind alpha utilities compute to `oklab(... / a)`, and grabbing
  the first three numbers produced five false failures. Resolve and composite
  the colour in a canvas; the browser is the only correct parser.
- **A blanket `prettier --write src/app/**/*.ts` reformatted twelve files this
  session never touched.** Reverted them. The repo is not prettier-clean;
  format only the files you actually changed.

**Open**
- **No signed-in page has been through the audit in situ.** The browser profile
  driving it has no Supabase session, so `/welcome` and `/login` are the only
  pages swept end to end. The tokens are global and every pair was checked in
  isolation, but **the skip link and all four empty states have never been seen
  rendered on a real page.** First thing worth doing next session.
- The 22 Aug 07:00 digest still has to be read to prove the "Yesterday you
  finished" branch — unchanged from the entry below, and still not yet due at
  the time of writing (it is 22:4x Sydney on the 21st).
- Push still undelivered to any device; `DIGEST_FROM` still the shared Resend
  sender; swipe and the offline queue still unverified. All unchanged.

**Next**
Sign in on a desktop browser and walk `/today`, `/upcoming`, `/calendar/:date`
and `/reporting` with the contrast audit in `BUILD-PLAN.md` §9 re-run in the
console, to confirm in situ what was only confirmed by token. While there,
Tab from the top of `/today` to check the skip link lands focus on `<main>`,
and empty the list to see the three Today scenes.

**Touched** — `public/icon.svg`, `tools/build-icons.mjs`,
`src/app/features/welcome/welcome.ts`, `src/app/shared/empty-state.ts`,
`src/app/shared/mark.ts`, `src/app/core/page-title.ts`,
`src/app/core/auth.guard.ts`, `src/app/app.ts`, `src/app/app.config.ts`,
`src/app/app.routes.ts`, `src/app/shared/shell.ts`,
`src/app/features/today/task-row.ts`, `src/app/features/today/today.ts`,
`src/app/features/login/login.ts`, `src/app/features/calendar/day-detail.ts`,
`src/styles.css`, `src/index.html`, `public/manifest.webmanifest`,
`AGENTS.md`, `BUILD-PLAN.md`

## 2026-08-21 · claude-code · session close-out, cron verified stable

Close-out only. The session's substance is in the two entries below, written as the work
landed; this records verification done after them and nothing new was built.

**Did**
- **Cron confirmed stable across three consecutive ticks** — 12:00, 12:05, 12:10. The
  `JWT issued at future` error at 12:00 has not recurred, which settles it as the
  transient key-age skew diagnosed below rather than anything in this repo. 8 ticks
  total; the 5 before 12:00 are the placeholder 401s.
- Full suite run, not quoted from memory: `ng build` **517.32 kB** initial / **127.64 kB**
  transferred; `ng test` **31** passing in 3 files; `auth.test.mjs` **12**;
  `webpush.test.mjs` **13**.
- `list_migrations` confirms `daybook_cron_extensions` (`20260821112225`) applied live.
  Folder holds 4 files against 6 live versions, as before — 0002 folds three of them.
- Tree clean, 3 commits this session: `337a2ec`, `7b5899c`, `19a2198`.

**Open**
- Unchanged from the entry below: the 22 Aug 07:00 digest still has to be read to prove
  the "Yesterday you finished" branch; push still undelivered to any device; `DIGEST_FROM`
  still the shared Resend sender; and the older Phase 3/4 threads all still stand.
- **`BUILD-PLAN.md` needed no edit in this close-out** — §3, §5, §12 and §13 were brought
  current in the two commits below.

**Next**
Read the 22 Aug 07:00 digest, confirm `call doctor` appears under "Yesterday you finished".
If it does, the digest is fully proven and Phase 6 is the next real work.

**Touched** — `docs/SESSIONS.md`

## 2026-08-21 · claude-code · cron live, Daybook runs itself

**Did**
- **Scheduled the cron. Daybook now runs unattended** — the last thing in Phase 5 that
  was waiting on a human. `daybook-notify`, job 1, `*/5 * * * *`, active.
- First clean tick 12:05 UTC: `{"digests":{"sent":0,"failed":0},"reminders":{"sent":0,
  "failed":0}}`. `sent: 0` is correct — `digest_last_sent_on` is already today. First
  unprompted digest is 22 Aug after 07:00 Sydney.
- **The service-role positive path is now proven**, which the previous entry listed as
  untestable without putting the key in a transcript. The cron proved it instead: 401s
  became a 200 the moment the real key went in, so `isServiceRole` accepts service role
  and rejects anon, both confirmed against the live endpoint.
- **Hardened the guard before it could bite.** A modern `sb_secret_…` key is opaque, not
  a JWT, so claim-reading alone would have 403'd the cron forever. `auth.ts` now also
  matches the token against `SUPABASE_SERVICE_ROLE_KEY` in constant time. 12 checks
  passing, up from 9.
- Recorded five pg_cron/pg_net gotchas in `BUILD-PLAN.md` §13 — see Didn't work.

**Decided**
- **Accept two token shapes in `isServiceRole`**: an exact match against
  `SUPABASE_SERVICE_ROLE_KEY` (the only way to recognise an opaque `sb_secret_…` key)
  or a JWT with `role = service_role`. Check 1 is a secret comparison and so survives
  `verify_jwt` being turned off; check 2 does not. Both documented in the function.

**Didn't work**
- **`cron.job_run_details.status` said `succeeded` for five consecutive ticks while every
  HTTP call was returning 401.** It reports whether the SQL ran, and `net.http_post` only
  *queues* a request — so it returns "1 row" and succeeds while the endpoint rejects
  everything. **`net._http_response` is the only honest source.** This is the single most
  misleading thing in the stack; it is now §13.
- **A 200 in `net._http_response` is still not success.** The 12:00 tick was a 200 whose
  body was `{"digests":{"error":"due_digests: JWT issued at future"}}`. `notify` catches
  its own failures by design so a broken digest cannot take reminders down, which means
  the status code cannot tell you the job worked. Read `content`.
- **Burned ~15 minutes on "JWT issued at future" before spotting it was upstream.** At the
  *same millisecond*, one client and one token: `due_digests` 401, `due_reminders` 200.
  That split is impossible for a bad key or a bad guard and points straight at Supabase's
  own validators disagreeing about the clock. Noel's key was ~2 minutes old; its `iat` was
  ahead of one validator. Cleared on the next tick, untouched. **A key under a few minutes
  old is not worth debugging.**
- First run of `schedule-notify.sql` went in with `YOUR_SERVICE_ROLE_KEY` still in it.
  Harmless — five 401s, function never ran, nothing written. Fixed by re-running the file:
  `cron.schedule` upserts on job name, so there is no duplicate and no `unschedule` step.

**Open**
- **The digest's "Yesterday you finished" branch has still never rendered.** The 22 Aug
  07:00 digest should exercise it with `call doctor`. Worth actually reading that email —
  it is the last unproven branch of the template.
- **Push has still never been delivered to a device.** Unchanged: needs a built PWA over
  HTTPS installed to a home screen. The reminders half of the cron is running and finding
  nothing, because `push_subscription` is null.
- **`DIGEST_FROM` is `onboarding@resend.dev`**, which Resend delivers only to the account
  owner. Fine for one user, blocks the second.
- Everything else from the previous two entries stands: duplicated `ensure_user_setup`,
  silent rollover failure at `task.store.ts:253`, carried badge dropped on completion,
  `fixed inset-x-0` centring, swipe and offline queue unverified, swipe thresholds guessed.

**Next**
Read the 22 Aug 07:00 digest and confirm the "Yesterday you finished" section renders with
`call doctor`. That closes the digest completely. After that the only Phase 5 thread left
is the push wire format, which needs a real device — or start Phase 6.

**Touched** — `supabase/functions/notify/auth.ts`, `supabase/functions/notify/auth.test.mjs`, `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-21 · claude-code · digest delivered, notify locked down

**Did**
- **The digest works end to end.** Noel created the Resend account and set
  `RESEND_API_KEY` and `DIGEST_FROM` as Edge Function secrets. A hand invocation of
  `notify` sent a real email; confirmed **in the Gmail inbox, not spam**: "Daybook — 1 on
  today", from `onboarding@resend.dev`, 21:17 Sydney, body `Carried over / call physio ×3 /
  On today / call physio`. `digest_last_sent_on` went to `2026-08-21`, which only
  `mark_digest_sent` writes and only after a 200 from Resend.
- **Found and closed a real hole: `notify` was callable with the anon key.** Not theory —
  the live digest above was triggered with the anon key from the public browser bundle.
  `verify_jwt: true` only proves a token was signed by this project; it accepts anon. Every
  RPC inside runs with the service role, so `0003`'s `service_role`-only grants were
  bypassed entirely by the HTTP endpoint.
- Added `supabase/functions/notify/auth.ts` — `isServiceRole()` decodes the bearer token
  and requires `role === 'service_role'`, else 403. Wired into `index.ts`, deployed (v6).
  Verified live: anon → **403**, no header → **401** at the gateway.
- `auth.test.mjs` beside it, importing the real `auth.ts` — **9 checks passing**, including
  the project's actual anon key and a `role` nested under `app_metadata` rather than top
  level.
- **`pg_cron` and `pg_net` enabled** as migration `0004_cron_extensions`, applied live.
- `ng build` 517.28 kB initial / 127.67 kB transferred. `ng test` **31** passing, 3 files.
  Both unchanged — nothing in `src/` was touched.

**Decided**
- **Authenticate on the JWT `role` claim, not on `verify_jwt` alone.** Chosen over a shared
  secret because the cron already had to carry the service role key, so it adds nothing for
  Noel to generate, store or rotate. The guard does **not** re-verify the signature — the
  gateway already did — so **`verify_jwt` must stay true** or it becomes forgeable. Said in
  the code comment and in §9, because it is the kind of thing a future deploy quietly
  breaks.
- **Extensions are a migration, the schedule is not.** Enabling `pg_cron`/`pg_net` carries
  no secret, so it is tracked like any schema change. `schedule-notify.sql` still carries
  the service role key in its command text and stays a by-hand run.
- **`DIGEST_FROM` is `onboarding@resend.dev` for now** — no DNS, so the digest could be
  tested that night instead of waiting on domain verification. Resend only delivers it to
  the Resend account owner, so a verified domain is required before a second user exists.

**Didn't work**
- **The "pre-flight that sends nothing" was wrong.** Read `digest_enabled` as `false` at
  21:11, told Noel the invoke would be inert, and it sent a live email — he had flipped it
  in Settings in between. No harm, but **re-read mutable state immediately before acting on
  it**, not five minutes earlier.
- **The service-role *positive* path is still unproven end to end.** There is no way to test
  it without the service role key entering the transcript, so it is covered by the unit test
  only. If the guard is wrong, the cron 403s silently forever — see Open for how to check.
- Extracting `isServiceRole` into `auth.ts` was a second pass. The first version lived in
  `index.ts`, which cannot be imported from Node (`Deno.serve` at module load), so the test
  duplicated the implementation and tested a copy. Same split as `webpush.ts`.

**Open**
- **The cron is still unscheduled** — the last thing standing between Daybook and running
  unattended. Noel runs `supabase/cron/schedule-notify.sql` in the SQL editor with the
  service role key pasted in.
- **Verify the first tick rather than assuming it.** `net.http_post` is fire-and-forget:
  `select * from net._http_response order by created desc limit 5;` shows the status, and
  `select * from cron.job_run_details order by start_time desc limit 20;` shows the job. A
  **403 there means the guard rejected the cron** and the key is wrong or the claim shape is
  not what the test assumed.
- **The digest's "Yesterday you finished" branch has never rendered.** `completed_yesterday`
  keys off `scheduled_date = yesterday`; nothing scheduled on 20 Aug was completed.
  `call doctor` is scheduled 21 Aug and completed, so the 22 Aug digest should exercise it.
  Worth actually reading that email.
- **The previous entry is wrong on one point.** It says every test mutation was reverted and
  both tasks left incomplete; `call doctor` is completed at `2026-08-21 10:51Z` (20:51
  Sydney). That is why the digest listed one task, not two — correct behaviour, wrong log.
- Everything else from the previous entry still stands: duplicated `ensure_user_setup`,
  the silent rollover failure at `task.store.ts:253`, the carried badge dropping on
  completion, `fixed inset-x-0` centring, unproven push wire format, swipe and offline queue
  unverified, swipe thresholds still guesses.

**Next**
Run `supabase/cron/schedule-notify.sql` with the service role key, wait one five-minute
tick, then read `net._http_response` for the status. A 200 closes Phase 5's digest half
completely; a 403 means the guard is wrong and `auth.ts` needs the real claim shape.

**Touched** — `supabase/functions/notify/auth.ts`, `supabase/functions/notify/auth.test.mjs`, `supabase/functions/notify/index.ts`, `supabase/migrations/0004_cron_extensions.sql`, `supabase/cron/schedule-notify.sql`, `BUILD-PLAN.md`

## 2026-08-21 · claude-code · phases 3–5 clicked through

**Did**
- **Clicked through all seven pages signed in, against live data.** The sign-in wall that
  blocked the last session was not there — the dev server was already up on 4200 with a
  live session. Everything below was seen on screen, not read out of the code.
- **The carried badge renders** — `carried ×3` / `carried ×2`, the numbers §3 predicted.
  Closes the oldest open thread in this log.
- **Completing a task works and was watched.** Green check, animated strike, `done 20:11`,
  header `2 to go` → `1 to go` + `1 done today` → `All clear / 2 done today`.
- **The View Transition re-sort is real**: the completed row visibly moved from position 1
  to below the incomplete row. Un-completing restores the badge and clears `completed_at`.
- Also seen working: toast+Undo on add/delete/complete; `/today/:id` stats and
  `toCaptureText` seeding; Save round-trip with no duplicate category; Delete; composer
  token highlighting; Upcoming; Calendar's hairline/green/red-dot distinction;
  `/calendar/:date` resolving `now on Today · carried ×3`; Reporting's `—` vs `0` table.
- **Fixed the `settings.ts` timezone select**, which rendered `America/Los_Angeles` while
  `user_settings.timezone` held `Australia/Sydney`.
- **Wired the VAPID public key** into both `environment*.ts`. Noel generated the pair in a
  separate terminal and set all three secrets. Settings moved `unconfigured` →
  `no-service-worker`, as expected in a dev build.
- `/supabase/.temp` added to `.gitignore`. `ng build` 517.28 kB initial / 127.67 kB
  transferred. `ng test` **31** passing.
- Every test mutation reverted: both tasks incomplete at carried 3 and 2, scratch task
  deleted, `digest_enabled` back to false, no stray categories.

**Decided**
- **The selection is bound on the `<option>` via `[selected]`, never as `[value]` on the
  `<select>`.** A `[value]` binding on a select runs before `@for` has rendered the
  children, matches nothing, and silently falls back to `selectedIndex 0` — which, because
  `zones()` is sorted, was `America/Los_Angeles`. Applies to every future select here.
- **VAPID keys are Noel's to generate and hold, never an agent's.** Generated outside this
  session so the private half never entered a transcript. It now exists only in Noel's
  password manager and in Supabase secrets, and the latter is write-only — it cannot be
  read back, so losing the former means regenerating and killing every subscription.

**Didn't work**
- **`find` / `read_page` do not surface `role="status"` live regions.** Burned two calls
  concluding the toast was absent from the a11y tree. The markup is correct
  (`role="status"`, `aria-live="polite"`). Check overlay a11y by walking the DOM instead.
- **Screenshot coordinates are not stable between calls.** The capture viewport oscillates
  between 1568×680 and 1502×652 and clicks land ~35px off. Use element refs from `find`.
- **The dark vertical bar down the right of every screenshot is a capture artifact**, not a
  layout bug — `main` measures full width and nothing scrolls. Do not chase it again.
- **Content centring is correct** (container centre 863 = content-area centre 863). Another
  misread of scaled screenshots. Three of the four "bugs" this session spotted by eye were
  artifacts; all three died on one DOM measurement. **Measure before reporting.**

**Open**
- **Noel wants Web Push and VAPID explained properly.** The explanation given was accepted
  but not fully absorbed. Agreed to hold it as a **discovery step at the end of the build**
  rather than expand on it now.
- **`ensure_user_setup` fires twice on every load**, consistently 2:1 against
  `rollover_and_snapshot`. Idempotent, so no data harm, but four wasted round trips per
  open against the sub-100ms bar in `AGENTS.md`. Cause not investigated.
- **Seen once, never reproduced:** `rollover failed` plus `InvalidStateError: Transition
  was aborted` on the genuinely cold first load, then clean across four reloads. Related
  and worse: `task.store.ts:253` logs and silently `return`s, so a real rollover failure
  shows the user nothing at all.
- **A row's carried badge is dropped the instant it completes** (the category chip is
  kept), so the count disappears exactly when it means most. Noel's call.
- Toasts and the composer use `fixed inset-x-0`, centring on the viewport ~112px left of
  the content column on desktop.
- **Push wire format still unproven** — no device has received one. Needs a built PWA over
  HTTPS installed to a home screen.
- **Still needed from Noel:** Resend account, then `supabase/cron/schedule-notify.sql`.
  Neither `pg_cron` nor `pg_net` is installed — confirmed against `pg_extension`.
- Swipe thresholds still guesses; still want the Todoist **iOS** captures.

**Next**
Resend: create the account, set `RESEND_API_KEY` and `DIGEST_FROM` as Supabase secrets,
flip `digest_enabled` on in Settings, then invoke the `notify` function by hand and read
what it reports back before scheduling any cron.

**Touched** — `src/app/features/settings/settings.ts`, `src/environments/environment.ts`, `src/environments/environment.prod.ts`, `.gitignore`

## 2026-08-21 · claude-code · phases 3, 4 and 5 built

**Did**
- **Built all of Phases 3, 4 and 5 in one sitting**, on Noel's instruction to take it to the end of Phase 5. 13 new files, ~2,900 lines. **None of it has been opened by a person** — see Open.
- **The multi-day rollover in the entry below had already run.** Snapshots exist for 19 and 20 Aug; `call physio` and `call doctor` are on 21 Aug at `carried_over_count` 3 and 2 — exactly the numbers that entry predicted. Spent unwatched, again.
- Phase 3.3: `features/today/task-detail.ts` at `/today/:id`, a **sibling** route so the list unmounts. Edit reuses `Capture`, seeded by new `toCaptureText()`. Delete + Undo that reinserts under the same id.
- Phase 3.4: `features/today/composer.ts`. Bottom-anchored, `day` input presets the chip. Today's always-visible box is gone.
- Phase 3.5: `shared/shell.ts` as a **layout route**. Four items, not three — Calendar promoted to top level.
- Phase 3.6: `core/view-transition.ts`. Completion re-sorts inside `document.startViewTransition()`; the browser FLIPs the rows. Strike is an animated `background-size`, since `text-decoration` cannot animate.
- Phase 3.7: `shared/swipe.ts`, touch pointers only, fires on release.
- Phase 4: `features/calendar/{calendar,day-detail}.ts`, category filter chips, and `core/offline-queue.ts` (localStorage, replays on `online`/`visibilitychange`/startup-before-rollover).
- Phase 5: `core/settings.store.ts`, `features/settings/settings.ts`, `features/reporting/reporting.ts`, `core/push.ts`, migration `0003_digest_and_reminders.sql` (**applied**), Edge Function `notify` (**deployed, live, returns 200**), `scripts/generate-vapid.mjs`, `supabase/cron/schedule-notify.sql` (**deliberately not applied**).
- `toggleComplete` and `reschedule` were refactored onto the new `update()`, so offline handling exists in exactly one place.
- `ng build` 517.19 kB initial / 127.56 kB transferred, every page lazy. **Initial budget raised 500 → 560 kB.** `ng test` 20 → **31**. `webpush.test.mjs` 13/13.
- `BUILD-PLAN.md` §3, §4, §5, §5.1–5.3, §9 (new "Phases 3 to 5, 21 Aug" block, twelve decisions) and §12 all rewritten. `AGENTS.md` gained a Motion section, the service-role `SECURITY DEFINER` exception, and the two new stores.

**Decided**
- **Completion motion is delegated to the browser.** Rows already had `view-transition-name`; re-sorting inside a View Transition gives the row-leave and the gap-close for nothing. The zoneless `appRef.tick()` inside the callback is load-bearing.
- **The edit box never round-trips the date through the text.** `toCaptureText` writes `#tag` and `!energy` only; the day rides in the picker. Re-parsing "thursday" against a new today would move the task a week.
- **Editing a date later counts as a push; earlier does not.** Dragging work forward is not avoidance, and counting it would poison `reschedule_count`.
- **Calendar is top-level nav, breaking the plan's three-item model.** Finding a day is not a statistic about days.
- **A past day with no snapshot row renders differently from a day with nothing done** — hairline vs empty cell, in both calendar and chart. Collapsing them makes a holiday look like a failure.
- **Offline queues on a dropped connection, rolls back on a rejection** (`isOffline()`). Queueing an RLS error retries forever and blocks everything behind it.
- **Task inserts now carry a client-generated id** instead of stripping it, so offline edits can queue against an id that survives replay.
- **Cron functions are the documented exception to the `auth.uid()` rule** in `AGENTS.md` — service_role only, guard would break them.
- All twelve in `BUILD-PLAN.md` §9.

**Didn't work**
- **`interface X extends Document { startViewTransition?: ... }` does not compile.** The DOM lib already types it as non-optional, so a widening override is an error. Use `document.startViewTransition?.bind(document)` — optional call as a *runtime* guard, not a type one.
- **`class="task-text"` + `[class.is-done]` + `[class]="..."` on one element is a trap.** The `[class]` string binding fights the static class and the per-class bindings. Split into `[class.x]` bindings only.
- **`esbuild --loader=ts` only applies to stdin**; pass the `.ts` path directly. Then it turned out not to be needed at all — Node 24 strips types on import, so `webpush.test.mjs` imports `webpush.ts` unchanged.
- **`npm:web-push` is not usable on Deno Deploy** (assumes Node crypto). RFC 8291 + 8292 written out on Web Crypto instead, ~80 lines. Do not try the package again.
- **The agent could not verify any of this in a browser.** Chrome redirected straight to `/login`, and signing in is Google OAuth — off-limits. Two hours of work, zero pixels seen. **If a future session needs visual verification, that has to be arranged up front, not discovered at the end.**

**Open**
- **Nothing in Phases 3–5 has been used by a person.** This is the single biggest risk in the repo now. It builds and the tests pass; that is not the same as the pages being right. Expect real bugs on first open.
- **Three things need Noel and cannot be done by an agent:** a Resend account + `RESEND_API_KEY`/`DIGEST_FROM`; `node scripts/generate-vapid.mjs` with both halves into secrets and the public half into both `environment*.ts`; and running `supabase/cron/schedule-notify.sql` with the service role key. Until all three, nothing sends. **Do not use the VAPID pair printed in this session's transcript — regenerate it.**
- **Web Push wire format is unproven.** The crypto round-trips and the JWT verifies, but no real subscription has ever received one. First live send is the test.
- **Swipe thresholds are guesses**, gathered at the top of `shared/swipe.ts`. Still want the Todoist **iOS** captures.
- Unchanged: completing a task and the carried badge are still unseen by a person; no hosting, no CI.

**Next**
Sign in and click through all seven pages in order — Today, `/today/:id` (edit + delete), Upcoming, Calendar, `/calendar/:date`, Reporting, Settings — with the console open, and write down what breaks. Nothing else should be built until that list exists.

**Touched** — `src/app/core/{task.store,parse-capture,view-transition,offline-queue,settings.store,push}.ts`, `src/app/features/today/{today,capture,task-row,task-detail,composer}.ts`, `src/app/features/{upcoming,calendar,reporting,settings}/`, `src/app/shared/{shell,swipe}.ts`, `src/app/app.{routes,config}.ts`, `src/styles.css`, `supabase/migrations/0003_digest_and_reminders.sql`, `supabase/functions/notify/`, `supabase/cron/schedule-notify.sql`, `scripts/generate-vapid.mjs`, `BUILD-PLAN.md`, `AGENTS.md`, `angular.json`

## 2026-08-21 · claude-code · rollover happened on its own

**Did**
- **No code.** Same session as the entry below, left open across three days; the working tree has not moved from `9fdbdf1`. `ng test` 20 passing and `ng build` 491.03 kB initial / 122.73 kB transferred re-run on 21 Aug, unchanged.
- **Read the live tables and found a real overnight rollover had already run**, unattended, on 19 Aug. `day_snapshots` has a row for 18 Aug — `completed_count` 0, `carried_count` 1, `carried_task_ids` = the `call physio` id. That task moved 18 → 19 Aug with `carried_over_count` 0 → 1.
- This closes the oldest open thread in this log. It had been "not done by a person" for four sessions; it turns out it did not need a person.
- `BUILD-PLAN.md`: §3's "Phase 2 is half verified" rewritten to "nearly verified" with the snapshot evidence, §4 item 0 rewritten, §5 feature 6 and §12's task-loop gap updated.
- `call physio` also carries `reschedule_count` 1 — the row's `→ Tomorrow` button, pressed by Noel at some point after 18 Aug. Not from this session; nothing here clicks it.

**Decided**
- Nothing decided. This session only read.

**Didn't work**
- Nothing was abandoned. One correction to method, though: the 18 Aug entry below reports the task loop as unverified on the strength of nobody having *watched* it. The evidence was sitting in `day_snapshots` and cost one query. **Check the tables before writing "unverified by a person" again** — the app records its own behaviour and the log had been repeating a stale claim for three entries.

**Open**
- **A live multi-day rollover is queued and untouched.** The app has not been opened since 19 Aug. `call physio` and `call doctor` both still sit on 19 Aug, and there are no snapshots for 19 or 20. The next open must snapshot both missed days and move both tasks to the day it is opened, incrementing `carried_over_count` by the days skipped, not by one — `call physio` 1 → 3, `call doctor` 0 → 2. That is the path migration `daybook_carry_count_by_days_not_opens` exists for and it has never run against a real gap. **Opening the app spends it.** Deliberately not triggered here; it is Noel's to watch.
- **Completing a task is now the only part of the loop with no evidence at all.** The single `completed_at` in the table is from 17 Aug and predates the current UI.
- Nobody has seen the carried badge render. The data is right; the pixel is unproven.
- Unchanged: Undo is still the only delete and lasts six seconds; Phase 3 items 6 and 7 blocked on Todoist **iOS** captures; Settings-as-modal and the Today strip's fate after Upcoming still Noel's call.

**Next**
Open the app and watch the queued rollover land, then check the two tasks against the numbers predicted above before doing anything else — it is one page load and it cannot be re-run. Then Phase 3 item 3, `/today/:id` plus inline edit, as the entry below sets out.

**Touched** — `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-18 · claude-code · add toast, task loop closed

**Did**
- **Phase 3 item 1 built.** `TaskStore.addFromCapture` toasts `Added to <day>.` with an Undo. Phase 3 is now items 1 and 2 of 7.
- New `sentenceDate(date, from = today())` in `core/dates.ts` — "today", "tomorrow", "yesterday", otherwise "Friday 21 Aug" with the weekday spelled out. `friendlyDate` stays short for chips.
- `remove` hoisted out of the returned methods object into a local `removeTask`, so the undo closure can call it without `this`. `remove: removeTask` is now the only line in the public method.
- **Verified by hand in Chrome, the first end-to-end use of the picker path.** Typing `test the add toast friday` toasted "Added to Friday 21 Aug." and Next 7 days went 2 → 3. A second task toasted "Added to tomorrow.". A third was undone, and `select * from tasks` confirmed the server row was gone, not just the local one.
- Two test rows left in the live DB (`test the add toast`, `undo me`) were deleted by id with Noel's confirmation — there is no delete UI once the toast expires.
- `ng test` 18 → 20. `ng build` 491.03 kB initial / 122.73 kB transferred, `today` chunk 71.60 kB.
- `BUILD-PLAN.md`: §3 phase status, §4 item 1 marked done, §5 feature 1, §9 gained "The add toast, 18 Aug" with three decisions, §12 lost the "adding a task gives no feedback" gap and rewrote the edit/delete one.

**Decided**
- **The toast fires before the insert resolves**, like the optimistic row. Waiting on the round trip would put the delay in front of the only feedback the add produces. On failure the add toast is dismissed by id and the error toast replaces it, so they are never on screen together.
- **Undo on an add deletes the task.** It is the first and only caller of `TaskStore.remove()`.
- **Undo pressed mid-flight sets a flag rather than racing.** The row goes locally at once; when the insert lands, the store deletes the server copy it just created. Without it a fast Undo leaves a ghost row invisible until the next reload.
- **The message names the day, not the task text.** Where it went is what is in doubt.
- All in §9 under "The add toast, 18 Aug".

**Didn't work**
- **The 6-second toast timeout beats a screenshot round trip.** Two attempts to click Undo — one via `find`, one via a `javascript_tool` call issued after `computer:screenshot` — both arrived after the toast had auto-dismissed, and each left a junk task behind. What worked: one `browser_batch` of type → Enter → `wait 1` → JS click. Anything time-boxed under ~10s has to be driven inside a single batch.
- **A `javascript_tool` call placed immediately after `key: Enter` in a batch runs before Angular renders.** It returned `clicked: false` with the toast plainly visible in the screenshot taken one item later. A `wait` item between them is required.
- Confirmed again from the last entry: click by `ref`, never by coordinate. Screenshots came back 1568×746, 1502×652 and 1358×905 across four calls in one session against an unchanged viewport.

**Open**
- **Completing a task and a real overnight rollover are still not done by a person.** Unchanged for three sessions. `physio` on 17 Aug is the only completion in the table and it predates the UI work.
- `call doctor` on 19 Aug appeared in the table mid-session and is not from this work — Noel added it in his own window. Left alone.
- Undo is now the only way to delete anything, and it lasts six seconds. That makes §4 item 3 more urgent than the order suggests, not less.
- Unchanged: Phase 3 items 6 and 7 blocked on Todoist **iOS** captures; Settings-as-modal and the Today strip's fate after Upcoming both still Noel's call.

**Next**
Phase 3 item 3, `/today/:id` plus inline edit. `view-transition-name: task-{id}` per row, list unmounted while the card shows, edit rendered as the `Capture` component in the row's slot. This is also where delete gets a permanent home and where the toast finally earns its `Open` action.

**Touched** — `src/app/core/{task.store.ts,dates.ts,dates.spec.ts}`, `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-18 · claude-code · date picker built, repo pushed

**Did**
- **Phase 3 item 2 built**, skipping item 1 on Noel's instruction ("continue from step 2"). The toast is still unwritten; nothing in the picker depended on it.
- New `src/app/shared/date-picker.ts`: shortcut row (Today / Tomorrow / This weekend / Next week) with each option's resolved day printed beside it, a Monday-first month grid, and a time field writing `reminder_at`. No "No Date", no "Repeat", per §9.
- `capture.ts`: the date chip is now always present — reads `Today` before a word is typed — and is a button that opens the picker. A reminder chip appears whenever a time is set, with an `×` to clear it. The old `preview()` computed is gone; the chip row is no longer conditional on there being text.
- **`reminder_at` is visible for the first time.** `parse-capture.ts` has set it since Phase 2 and no component read it. Feature 7 moves from "parsed and stored, never fires" to "visible and editable, never fires".
- `Capture.submitted` now emits `CaptureSubmit { text, scheduling }`; `TaskStore.addFromCapture(input, scheduling)` takes the override. New `Scheduling` type in `models.ts`.
- Eight helpers added to `core/dates.ts`: `startOfMonth`, `addMonths`, `daysInMonth`, `weekdayIndex`, `monthLabel`, `weekdayAndDate`, `comingSaturday`, `comingMonday`, plus `toTimestamp` / `timeOfDay` / `friendlyClock` for the reminder.
- Date tests moved out of `parse-capture.spec.ts` into a new `core/dates.spec.ts` and extended. `ng test` 12 → 18. `ng build` 490.85 kB initial / 122.54 kB transferred, `today` chunk 63.12 → 71.44 kB.
- Shortcut buttons got an explicit `aria-label` — two text spans inside a button computed to an empty accessible name in the a11y tree.
- **`git remote add origin git@github.com:noelsebastian22/daybook.git`**, `master` pushed and tracking. Noel's instruction, mid-session.

**Decided**
- **A date typed after the picker was used wins.** The pick is held beside the parse and dropped by `Capture.onInput` the moment the text parses to a different day or time. Picking Friday, then typing "monday", must not silently keep Friday.
- **The reminder travels with the chosen day.** Picking a date rebuilds `reminder_at` from that date plus the current time. Keeping the parsed timestamp would leave 2pm on the day that was typed — a bug with no error message.
- **Past days are disabled in the grid.** Not a data rule; `scheduled_date` may sit in the past between rollovers. But a day already gone is a choice the next rollover immediately undoes.
- **The picker owns nothing but the visible month.** It takes a date and a time, emits a new pair, and the caller holds the value. That is what lets one component serve capture, edit and reschedule-from-a-row rather than three.
- **"This weekend" disappears on Fri / Sat / Sun** rather than pointing six days out — it resolves to the coming Saturday and a shortcut duplicating an earlier row's day is dropped. On a Sunday the weekend is already here, so it collapses into Today.
- All five are in §9 under "Building the date picker, 18 Aug".

**Didn't work**
- **Verifying the insert path end to end was abandoned deliberately.** Pressing Enter would have written a junk task into the live database and **there is no delete UI** (§12), so it would be stuck in Noel's list until Phase 3 item 3. The picker → `scheduling` → insert path is unit-tested and unproven by a person.
- **Raw coordinates from a `computer` screenshot do not click where they appear to.** The screenshot came back 1568×745 against a 1502×714 viewport and the tool does not rescale, so two clicks silently landed ~4% off and hit nothing. Clicking by `ref` from `read_page` worked every time. Use refs, not coordinates.
- **`signal(startOfMonth(this.date()))` as a field initializer throws** — a required `input()` cannot be read during field initialization. `linkedSignal` is the fix and has the better behaviour anyway: the visible month resets when the picker is reopened on a different date.
- `ng serve` refused: port 4200 was already taken by Noel's own dev server, which had hot-reloaded the changes. Nothing to fix — check `lsof -ti :4200` before assuming the server is dead.

**Open**
- **The add-confirmation toast, Phase 3 item 1, is still not built.** It is the only item proven broken by a person and it is now the one thing between here and item 3.
- **The picker has not been used by a person to actually create a task.** Everything up to the Enter key was driven in Chrome and looks right: shortcuts resolve correctly, "Next week" set the chip to `Mon 24 Aug`, typing `friday 5pm` overrode it to `Fri 21 Aug` with a `17:00` reminder chip.
- The reminder chip prints `17:00`, not `5:00 PM` — `toLocaleTimeString` following the browser locale, same as `friendlyTime` elsewhere. Consistent, but if Noel wants 12-hour it is one place to change.
- Unchanged: completing a task and a real overnight rollover have still not been done by a person; no edit or delete UI; Phase 3 items 6 and 7 still blocked on iOS captures; Settings-as-modal and the Today strip's fate after Upcoming both still Noel's call.

**Next**
Phase 3 item 1, the add-confirmation toast. `Capture.onKeydown` emits and clears with no acknowledgement; a future-dated task lands in the collapsed strip and vanishes. `ToastStore.show(message, undo)` already takes an undo callback and `shared/toasts.ts` renders it, so this is a call site plus a message naming the day — "Added to Friday 21 Aug". Leave `Open` out until `/today/:id` exists in item 3.

**Touched** — `src/app/shared/date-picker.ts`, `src/app/features/today/capture.ts`, `src/app/features/today/today.ts`, `src/app/core/{dates.ts,dates.spec.ts,models.ts,task.store.ts,parse-capture.spec.ts}`, `BUILD-PLAN.md`, `docs/SESSIONS.md`

## 2026-08-18 · claude-code · todoist captures annotated, phase 3 ordered

**Did**
- **Correction to the entry below:** it says the Todoist screenshots were "not taken yet". Wrong. Six stills and `Adding tasks.mov` were already in commit `0adc201`, the same commit the entry describes. Two more (`Login page.png`, `Mobile screen drawer.mov`) were sitting untracked and are committed now. Ten captures total.
- Renamed all ten to the `<area>--<thing>` convention `NOTES.md` specifies. None of them followed it — they were named after the screen (`Screen1 - today tab selected.png`), which is the exact failure the convention exists to prevent. Added `nav` and `auth` to the area list, which the captures needed and it did not have.
- Annotated every capture. Noel's text kept verbatim; anything added is marked **Read —** and is a second opinion, not a correction.
- Restored the annotation template at `NOTES.md`, which had been overwritten with the body of the Login page entry, and finished that entry — it had a **What it does** and nothing else.
- Recorded the `ffmpeg` frame-extraction command in `NOTES.md`. An agent cannot play a `.mov` and this was rediscovered from cold twice.
- `BUILD-PLAN.md` §4 Phase 3 is now an ordered list of seven items instead of an unordered pile. §9 gained nine decisions, §10 two reversals, §12 four gaps that were real but unlisted, §5.1 and §5.3 updated.
- **No code touched.** Docs only, so no build and no test run this session; the numbers in the entry below stand.

**Decided**
- **Magic Plus draggable FAB is dropped** — Noel: too complicated to use. The floating composer from `quick-add--composer-to-toast.mov` answers the same question with less, and the FAB's most distinctive drop target (a calendar cell) was blocked on Phase 4 anyway. This reverses a §5.1 signature interaction that had been in since the brief. §10.
- **Overdue gets no bucket and no bulk Reschedule button**, though Todoist has both. Daybook rolls slipped work forward and counts the days; that count is the product. A bucket cleared in one click destroys the signal the app exists to collect. Recorded so it is not re-proposed on the grounds that Todoist does it.
- **Edit reuses `Capture`**, rendered in the row's slot. Not a second form — two components parsing the same syntax would drift, and the newer one always misses a token.
- **Mobile nav is a hamburger sheet, button-only, never a left-edge swipe.** Phase 3 puts swipe-left-to-reschedule on task rows and an edge gesture competes for the same pixels.
- **Date picker drops "No Date" and "Repeat"**; keeps the shortcut row with each option's resolved day printed beside it. Full list of nine in §9.
- **Phase 3 order changed.** Toast first (only item proven broken by a person), then the date picker, then `/today/:id` + inline edit. The picker sits before edit on purpose: one picker then serves capture, edit and reschedule-from-a-row.

**Didn't work**
- Nothing was abandoned — but the session's real finding is a process one. Roughly half the opening prompt was re-typing decisions that a previous session made and never wrote down, and it carried at least one factual error about the repo's own state (the screenshots). Decisions that live only in a chat log are decisions the next agent gets to re-litigate. §9 and this file are the fix and both are cheap.

**Open**
- **What happens to the collapsed 7-day strip on Today** once Upcoming is a route of its own — stay, go, or shrink to a peek. Decides whether the 18 Aug add-feedback bug is fixed in the strip or dissolved by navigation.
- **Settings as a modal rather than the page §5.3 specifies.** Recommended — no route, no back-button ambiguity in an installed PWA. Not yet Noel's call.
- **Filters & Labels: recommend not building it.** ~80% of that screen is saved filters that are all Reject. The real parallel to Daybook's categories is the sidebar list, not the page, and categories self-create from `#tags` so there is nothing to create. Reasoning in `NOTES.md`.
- **Phase 3 items 6 and 7 (completion choreography, swipe) are blocked on captures from the wrong device.** Every Todoist reference so far is the web app driven by a mouse; `nav--mobile-drawer.mov` is a narrowed desktop window, not a phone. Both are judged on touch timing. Needs the Todoist **iOS app** recorded before that work starts.
- Unchanged and still true: the task loop is half verified — completing a task and a real overnight rollover have not been done by a person.

**Next**
The add-confirmation toast, §4 Phase 3 item 1. `Capture.onKeydown` clears the box and emits with no toast; a future-dated task lands in the collapsed strip and vanishes. "Added to Friday 21 Aug" with undo, via `ToastStore` and `shared/toasts.ts`, which already support it. Leave the `Open` action out — it needs `/today/:id`, which is item 3.

**Touched** — `BUILD-PLAN.md`, `docs/reference/todoist/NOTES.md`, all ten captures in `docs/reference/todoist/` (renamed), `docs/SESSIONS.md`

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
