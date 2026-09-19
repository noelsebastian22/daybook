# Session log

Shared memory across Cowork, Claude Code and Command Code. No agent can see another's
conversation; this file is the handoff.

Not a changelog — git covers that. This records **intent, dead ends, and open threads**:
the things that live in a conversation and would otherwise die with it.

Written by the `session-handoff` skill. Newest entry first. Never edit a past entry; if
it turned out wrong, say so in a new one.

<!-- newest first -->

## 2026-09-19 · claude-code · the access gate, built

**Did**
- Tasks 1–9 of `docs/plans/2026-09-19-access-gate.md`, inline. Nine commits,
  fast-forwarded to `master` and **pushed** — `0007_access_gate.sql`,
  `supabase/functions/access/{core.ts,core.test.mjs,index.ts}`,
  `core/access.{ts,helpers.ts}`, `core/auth-error.ts`,
  `features/request-access/`, the welcome and login links, and the
  session-store routing.
- **Applied `0007` to production** (`zzacswfongmzpnhcjiqp`) — live is now on
  nine migration rows. `hook_gate_signup` has
  `supabase_auth_admin=X/postgres` and no anon/authenticated/public execute.
- Proved locally before any of it: the hook against the seven crafted
  payloads, the check constraint, RLS, the four request outcomes over HTTP,
  GET-does-not-decide, the POST replay, both encodings, and
  request→approve→hook-returns-`{}` end to end.
- 760 tests across 41 files (was 697/38). Initial bundle **437.76 kB** (was
  436.55). `contrast-check.mjs` green. `/request-access` looked at in both
  themes on a real window; normalization confirmed in-browser.

**Decided**
- **Task 10 was split.** Noel took "migration only" on deploy but "merge to
  master now" on the branch, so the client is live ahead of the Edge
  Function. Stated at the time: `/request-access` currently posts to a
  function that does not exist and answers "Could not send that request."
- **`0007` was edited after being committed, deliberately.** The
  never-edit-an-applied-migration rule protects migrations applied somewhere
  shared; this one was local-only at the time and production had not seen it.
  A broken `0007` plus a `0008` fixing it would have read worse.

**Didn't work**
- **The migration as the plan wrote it did not work at all.** No grants.
  `service_role` bypasses RLS but **not table privileges**, and
  `auto_expose_new_tables` is unset locally, so every Edge Function call
  failed `42501` — *including the reads*, which made an already-approved
  address look brand new and then failed the insert behind it. Fixed with
  `grant select, insert, update on public.access_requests to service_role`.
- **Production does not behave like local here, and it matters.** Applying
  `0007` live granted `anon` and `authenticated` the full set — select,
  insert, update, delete, truncate — that the local stack withheld; the
  project predates the always-revoked default. Probed rather than assumed:
  **RLS holds** (`anon` sees zero rows, `authenticated` cannot insert itself
  an `approved` row), but on production the table's safety rests on RLS
  alone. §12 carries it as a gap.
- **CORS allowed only `content-type`** while the client sends `apikey`. Every
  local curl passed; the browser preflight would have failed in production.
- **`supabase functions serve <name>` is gone** in CLI 2.113 — it serves all
  functions and rejects the positional argument. The plan's command fails.
- **There is no local `psql`.** Every `psql` line in the plan needs
  `docker exec -i supabase_db_daybook psql -U postgres -d postgres` instead.
- **Task 4's token capture is impossible as written** — the function never
  logs the token and Resend is unconfigured locally, so `sendMail` bails and
  it is lost. Worked around by writing a known token's sha256 into
  `decision_token_hash` directly.
- **`render()`'s `providers` is typed `Provider[]`** and will not take
  `provideRouter`'s `EnvironmentProviders`. The plan's spec does not compile;
  it goes through `TestBed.configureTestingModule`, as `login.spec.ts` does.
- **`git checkout <file>` to undo a can-it-fail probe reverted uncommitted
  work.** Lost the Task 8 session-store edits and had to re-apply them. Use a
  copy, not the index, when the file is not yet committed.

**Open**
- **Task 10 steps 2–8 are unrun and are Noel's**: set `ACCESS_FROM`,
  `ACCESS_TO`, `APP_ORIGIN`; deploy the `access` function; register the hook
  at Authentication → Hooks → Before User Created →
  `pg-functions://postgres/public/hook_gate_signup`; seed Noel's own address
  as `approved`; prove both halves; and **flip "Allow new users to sign up"
  ON last**. Order is `ACCESS-PLAN.md` §2. Full checklist in
  `docs/OPERATIONS.md`.
- **The client is live without its backend.** Until the function is deployed,
  the form fails. This is the known consequence of the split above.
- `ACCESS-PLAN.md` §11 items 1 and 2 are still unverified — that the hook
  fires on the Google callback, and whether `error_code` reaches the client.
  `isNotApprovedError` keeps both branches until then.
- Phase 7 Gate 1 still unrun. Approving one person closes it.
- Unchanged from before: phone pass, AGPL §13 link, offline queue.

**Next**
- Deploy the `access` Edge Function and set its four secrets, so
  `/request-access` stops failing. Everything else in Task 10 can follow at
  leisure; this one is live and broken until it is done.

**Touched** — `supabase/migrations/0007_access_gate.sql`,
`supabase/functions/access/*`, `supabase/config.toml`,
`src/app/core/{access.ts,access.helpers.ts,auth-error.ts,session.store.ts,models.ts}`,
`src/app/features/request-access/*`, `src/main.ts`, `AGENTS.md`,
`BUILD-PLAN.md`, `docs/OPERATIONS.md`


## 2026-09-19 · claude-code · an access gate, specced

**Did**
- Branched `feat/access-gate`. Two commits, **docs only — no code, no schema.**
  `docs/ACCESS-PLAN.md` (spec) and `docs/plans/2026-09-19-access-gate.md`
  (ten tasks). BUILD-PLAN §4 gained a pointer to both.
- Checked live rather than read from docs: `auth.users` holds **one** row; the
  8 live migrations match the 6 files (`0002` landed as three); **"Allow new
  users to sign up" is OFF**, by screenshot.
- No build, no test run. Nothing under `src/` or `supabase/` changed, so the
  18 Sep numbers still stand.

**Decided**
- **The gate is a Supabase `Before User Created` auth hook** — free tier, a
  Postgres function reading an `access_requests` allowlist. Chosen because it
  is provider-agnostic: it runs on Google OAuth, which is the hole
  `shouldCreateUser: false` leaves open.
- **This reverses the 3 Sep mechanism.** The signup toggle **stays ON** (off
  blocks approved users too) and **flips on last**, after the hook is live and
  proven, so there is never a window with signup open and no gate.
- **Gate before authentication, not after.** A `/pending` waiting room is
  better UX, but a pending user holds an `authenticated` JWT that every
  `auth.uid() = user_id` policy passes — approval would need enforcing in four
  policies, two RPCs, `push_subscriptions` and `due_digests()`, and one miss is
  a hole that looks closed.
- **Deny exists and is honest**, worded as capacity rather than judgement.
- **The client uses plain `fetch` from a `core/access.ts` service.**
  `@supabase/functions-js` is not installed and must not be — Phase 8 dropped
  it deliberately at 2.85 kB.
- Execution is **inline in-session**, not subagent-driven: `AGENTS.md` is too
  much non-obvious context for a cold agent per task.

**Didn't work**
- **The first design was `auth.admin.inviteUserByEmail()` with signup globally
  off.** Abandoned before any code: it carries two unverified unknowns (does
  the admin API bypass `disable_signup`; can an invited email-identity user
  then link Google) and forces approved users down the email path. The hook
  makes both questions disappear.
- **A toggle on the login page — the original request — cannot work.** Google
  OAuth never consults the Angular app, so the door would look shut while open.
  This is the same failure the 3 Sep note already warned about.

**Open**
- **BUILD-PLAN §4's C5 is wrong and not yet rewritten.** It claims signup is
  open and that C1, C2 and blockers 1–3 are "live bugs, not hypotheticals".
  The toggle is off; they are not. Task 9 fixes it — §4 carries a warning until
  then.
- Three unknowns, all in `ACCESS-PLAN.md` §11: that the hook fires on the
  Google OAuth callback; whether `error_code` reaches the client or only
  `error_description`; whether local `supabase start` runs auth hooks.
- Everything open from the README entry below is unchanged — phone pass, AGPL
  §13 link, offline queue.

**Next**
- Task 1 of `docs/plans/2026-09-19-access-gate.md`, inline: write
  `supabase/migrations/0007_access_gate.sql`, `supabase start`, then prove
  `hook_gate_signup` against the seven crafted payloads. **The mixed-case and
  whitespace cases are the point** — they are the silent-open failure the
  check constraint exists to prevent.

**Touched** — `docs/ACCESS-PLAN.md`, `docs/plans/2026-09-19-access-gate.md`,
`BUILD-PLAN.md`

## 2026-09-19 · claude-code · a README and a licence

**Did**
- Rewrote `README.md` as the front door: product story, eight screenshots,
  differentiation, stack, then setup. Ops detail split into
  `docs/OPERATIONS.md`. Corrected the stale "production is
  `daybook-bay.vercel.app`" claim — it has been the custom domain since 5 Sep.
- Eight screenshots into `docs/screenshots/` (332 kB), shot against canned rows
  by rebuilding the `?harness` swap from 17 Sep. Scaffolding deleted, not
  committed.
- `LICENSE` = verbatim AGPL-3.0 fetched from gnu.org (sha256 `0d96a4ff…`),
  `package.json` gains `"license": "AGPL-3.0-only"`, reasoning in §8.
- PR #4 merged as **`4321cc1`**, branch deleted both ends. Production deploy
  `dpl_353stu5BEY8357cYL7xAFT4p21kF` **READY**. No file under `src/` changed, so
  the bundle is byte-identical and nothing user-visible moved.
- Build 439.63 kB initial / 107.90 kB transfer; **736 tests / 38 files**, green.
  `main-SLSQE6OY.js` still matches production.
- §12: two gaps closed. The composer aura and the dark-mode completion chart
  have both now been seen in the *running* app.
- **Caught and fixed a CSS regression that `LICENSE` itself caused** — see
  Didn't work. `@source not "../LICENSE";` added; §13 rewritten.

**Decided**
- **The licence is AGPL-3.0-only.** The repo stays readable, but §1 keeps the
  door open to selling this and a permissive licence would let anyone run
  Daybook as a hosted service off it. Copyright is retained either way, so
  commercial licences stay sellable. Picked on the asymmetry: a licence can be
  loosened later, never tightened. §8.
- **Screenshots are shot against canned rows, never a real account.** No real
  task text ships in a public repo.
- **The harness scaffolding stays uncommitted**, because `main.ts` importing it
  pulls it into the initial chunk. It has now been written twice. **If it gets
  written a third time, keep it out of the production graph instead** —
  `docs/OPERATIONS.md` carries that note.

**Didn't work**
- **Adding `LICENSE` changed the stylesheet, and the claim that it could not was
  wrong.** PR #4 was described, in the body and to Noel, as byte-identical
  because nothing under `src/` changed. The JS was; the **CSS was not**.
  Production went `styles-VLV6XEMS.css` → `styles-BLGLAQT5.css`, 45.68 → 45.71
  kB. Cause is the §13 gotcha the repo already documents: Tailwind scans the
  project for class names, the AGPL text says "the contents of its user
  interface", and **`LICENSE` has no extension**, so `@source not "../**/*.md"`
  never applied to it. Tailwind emitted `.contents{display:contents}`, 27 bytes.
  Fixed with `@source not "../LICENSE";`; the hash is back to `VLV6XEMS` and
  byte-identical to the build that was already live. **A `styles-*` hash moving
  on a docs-only commit is the canary — check prose before components.**
- **Three background `ng serve` runs "failed" with exit 127 and it was not the
  toolchain.** Port 4200 was already held by a dev server that was already
  running; the Angular CLI exits 127 for that. Two of those attempts were spent
  chasing nvm and `PATH`. **Check `lsof -nP -iTCP:4200` before debugging node.**
- **Chrome MCP clicks computed off a screenshot land ~4% high.** Screenshots
  come back 1568px wide while the page reports `innerWidth` 1502, and the tool
  does not reconcile them — clicking the drawer's `Add task` hit the row above
  it twice, silently. **Drive the DOM** (`querySelectorAll('button')[n].click()`)
  rather than coordinates. Typing into a composer that never opened also looks
  identical to typing into one that did.
- **`resize_window` cannot produce a mobile viewport.** `outerWidth` moved to
  871 but `innerWidth` stayed 1502 and the layout never went mobile. No mobile
  screenshot came out of this session.
- **`/welcome` is unreachable in a browser holding a real session** — `guestGuard`
  bounces to `/today`. The first attempt therefore photographed Noel's real
  tasks; that image was discarded. Fixed with a `?harness=guest` mode reporting
  a null session, which is the only way to shoot `/welcome` or `/login`.

**Open**
- **No mobile screenshot.** The coral `+` in the 40px bar is still unshot, and a
  real handset would beat a simulated one anyway — fold it into the phone pass.
- **AGPL §13 "Source" link not added.** The obligation binds licensees, not the
  copyright holder, so it does not bite Noel's own build, but a link in the
  drawer or Settings follows the licence's spirit. §8, five-minute job.
- The aura is still unseen **in dark mode** and **on a phone**; only light mode
  at 1440px was covered.
- Three of the four PR #3 phone checks, task notes round-tripping, the two PR #1
  device checks, `service_role` rotation and leaked-password protection — all
  unchanged.
- `daybook.theme.v1` left on `light` in the localhost browser. Cosmetic.

**Next**
- The phone pass, now carrying one extra item. Open
  `daybook.noel-sebastian.com` on the handset and walk the three remaining PR #3
  checks plus the composer aura in dark mode; take a real mobile screenshot
  while there and drop it into `docs/screenshots/`, then reference it in the
  README's *What it does* section.

**Touched** — `README.md`, `docs/OPERATIONS.md`, `LICENSE`, `package.json`,
`BUILD-PLAN.md`, `docs/screenshots/*.jpg`

## 2026-09-19 · claude-code · shipped reach and readability

**Did**
- Pushed `feat/reach-and-readability`, opened **PR #3**, merged it as **`2fea963`**,
  branch deleted at both ends. Local `master` fast-forwarded.
- **Production is live with it.** `daybook.noel-sebastian.com` serves
  `main-SLSQE6OY.js` and `styles-VLV6XEMS.css` — both hashes identical to the local
  `ng build`. Deployment `dpl_FeRnZMi4sYyKE2pmC5AYdWxvX6ar`, sha `2fea963`.
- No build or test run this session beyond the hash comparison; the numbers in the
  18 Sep entry still stand (736 tests / 38 files, initial 439.63 kB).

**Decided**
- Nothing new. The four decisions from 18 Sep are unchanged and now in production.

**Didn't work**
- **The preview deployment is not usable for the checks it exists for.** The project
  has `ssoProtection: { deploymentType: "all_except_custom_domains" }`, so
  `daybook-7b6qzn6qo-…vercel.app` answers **302** to a Vercel login while
  `daybook.noel-sebastian.com` answers 200. Signing into Vercel in mobile Safari to
  look at a preview is worse than the thing being checked. **Anything that needs a
  real phone has to go to production** — which is why PR #3 was merged rather than
  parked behind its own preview.
- A first `until` loop written to wait for the deploy matched `main-[A-Za-z0-9]+\.js`
  in general, which was already true of the old build, so it returned instantly and
  reported the *previous* bundle as current. Wait on the specific expected hash.

**Open**
- **The 18 Sep entry's "Nothing is deployed" is wrong and cannot be edited, so it is
  corrected here.** Vercel's git integration deploys `master` on push with no manual
  step. `4b0bdbed` — the composer aura — went to production as
  `dpl_Jb5zxL9Fu5ddh3zVYxjhveKXMyQy` at the time that entry was written. **The aura
  and the try page's card turn have therefore been live on the custom domain since
  18 Sep**, and both could have been checked on a real screen at any point since.
  §12 corrected.
- The four changes from PR #3 are deployed but **still unseen on a real screen**. The
  PR body carries the checklist: the coral `+` beside the coral logo tile in the
  mobile bar, the week divider at true size, the chart in dark mode on a real
  display, and Add task from the collapsed desktop rail.
- Task notes surviving a round trip, and the two PR #1 device checks. §12, unchanged.
- `service_role` rotation and leaked-password protection — §4 blockers 4 and 5, still
  the oldest open items, both dashboard work and untouched since 11 Sep.

**Next**
- Open `daybook.noel-sebastian.com` on the phone and walk the PR #3 checklist, plus
  the composer aura and the card turn, which have been live for a day. Every visual
  gap the app has is now checkable in one sitting on one device.

**Touched** — `docs/SESSIONS.md`, `BUILD-PLAN.md`

## 2026-09-18 · claude-code · reach and readability

**Did**
- Branch `feat/reach-and-readability`, three commits plus this one, **not merged,
  not pushed**. Four things Noel named from using the app.
- **`e01af0f` the settings gear.** Traced the path: body bbox centred `(12, 10.4)`
  against a hub at `(12, 12)`, and the subpath ended at `(10.1, 5.6)` having
  started at `(10.3, 4.3)`, so `Z` drew a chord across one lobe. Replaced with a
  six-tooth path generated by trig about 12,12 — root 5.2, tip 7.4, tip half-angle
  0.34 and root half-angle 0.66 of the half-pitch. Hub `r` 2.4 → 2.2 for clearance
  at 18px.
- Same commit: `shell.html`'s two hand-rolled `Daybook` strings (drawer, mobile
  bar) → `<app-logo variant="lockup" tone="primary" [size]="28" />`. `Shell`
  imports `Logo`.
- **`f371604` Add task reach.** Coral `+` in the mobile top bar; the collapsed
  desktop rail became a `flex-col` holding the existing expand chip plus a coral
  `+`; `clear` and `blank` empty states project an add ("Add another" / "Add
  task"). `filtered` deliberately still offers only Clear filters.
- **`5fe2129` the chart.** `reporting.ts` split `bars()` into `days()` → `ceiling()`
  → `bars()`; heights now a fraction of `ceiling()`, not of the tallest day.
  New `MIN_CEILING = 4`. `reporting.html` gained a baseline, two gridlines, a
  three-tick gutter, a week divider at `left-1/2`, today's label, and
  `pointerenter`+`click` in place of `mouseenter`.
- **736 tests / 38 files** (was 723), initial bundle **439.63 kB** (107.90 kB
  transfer), styles **45.68 kB** (was 45.36), `contrast-check` green, `tsc` and
  Prettier clean. Schema untouched; live still on eight migrations.

**Decided**
- **`data-mark` is now how a chart spec finds a mark.** `reporting.spec.ts` counted
  every `[aria-hidden="true"]` node on the page as a proxy for "hairline", which
  only worked while the hairline was the single decorative thing in the chart. The
  axis, gridlines and divider are decorative too. Marks carry `data-mark="bar" |
  "unrecorded" | "tick" | "day-label" | "week-divider"`. First data attributes in
  the repo. §9.
- **Chart gridlines use `border-border`, never `border-border-soft`.** Soft is
  `#2c2820` against a `#27231c` surface in dark — five values per channel, invisible.
  The scale would have existed in the light theme only. §9.
- **The gear path is generated, not drawn.** Do not hand-edit a coordinate; change a
  radius and regenerate, or the symmetry `shell.spec.ts` asserts breaks. §9.
- Empty-state adds are worded for position — "Add another" on a finished day, "Add
  task" on a blank one — so `today.spec.ts` matches on the leading word.

**Didn't work**
- **Two existing tests had premises that *were* the bug, and both had to be
  rewritten rather than kept.** `today.spec.ts`'s "does not ask twice" asserted
  **zero** add buttons on an empty list — it was actively protecting the hole Noel
  hit. `reporting.spec.ts`'s "labels only every other day" asserted
  `TREND_DAYS / 2`, which passed precisely because today is index 13 of 0..13 and
  odd, so **today's own label was never drawn**. A green suite was the reason
  neither was noticed. §12.
- **A full-height wash for an unrecorded day.** Correct against real data, wrong on
  a new account: no snapshots at all means thirteen full-height blocks on the first
  ever look at Reporting. It is an 8px square stub instead — reads as a thickened
  axis en masse, distinct beside real bars. Only visible by rendering the empty
  case; no spec can see it.
- **The original 1px hairline could not survive the baseline.** A hairline on the
  floor of the plot and a 1px baseline under it merge into one rule, which erases
  the zero-vs-unopened distinction the whole chart turns on.
- **`toBeCloseTo` on the gear's width against its height.** A six-tooth gear with a
  tooth pointing up is legitimately taller than wide (14.56 vs 13.92) — the test
  asserted something no correct gear satisfies. Replaced with mirror symmetry about
  both axes, which is tooth-count-independent and is what the old path violated.
- **The first gear generator reproduced the original's own bug** — the loop emitted
  the root arc at the *start* of each tooth, so the last tooth had no arc home and
  `Z` chorded it. Closing arc now emitted explicitly before `Z`.
- **A bottom-right FAB was considered and rejected** before any code. Toasts are
  `fixed inset-x-0 bottom-0`, centred, `max-w-sm` — near full width on a phone — and
  carry Undo, which is this app's substitute for confirmation dialogs. A FAB would
  sit on top of it.
- **`pr-11` to clear the theme toggle in the mobile bar.** 44px is off the 1/2/3/4/6/8
  spacing scale. A `w-9` spacer div holds the space instead; `w-` is a size and the
  scale does not govern it.
- **`git stash -q -u` run mid-session to compare a file against `master`** stashed the
  uncommitted `BUILD-PLAN.md` and `SESSIONS.md` edits along with it. Recovered with
  `git stash pop`. Use `git show master:<path>` alone — it needs no clean tree.
- **`npx prettier --write` on the three markdown docs.** No `.prettierignore`, no
  format script, and the `.prettierrc` override only names `*.html` — markdown has
  never been in prettier's scope here, so it rewrote every `*emphasis*` as
  `_emphasis_` and realigned every table: ~600 lines of churn burying the real edit.
  Reverted with `git checkout HEAD~1 --` and the content re-applied by hand.
  **Do not run prettier on the markdown in this repo.**

**Open**
- **None of this has been seen in the running app.** The gear and the chart were both
  checked in standalone harnesses carrying token values lifted verbatim from
  `src/styles.css`, both themes, served over `python3 -m http.server` — the Chrome
  MCP still rejects `file://`. Everything signed-in is behind auth. §12.
- The branch is **local only**: no PR, nothing pushed, `master` untouched.
- **The fractional-step count is 40, not 41.** Noel was told mid-session that
  `reporting.html`'s `mt-1.5` had been left alone; that was wrong. The labels row it
  sat on was rebuilt and came back as `mt-2`, which removed the app's last `mt-1.5`.
  `BUILD-PLAN.md` §4 and `AGENTS.md` § Spacing both corrected in this commit. The
  §4 rule is unchanged — it moved only because that row was being rewritten anyway.
- The composer aura, the try page's card turn and task notes all remain unseen on a
  real screen. §12, unchanged by this session.
- `service_role` rotation and leaked-password protection — §4 blockers 4 and 5, still
  the oldest open items, both dashboard work.

**Next**
- Push the branch, open a PR and deploy it, then look at the four changes on a real
  foreground screen alongside the composer aura and the card turn — one deploy closes
  every outstanding visual gap the app has at once.

**Touched** — `src/app/shared/shell.html`, `src/app/shared/shell.ts`,
`src/app/shared/shell.spec.ts`, `src/app/features/today/today.html`,
`src/app/features/today/today.spec.ts`,
`src/app/features/reporting/reporting.html`,
`src/app/features/reporting/reporting.ts`,
`src/app/features/reporting/reporting.spec.ts`,
`src/app/features/reporting/reporting.constants.ts`, `BUILD-PLAN.md`,
`AGENTS.md`, `docs/SESSIONS.md`

## 2026-09-18 · claude-code · a lit edge on the composer

**Did**
- Two commits on `feat/try-page-live-parse`, then **PR #2 merged to master as
  `17028c8`**. The branch carried the try-page work from the previous session
  too — Noel chose to bundle rather than split.
- **`078d1df` the aura**: a 2px conic-gradient band outside the composer's
  focus ring, violet → coral, rotated by a registered `@property --aura-angle`.
  `.aura-edge` and `@keyframes aura-spin` in `src/styles.css`, the class on
  `composer.html`'s existing shadow wrapper.
- **`43cb2e1` the sheen**: `--color-aura-sheen` plus two narrow specular stops
  per revolution — 8deg of flat peak, 26deg shoulders.
- `composer.spec.ts` gained one test asserting the class is on the wrapper and
  **not** on `app-capture`, which is the only thing stopping a future tidy-up
  folding the two edges together.
- **723 tests / 38 files**, initial bundle **439.31 kB** (107.82 kB transfer),
  styles **45.36 kB** (was 44.22), `contrast-check` green, `tsc` and Prettier
  clean. Schema untouched; live is still on eight migrations.
- Cleaned up: local `master` fast-forwarded 12 commits to `origin/master`, and
  `feat/try-page-live-parse` and `feat/task-notes` deleted locally and on
  origin after confirming `master..<branch>` empty and both SHAs matching.

**Decided**
- **The aura hangs on the wrapper, never on the capture box.** `capture.html`
  gives the textarea `outline-none`, so `focus-within:ring-2 ring-focus` *is*
  that textarea's focus indicator. Aura takes E+2→E+4, the ring keeps E→E+2 —
  flush, concentric, no overlap. Change `inset` and the `padding` moves with
  it. §9.
- **Pen is not a gradient stop, deliberately.** See below.
- **`--color-aura-sheen` is the one aura token whose two themes are different
  colours rather than two lightnesses of one.** White is the better glint but
  cannot be used in light; blush cannot carry dark. §9.
- Reduced motion needed nothing new — the global block already clamps
  `*::before` to 0.01ms, which freezes the ring rather than removing it.

**Didn't work**
- **Pen → violet → coral, as first built and as Noel first picked it.** The
  ring directly inside is also pen, so for most of the rotation the two merged
  into a single 4px purple slab and coral was the only thing that ever
  separated them. Only visible in a screenshot — no spec can see it. Dropped
  pen; violet is the neighbouring hue and stays distinct. **Do not add pen
  back.**
- **A white sheen in the light theme.** It crosses a white capture box and the
  border appears to *break* where the glint passes. That is what forced the
  per-theme split rather than one sheen colour.
- **`ng test --filter` is a test-name regex, not a file glob.**
  `--filter="**/composer.spec.ts"` throws `Invalid regular expression:
  Nothing to repeat`; `--filter="composer.spec"` silently skips all 38 files
  and reports success. Run the whole suite — it is 2s.
- **`npx vitest run <file>` does not work here at all** — no Angular linker, so
  every `@angular/*` injectable fails JIT. Everything goes through `ng test`.
- **The Chrome MCP rejects `file://`** with "Can't interact with
  browser-internal or unparseable URLs". Served the harness over
  `python3 -m http.server` instead.
- The composer is behind auth and cannot be screenshotted directly, so the
  aura was checked against a standalone harness carrying the real token
  values. Byte-identical rule, simulated backdrop.
- **The automation tab throttles CSS animations to roughly a sixth of speed** —
  `--aura-angle` advanced 12deg in 1200ms where 72deg was authored — while
  reporting `visibilityState: 'visible'`. Unlike a view transition it does
  still *run*, so colour and geometry are checkable there and duration is not.

**Open**
- **The aura has never been seen in the running app**, only in the harness.
  Noel judged the 6s turn "looks good" from stills.
- The try page's **card turn is still unverified** and now shipped to master.
  §12, unchanged by this session.
- PR #1's two task-notes device checks are still unticked, and **PR #1 is now
  merged and its branch deleted**, so those checkboxes no longer have a live
  home. §12 still records them; that is the only copy now.
- `service_role` rotation and leaked-password protection — §4 blockers 4 and
  5, still the oldest open items, both dashboard work.
- **Nothing is deployed.** This was a merge to `master` only; Vercel was not
  touched.

**Next**
- Deploy `master` and look at the composer aura and the try page's card turn on
  a real foreground screen — one deploy closes the only two motion gaps the
  app has. Failing that, the `service_role` rotation, which needs Noel in the
  Supabase dashboard and has been open longest.

**Touched** — `src/styles.css`,
`src/app/features/today/composer.html`,
`src/app/features/today/composer.spec.ts`, `BUILD-PLAN.md`,
`docs/SESSIONS.md`

## 2026-09-18 · claude-code · try page reads and turns

**Did**
- PR #1 merged before this session started, so the last entry's "master is 3
  commits unpushed" thread is closed. `origin/master` is `c5081a8`.
- Two additions to the welcome hero, both Noel's observations from using it.
  One commit, `4511591`, on `feat/try-page-live-parse` off `origin/master`.
- **Live highlighting**: `try-page.html`'s `<input>` became a mirror `div` +
  transparent `textarea`, fed by the real `segments()` / `parseCapture()`.
  New `parsed` / `parts` / `readout` computeds on `TryPage`; `add()` now uses
  `this.parsed()` instead of its own second `parseCapture` call.
- **Readout** under the box — "→ tomorrow, 5:00 PM" — from `pageLabel()` +
  `friendlyTime()`. `pageLabel` gained a `date === from → 'today'` branch.
- **Card turn** replaces the per-row FLIP: `.try-card` carries
  `view-transition-name`, the `li` carries none, four `card-turn-*` keyframes
  in `src/styles.css`, direction by `:root:has(.try-card:not(.is-flipped))`.
- **722 tests / 38 files**, initial bundle **438.17 kB** (107.66 kB transfer),
  styles **44.22 kB** (was 42.76), `contrast-check` green, `tsc` clean.
- Verified in Chrome: highlighting, wrapping onto a second line, the readout,
  Enter-to-submit, and the `:has()` direction selector.

**Decided**
- **Centre vertical axis, not a left-edge hinge.** Noel asked what the better
  UX was and the edge hinge was dropped: it swings the card across a lot of
  screen *while* the card is also getting shorter, where turning in place
  absorbs the height change. §9.
- **The readout is gated on a date *token***, not on `scheduled_date`, which
  `parseCapture` defaults to today regardless. Off the value it would claim
  "today" on every keystroke of every task. Mutation-tested.
- **The readout sits outside `aria-live`.** It changes per keystroke; the
  outcome is announced there on submit instead.
- **Still `withViewTransition`, not a keyframe on the card** — the transition
  pseudo-elements render in the top layer, so the hero section's overflow
  cannot clip the rotating card. A transform on the card would be clipped.
- A named element is not painted into its ancestor's snapshot, so container
  and child names are mutually exclusive. Added to `AGENTS.md`, Motion.

**Didn't work**
- **`[value]="draft()"` does not put a textarea back once someone has typed
  into it.** After `add()` the mirror showed its placeholder while the
  textarea kept the old sentence — invisible, text is transparent — and the
  next keystroke appended to it. Fixed by `emptyBox()`, which clears the
  element too, exactly as `capture.ts` `commit()` always has. **No spec here
  can catch it**: assigning `.value` + dispatching `input` leaves Angular's
  binding able to write, so the existing assertion passes either way. Only
  real keystrokes reproduce it.
- **The card turn has never been seen moving.** Chrome aborts a view
  transition on a hidden document, and the MCP automation tab reports
  `visibilityState: 'hidden'` while still returning correct screenshots —
  `InvalidStateError: Transition was aborted ... Document hidden`, three times
  in the console. The mutation lands, so the page looks right and just does
  not animate. **The automation tab cannot verify any view transition**,
  including the app's completion choreography. Needs a foreground window.
- **`prettier --write` on `AGENTS.md` / `BUILD-PLAN.md` rewrapped ~89 lines of
  hand-wrapped prose and realigned every markdown table** — 189/322 lines of
  churn in the two docs. There is a `.prettierrc` and no `.prettierignore`, so
  markdown is in scope, but nothing enforces it and the docs are hand-wrapped
  at ~80 cols with compact `|---|---|` tables. Reverted and the content
  re-applied by hand; the docs diff went to 129/4. **Do not run Prettier on
  the `.md` files.** It is fine and wanted on `.ts` / `.html` / `.css`.
- Two of my own new specs asserted `5:00 PM`; this ICU build renders `5:00 pm`.
  The existing seeded-time test already asserts only `5:00` — that is why.
- `mirrorRuns()` queries `form [aria-hidden="true"] > span`, not a class. The
  notes `<p>` is also `aria-hidden` but sits outside the form.

**Open**
- **The turn is unverified and is the one thing waiting on Noel** — he said he
  would check the merged build on his phone. §12.
- `feat/try-page-live-parse` is committed and **not pushed**. No PR.
- Local `master` is still 7 behind `origin/master`; `feat/task-notes` is fully
  merged and still present locally and on origin. Offered, not done.
- **`src/app/features/today/capture.spec.ts` is unformatted on `master`**, from
  the notes session. Left alone rather than bundled into this change.
- PR #1's two device checks are still unticked: a note surviving a reload, and
  editing a task with a note not wiping it. §12.
- 41 fractional spacing steps, unchanged by this session (try-page still 4).
- The composer-at-bottom question still needs one answer: iPhone or installed
  desktop? A subtle colourful glow behind the composer: wanted, not started.
- Noel started a third request mid-session and withdrew it ("leave it").

**Next**
- Push `feat/try-page-live-parse` and open a PR, or merge it — then look at the
  turn on a real screen, which is the only thing that can close §12's new gap.
  The `service_role` rotation (§4 blocker 4) is still the oldest open item and
  still needs Noel in the dashboard.

**Touched** — `src/app/features/welcome/try-page.ts`,
`src/app/features/welcome/try-page.html`,
`src/app/features/welcome/try-page.spec.ts`,
`src/app/features/welcome/try-page.helpers.ts`,
`src/app/features/welcome/welcome.spec.ts`, `src/styles.css`, `AGENTS.md`,
`BUILD-PLAN.md`

## 2026-09-18 · claude-code · task notes, phase 9 closed

**Did**
- PWA check passed on the installed production app. **Phase 9 closed with
  nothing outstanding**, §3 updated. `retheme/paper` deleted locally and on
  origin after `master..retheme/paper` came back empty at both ends.
- Corrected §4's test-coverage bullet: it claimed `session.store.spec.ts`,
  `task.store.spec.ts`, `settings.store.spec.ts` and `auth.guard.spec.ts` did
  not exist and that tenant isolation "rests on nothing". **All four exist and
  carry 112 tests**; `task.store.spec.ts:187` flips `loadedFor` to a second
  user. §3 had been reading Gate 1 as unstarted off that one stale bullet.
- Designed and built **task notes** — `docs/NOTES-PLAN.md` (design),
  `docs/plans/2026-09-18-task-notes.md` (plan), five commits on
  `feat/task-notes`, PR #1 open against master.
- `0006_task_notes.sql` — `alter table tasks add column notes text` — applied
  live as `20260918034736 daybook_task_notes`. **Live is now 8 migrations, the
  folder holds 6.**
- Notes are typed in `Capture` behind a collapsed `Add notes`, read on
  `task-detail.html`, and marked by a labelled glyph in `task-row.html`.
- **713 tests / 38 files**, initial bundle **436.71 kB** (107.45 kB transfer),
  styles 42.76 kB, `contrast-check` green.

**Decided**
- **A column, not a `task_notes` table.** The offline queue's ops are already
  `{op:'update', patch: Partial<Task>}` and `{op:'insert', row: Task}`, so a
  column rides both untouched; a table needs a new op in the one file with a
  silent data-loss bug in its history (C2). §9.
- **A note is not a comment.** One overwritten body — no author, order or
  timestamp. Recorded in §9 as a *distinction* rather than a reversal, which is
  what the Todoist-captures rule requires. The append-only log was considered
  and rejected: better for "why does this keep being carried", but exactly the
  shape §9 rejects, and the two counts already answer that numerically.
- **Notes live in `Capture` behind progressive disclosure** — Noel's call, and
  it is what made putting them there acceptable at all, since the add box must
  not grow. One component then serves add and edit with no second surface.
- **Enter is a newline in the notes field**, Cmd/Ctrl+Enter commits. **Escape
  keeps one meaning** and is delegated to `onKeydown`, which it has to be:
  `onKeydown` is bound to the task-line textarea, and the notes field is its
  *sibling*, so nothing bubbles between them.

**Didn't work**
- **`TaskDraft` was in the spec as gaining the field.** It is declared in
  `models.ts` and referenced nowhere in `src` — dead code. Dropped from scope
  rather than grown a field. Whether to delete it belongs to code-quality work.
- **The plan scoped the store change to two call sites. There are four**:
  `today.ts`, `upcoming.ts`, `calendar/day-detail.ts`, `today/task-detail.ts`.
  Upcoming and the calendar day detail both add through the same composer.
- **`grep -rn ": Task = {"` does not find every `Task` literal.**
  `offline-queue.spec.ts` has its own `task()` builder whose returned object
  carries no type annotation, so it matched nothing and broke the build.
- **The line-break spec does not prove line breaks.** Removing
  `whitespace-pre-wrap` left it green — `textContent` carries the newline
  either way and jsdom computes no layout. Renamed to what it actually
  asserts; recorded in §12 because no jsdom test can close it.
- **Nine existing specs broke on the new field and parameter**: five assert the
  `CaptureSubmit` payload with an exact object match, four assert
  `addFromCapture` / `editFromCapture` call args by exact arity. Adding
  anything to either shape means visiting all nine.
- `--include=*.ts` unquoted is a **zsh** glob error, not a grep one — same
  family as the `*.css` note in the last entry. Quote it.

**Open**
- **`master` is 3 commits ahead of `origin/master` and unpushed** — `5644230`,
  `5767264`, `bc87018`. They reached origin only *inside* `feat/task-notes`, so
  `origin/master` still has none of the Phase 9 closure or the Gate 1
  correction.
- **This entry is on `feat/task-notes`, not on master.** A session that starts
  from master will not see that this one happened until PR #1 merges. Merge it,
  or cherry-pick this entry across.
- PR #1 carries two unticked device checks: a note surviving a reload, and
  editing a task with a note not wiping it. §12.
- **41 fractional spacing steps still untouched, and the split changed.** Notes
  touched 17 of them — `task-detail.html` 13, `capture.html` 2, `task-row.html`
  2 — so sweep all 41 in one pass *after* the merge rather than working around
  an open PR.
- **The composer sits at the bottom in the PWA.** Needs one answer from Noel:
  iPhone or installed desktop? On iPhone that is the deliberate below-`lg`
  bottom sheet (§10's thumb-reach argument) and changing it is a recorded
  reversal, not a bug fix.
- A subtle colourful glow behind the composer — wanted, not started.
- Phase 7 blockers 4 and 5 remain dashboard-only; Gate 1's two-account pass is
  the real remainder now that the specs are known to exist.

**Next**
- **Rotate the `service_role` key, with Noel** — he asked to do it together.
  Order matters and is in §4 blocker 4: rotate in the dashboard first, because
  the key was surfaced in a transcript and is leaked wherever it is stored;
  then move the new key into Vault; then update `cron.job.command` in one go.

**Touched** — `supabase/migrations/0006_task_notes.sql`,
`src/app/core/models.ts`, `src/app/core/task.store.ts`,
`src/app/features/today/capture.ts`, `src/app/features/today/capture.html`,
`src/app/features/today/task-detail.ts`,
`src/app/features/today/task-detail.html`,
`src/app/features/today/task-row.html`, `src/app/features/today/composer.ts`,
`src/app/features/today/today.ts`, `src/app/features/upcoming/upcoming.ts`,
`src/app/features/calendar/day-detail.ts`, `src/testing/fakes.ts`,
`BUILD-PLAN.md`, `docs/NOTES-PLAN.md`, `docs/plans/2026-09-18-task-notes.md`

## 2026-09-18 · claude-code · retheme shipped, threads closed

**Did**
- Verified `retheme/paper` before merging: 697 tests / 38 files, initial bundle
  **436.61 kB** (107.37 kB transfer), styles 42.66 kB, `contrast-check` green.
- Fast-forwarded `master` to `retheme/paper` and pushed. 21 commits, carrying
  `4149347` and `1fcf2b8`, the digest/key-rotation pair nobody had pushed.
  Re-ran the suite on the merged result: still 697.
- Production verified serving the new build: `fonts/fraunces-var.woff2` is
  byte-identical to the repo (40,948 B) and `theme-color` is `#fffdf7`.
- `supabase functions deploy notify --project-ref zzacswfongmzpnhcjiqp` → **v14**,
  new `ezbr_sha256`. Forced a digest with the §12 recipe; the 22:05Z tick sent it.
- **Digest confirmed from the inbox, not the sending side.** Delivered HTML
  carries `#1f1b16`, `#6b6353`, `#a3122f`, green still `#047857` — every hex
  matching `notify/index.ts` — subject `Daybook: `, `labelIds: [INBOX]`.
- Fixture indigo closed: `fakes.ts` `makeCategory` colour `#6366f1` → `#64748b`,
  and `settings.spec.ts:399`'s explicit `#6366f1` → `#3b82f6`. It was in **two**
  places, not the one the last entry named.
- Re-counted fractional spacing: still **41**. Scoped in `BUILD-PLAN.md` §4 with
  the per-file breakdown. Not started.
- Schema untouched — the only live write was an `update user_settings` on the
  forcing recipe. `list_migrations` still 7 live against 5 in the folder.

**Decided**
- **Ship ahead of the installed-PWA check.** Noel's call, asked explicitly. The
  check is a verification, not work, and now runs against production; rollback
  is still `daybook-bay.vercel.app`, served without a redirect.
- **Receiver-side confirmation is the assertion that matters for the digest.**
  The Gmail MCP reads the delivered message, so hexes and subject diff straight
  against `notify/index.ts`. `labelIds` containing `INBOX` is the proof; a `250`
  from Resend never was — that is exactly what the 6 Sep Gmail-discard bug was.
  The 22:05Z send and the 21:00Z one an hour earlier sat in the same inbox with
  `Daybook: ` and `Daybook — ` subjects, which is what proved v14 had taken
  rather than merely uploaded. Recorded in §12.
- **`makeDefaultCategories`' comment was the bug, not its data.** It claimed to
  mirror what `ensure_user_setup` seeds; it never has. Real seed is
  Freelance/Work/Family/Health, fixture is Work/Home/Health/Admin, and three
  `task.store.spec.ts` specs look up `slug === 'home'`, which the real seed has
  no equivalent of. Corrected the comment rather than renaming the fixture and
  breaking three specs for no gain.
- **A fixture's default should be the column default.** `#64748b` is what
  `0001_core_schema.sql` actually assigns, so an unspecified colour is now
  truthful rather than decorative.

**Didn't work**
- **The last entry's merge claim was wrong twice.** It said "clean fast-forward,
  17 commits": it was **19**, and `dfc3f64` had never reached
  `origin/retheme/paper`, so the Vercel preview was one commit behind the branch.
  Harmless — that commit is docs-only — but "the branch is pushed" was not true
  of its tip. Check `git log --oneline retheme/paper..master` and the upstream
  ahead-count, not the log's number.
- **`grep -rni 6366f1 .` is unusable in this repo.** `docs/reference/brand/*.svg`
  carry C2PA provenance manifests as base64, so the sweep returned 390 kB of
  metadata. Scope colour greps to `src supabase tools public`.
- **`timeout` does not exist on macOS**, so the skill-style `timeout 45 supabase …`
  guard fails with `command not found` and the exit code still reads 0.
- **The Supabase CLI is authenticated here but not linked** — no
  `supabase/.temp/project-ref`. `supabase projects list` works while anything
  project-scoped says "Cannot find project ref". Pass `--project-ref`; do not run
  `supabase link`, and do not reach for the MCP `deploy_edge_function`, which
  would have re-rooted the entrypoint path away from
  `supabase/functions/notify/index.ts`.
- Trailing `*.css` in a `grep --include` list is a zsh glob error, not a grep one.

**Open**
- **Installed-PWA check is the only outstanding Phase 9 item**: status bar, safe
  areas, no white flash, offline load with the font, coral icon after a reinstall.
  Needs Noel's iPhone against `https://daybook.noel-sebastian.com`.
- **`retheme/paper` still exists locally and on origin.** Deliberately not
  deleted; `master` carries everything, so it can go whenever Noel says.
- Phase 7 blockers 4 and 5 (rotate `service_role` into Vault, leaked-password
  protection) remain dashboard-only. Gate 1 — push delivering off the new table —
  still unseen.
- The Gmail "Never send it to Spam" filter still does not generalise to a second
  user. Domain warming is the real fix and is unsolved.
- 41 fractional spacing steps, scoped but not started.

**Next**
- Noel does the PWA check on the installed production app. If it holds, Phase 9
  closes entirely and `retheme/paper` can be deleted locally and on origin.

**Touched** — `src/testing/fakes.ts`,
`src/app/features/settings/settings.spec.ts`, `BUILD-PLAN.md`, `AGENTS.md`,
`docs/SESSIONS.md`

## 2026-09-17 · claude-code · retheme phases 4 to 8, decisions closed

_Ran past midnight; the branch push landed early on 18 Sep. Every decision in
`BUILD-PLAN.md` and `RETHEME-PLAN.md` is stamped 17 Sep, which is when it was made._

**Did**
- Finished Phase 3: `notify/index.ts` hexes to `#1f1b16`/`#6b6353`/`#a3122f`
  (green unchanged), subject to `Daybook: `, eyebrow de-shouted. Own commit,
  **not deployed**.
- Phase 4: `tools/build-font.sh` builds a 39.9 kB Fraunces Latin variable subset;
  `.woff2` committed so no build needs Python. `@font-face` + `--font-display`,
  `fonts` prefetch group in `ngsw-config.json`, applied to six page titles, two
  reporting figures, welcome, login and the wordmark.
- Phase 5: `TryPage` — the hero is a working Daybook page running the real
  `parseCapture`. `welcome.css` deleted; the app now has **no** component
  stylesheets. 12 new specs.
- Phases 6 and 7 by subagents: login off the dark poster, Today's header is the
  date in Fraunces, carried badge is a tilted pen stamp.
- Closed every open decision. D1 handwriting → outlines traced from Caveat at
  build time (`tools/build-notes.sh`). D2 → `quick-100` `#FCEAA8` + new
  `quick-800` `#92400E`. D5 → `done-500` `#0E9F6E`. D6 → `border-strong`.
  D4 → kept, on measurement (see below).
- Acted on the Phase 7 audit: stale pre-D5 green in `empty-state.html`, new
  `--color-scrim`, six `opacity`-as-disabled sites, seven banned uppercase
  eyebrows, two em dashes, reporting's carried badge, the emoji alarm clock.
- **Reviewed all eight signed-in screens in both themes** — today, upcoming,
  calendar, day detail, task detail, reporting, settings, drawer — plus the
  composer's parsed chips and both states of its Save button. Nothing is signed
  in here, so `Supabase` was swapped for canned rows at bootstrap behind a
  `?harness` flag; scaffolding deleted afterwards. See **Decided**.
- Pushed `retheme/paper` to origin at Noel's choice (preview, not production).
  `master` untouched.
- 697 tests / 38 files, build **436.61 kB** initial (107.37 kB transfer), styles
  42.66 kB, `contrast-check` green with `KNOWN_GAPS` **empty** for the first time.
  Schema untouched, so `list_migrations` was not run.
- `_to_delete/` no longer exists. Nothing to clean.

**Decided**
- **D4 is closed on the screen its gate asked for.** The coral `+` and the
  crimson `carried ×7` were seen together on the real Today list in both themes.
  They do not read as the same colour. In OKLab the old `#EF4444` sat **2.7°** of
  hue from coral; `#D92D4A` sits **10.1°** away.
- **The signed-in screens can be reviewed without an account, and this is worth
  reusing.** Swap `Supabase` for canned rows at bootstrap behind a `?harness`
  flag in `main.ts`. Every component, template, token and font stays real and
  only the data is invented — which is enough for a visual pass and is the only
  way to see these surfaces with no session. Seed an overdue task at
  `carried_over_count: 7` and the escalated crimson stamp is on screen. The
  scaffolding was deleted afterwards; it is about 130 lines.
- **The wordmark is the one piece of app chrome that gets Fraunces**, because it
  is the brand and not UI text. Its cap-height constant moved 0.72 → 0.70, read
  off the face. Survivable under `swap` only because `--font-display` falls back
  to a *serif*; a sans fallback would visibly resize the mark on every cold load.
- **Handwriting ships as outlines, never as a font.** Caveat subset is 12.7 kB +
  a request + a flash; the traced paths are ~11.4 kB gzipped with neither.
- **Markdown here is not prettier-formatted.** `AGENTS.md`, `BUILD-PLAN.md` and
  `RETHEME-PLAN.md` already failed `--check` before this session. Do not run
  `--write` on them; it buries the diff.

**Didn't work**
- **`[(ngModel)]` + a signal silently half-works.** After a task was filed to
  another day the signal cleared and the input did not, so the hero read "Saved
  to Monday's page" with the sentence still in the box and the next Enter filed
  it again. Use `[value]` + `(input)`, as `capture.ts` already does.
- **Removing `FormsModule` then broke Enter with no error.** `(ngSubmit)` is
  `NgForm`'s event; without the import it binds to an event nothing fires and the
  form looks perfectly correct. Native `(submit)` + `preventDefault`.
- **`vi.useFakeTimers()` bare hangs any spec that renders.** The app is zoneless,
  so `render()` waits on `whenStable()`. Use `{ toFake: ['Date'] }`. Cost the
  Phase 7 agent real time; now in `AGENTS.md`.
- **`pyftsubset` drops `rvrn` unless asked.** It is a *required* feature Fraunces
  drives from FeatureVariations across `opsz`. A build without it renders
  correctly at 15px and wrongly at display sizes. Also: `format('woff2')`, never
  `woff2-variations` — some browsers skip the src entirely.
- **Fraunces has no `tnum`.** `tabular-nums` under it is a no-op; the two
  reporting figures had it and it was a lie. Removed.
- **The `computer` tool's click coordinates did not land** on small targets
  (devicePixelRatio 1.8 here), and `resize_window` did not change `innerWidth`.
  Clicks were verified via `javascript_tool` instead, and the 360px check was
  done by cloning a row into a 328px container and reading `scrollWidth`. That
  caught a real defect the eye would not have: the task name rendered at **0px**.

**Open**
- **`retheme/paper` is pushed; `master` is untouched and nothing is in
  production.** Noel chose a preview build over shipping, so Vercel should have
  a preview URL for the branch. Merging is a clean fast-forward, 17 commits.
- **`master` is 2 commits ahead of `origin/master`, and has been since before
  this session** — `1fcf2b8` and `4149347`, the digest delivery and key
  rotation work. Nobody pushed them. They will go up with the retheme merge, so
  look at them before pushing master rather than being surprised by them.
- **`notify` is committed and not deployed.** Its own deploy step, and it wants
  a test digest afterwards. The live digest still sends the old indigo hexes
  and the em-dash subject until then.
- Installed-PWA check outstanding, and it is the reason for the preview: status
  bar, safe areas, no white flash, offline load with the font, coral icon after
  a reinstall. Needs a real HTTPS URL and a real phone.
- `AGENTS.md` now admits 41 fractional spacing steps survive in `src/app`, where
  it used to claim they were gone. Migrating them is its own piece of work.
- `src/testing/fakes.ts:76` still seeds a category colour of `#6366f1`, the
  retired brand indigo. Harmless test data, but confusing to read.

**Next**
- Install the Vercel preview of `retheme/paper` on the iPhone and do the PWA
  check. If it holds up: fast-forward `master`, push (taking the two older
  commits with it), then `supabase functions deploy notify` and send a test
  digest to confirm the new ink and crimson.

**Touched** — `tools/build-font.sh`, `tools/build-notes.sh`, `tools/contrast-check.mjs`,
`public/fonts/*`, `src/styles.css`, `ngsw-config.json`,
`src/app/features/welcome/*` (welcome.css deleted, try-page.* new),
`src/app/features/login/login.*`, `src/app/features/today/{today,capture,task-row}.*`,
`src/app/features/{reporting,calendar,settings,upcoming}/*`,
`src/app/shared/{shell,empty-state,date-picker}.html`, `src/app/shared/brand/logo.*`,
`supabase/functions/notify/index.ts`, `AGENTS.md`, `BUILD-PLAN.md`, `docs/RETHEME-PLAN.md`


## 2026-09-17 · claude-code · retheme phase 3, brand assets

**Did**
- Phase 3 front end, one commit: `public/icon.svg` to a flat `#ec7f72` field with
  `#fffdf7` marks (gradient dropped), then `node tools/build-icons.mjs`. The nine
  PNGs plus `favicon.ico` went **178 kB → 29 kB** — a flat field compresses where
  a gradient does not.
- `logo.html` / `logo.ts`: coral tile replaces the two-stop gradient, `ink()` is
  `#fffdf7` (primary/light) and `#1f1b16` (dark), `gradientId` deleted.
- `manifest.webmanifest`: `theme_color` and `background_color` to `#f6eedc`.
- `index.html` meta + pre-paint script and `theme.ts` constants to `#fffdf7` /
  `#1e1b15`; `theme.spec.ts` constants and two test names followed.
- `empty-state.html`: the `blank` caret and the `filtered` front-sheet edge from
  `#6366f1` to `var(--color-pen-text)`.
- **Clicked through the signed-in app in both themes, first time on this branch.**
  Noel signed in; shell, today, filter chips, three of the four empty-state
  scenes, calendar, day detail, settings, upcoming and reporting were all seen.
  Closes the §12 gap that said nobody had.
- 679 tests / 37 files, build 439.19 kB initial (107.58 kB transfer), styles
  45.09 kB, `contrast-check` green bar the known D5 gap.

**Decided**
- **`theme-color` is `--color-surface`, not the desk.** `RETHEME-PLAN.md` Phase 3
  specified `#F6EEDC` / `#161410`, which are `surface-sunken`. `body` is
  `bg-surface`, so those values draw a visible band under the status bar on an
  installed PWA. Shipped `#fffdf7` / `#1e1b15`, which is also what `theme.ts`'s
  own comment always claimed the tag was for. The manifest keeps `#f6eedc`: it
  paints the splash, not the bar. Plan amended in §5.
- **The app icon is the one place light sits on coral.** Paper on coral is
  2.63:1, under the 3:1 non-text floor. Kept deliberately — WCAG exempts a logo,
  the marks are 42-unit slabs not hairlines, and `on-brand` ink at 6.52:1 reads
  as a rubber stamp rather than a page. Written into `icon.svg` and `AGENTS.md`
  so a later sweep does not "fix" it.
- **D3 confirmed against the real drawer**, not only last session's injected
  mock: `bg-brand-tint text-on-brand-tint`. Subtle in dark (`#3a211d`) but legible.
- Deleted `logo.spec.ts`'s gradient-id test, 680 → 679. A flat tile has no id to
  collide, so the bug it guarded can no longer be written. Commented in place.

**Didn't work**
- `ng serve --port 4200` exits **127**: Noel already had a server there. It was
  serving this working tree and live-reloaded the new values, so nothing was
  needed. Check `lsof -nP -iTCP:4200 -sTCP:LISTEN` before starting one.
- **Two screenshots lied.** The calendar's first shot had no snapshots loaded and
  looked like an empty month; two seconds later it came back with green heat
  cells and crimson carried-off dots. Clicking a day caught the View Transition
  mid-cross-fade. Same family as last session's stale theme frame: **wait 2s and
  re-shoot before believing any screenshot of this app.**
- `var()` inside an SVG presentation attribute was the one thing not safe to take
  on trust — a silent failure there is indistinguishable from an inherited
  colour. Confirmed by computed style: `#27356b` light, `#aab6ee` dark. It works,
  and the three pre-existing `var()` strokes beside it were already proof.
- The `blank` empty state is still unseen. Reaching it means emptying Today,
  which is Noel's data, so it was left alone.

**Open**
- **Three questions asked of Noel and not yet answered:**
  - The `filtered` illustration's front-sheet title line is blush
    `brand-tint-strong` and now reads as a smudge beside the new navy edge — it
    harmonised with the old indigo border. Recommendation: `border-strong`, as
    in every other scene. **Not changed.**
  - **D4 is unjudgeable:** no overdue task exists, so the only crimson in the app
    is the calendar legend dot and Settings' `Delete` links, which is not the
    comparison the plan asks for. Back-date a task, or leave today's unfinished.
  - **D2:** both hues now seen in both themes. Violet `deep` is fine; amber
    `quick` barely separates from the paper in light. Recommendation: keep both
    hues, take `quick`'s tint one step deeper.
- `supabase/functions/notify/index.ts` is the rest of Phase 3 and is untouched —
  its own commit and its own deploy, per the plan.
- Device check outstanding: reinstall to see the coral icon, and confirm the
  cream `background_color` on a dark install is one splash and not a flash.
- D1 and D5 unchanged in `RETHEME-PLAN.md` §8.
- `_to_delete/` still holds ~180 stale git temp files.

**Next**
- `notify/index.ts`: digest hexes to the new ink and crimson, subject line loses
  its em dash, as its own commit and its own `supabase functions deploy notify`.
  Then Phase 4, the self-hosted Fraunces.

**Touched** — `public/icon.svg`, `public/icons/*.png`, `public/favicon.ico`,
`public/manifest.webmanifest`, `src/index.html`, `src/app/core/theme.ts`,
`src/app/core/theme.spec.ts`, `src/app/shared/brand/{logo.html,logo.ts,logo.spec.ts}`,
`src/app/shared/empty-state.html`, `AGENTS.md`, `BUILD-PLAN.md`,
`docs/RETHEME-PLAN.md`

## 2026-09-17 · claude-code · retheme phase 2, call sites

**Did**
- Built the Phase 2 audit table as `RETHEME-PLAN.md` §9 — every `brand-*` site
  outside specs, one row each with the new class and the §4 rule — then applied
  it: 41 sites across 16 files. `text-brand-text` → `text-pen-text`; primary
  fills `bg-brand-600` → `bg-brand-500 hover:bg-brand-600`; capture and
  task-detail info chips `brand-tint` → `pen-tint`/`on-pen-tint`; hand-rolled
  focus rings → `ring-focus`/`outline-focus`; checkbox hover borders →
  `pen-500`; calendar today marker and cell-hover rings → `ring-pen-text`.
- Deleted `--color-brand-text`/`-hover` from both columns of `src/styles.css`.
- New `--color-knob: #fff` (both themes) for the settings toggle knobs, which
  were `before:bg-on-brand` — white only because `on-brand` used to be white.
- `login.html:88` email-input focus moved to `pen-500`/`pen-tint-strong` now;
  the rest of login's and welcome's poster decoration deferred to Phases 5/6.
- 680 tests / 37 files pass, build 439.19 kB initial (107.56 kB transfer),
  contrast check green bar the known D5 gap — all run after the alias deletion.

**Decided**
- **D3: active nav is `bg-brand-tint text-on-brand-tint`.** Both variants were
  rendered against the live tokens in both themes. `fill` lost on function:
  it is identical to `hover-strong` in light (#F1EADA), so a `fill` active item
  cannot be told apart from a hovered one. Recorded in `RETHEME-PLAN.md` §8.
- Knob is its own token, not `on-status` — a knob is not text on a status fill.
- Phase 2's done-gate amended (`RETHEME-PLAN.md` §9): the grep returns only
  `welcome.html`'s two `text-brand-100` lines until Phase 5 rebuilds that page.

**Didn't work**
- **Signed-in screens are unreachable from an agent**: localhost has no session
  and signing in is Noel's to do. Checked D3 by injecting both nav variants
  into the running dev page with `javascript_tool` — the compiled stylesheet is
  global, so the mock renders the real tokens. Good enough for a token
  decision; not a substitute for the click-through.
- First Chrome screenshot after flipping `.dark` off showed a stale frame with
  dark-theme colours; computed styles proved the DOM right. Re-shoot before
  believing a theme-flip screenshot.
- `ng serve ... | head -20` in a background task kills the server once head
  exits. Run it unpiped.

**Open**
- **Still nobody has clicked through the signed-in app on this branch.** The
  D3 mock is the only rendered evidence; primary buttons, chips and rings are
  verified by token maths, not by eye.
- D1, D2, D4, D5 unchanged in `RETHEME-PLAN.md` §8.
- Hexes outside the stylesheet still indigo (Phase 3 list unchanged);
  `notify` is its own deploy.
- `_to_delete/` still holds ~180 stale git temp files.

**Next**
- Phase 3 of `docs/RETHEME-PLAN.md`: `public/icon.svg` to flat coral +
  `tools/build-icons.mjs`, manifest and `index.html`/`core/theme.ts`
  theme-colors to `#F6EEDC`/`#161410`, `empty-state.html` pen token,
  `brand/logo.*` coral tile, `notify/index.ts` hexes as its own commit/deploy.
  Or first: Noel runs `npm start` and clicks through both themes.

**Touched** — `docs/RETHEME-PLAN.md`, `src/styles.css`, `src/app/app.ts`,
`shared/shell.html`, `shared/date-picker.ts`, `shared/date-picker.html`,
`shared/theme-toggle.html`, `features/today/{capture,today,task-row,task-detail}.html`,
`features/upcoming/upcoming.html`, `features/calendar/{calendar.html,calendar.ts,day-detail.html}`,
`features/reporting/reporting.html`, `features/settings/settings.html`,
`features/login/login.html`

## 2026-09-17 · cowork · paper retheme, phases 0 and 1

**Did**
- Brainstormed a retheme with Noel. Three directions sketched; **"Paper and biro"
  chosen**, then **coral `#EC7F72`** chosen as the brand over ink, blue-black and
  plum. Hero and colour options mocked on a Claude design canvas ("Daybook welcome
  hero": desktop, mobile, colour options). The canvas is reference only; nothing
  in the repo reads it.
- Wrote `docs/RETHEME-PLAN.md`: decisions, token tables for both themes, measured
  contrast, call-site audit, phases 0 to 8, risks, final copy deck, open decisions
  D1 to D5. **Read it before touching colour.**
- Branch **`retheme/paper`** off `master`. Two commits, not pushed: `0fed13d`
  (docs), `dbbe135` (tokens).
- Phase 0: `BUILD-PLAN.md` gained phase 9 in §3, a pointer in §4, the superseded
  brand line in §5.4, a §9 entry "The paper retheme, 17 Sep", a reversal note on
  the no-webfont paragraph. `AGENTS.md` Colour and Typeface rewritten for coral
  as fill, pen as text, `on-brand` ink, `on-status`, one self-hosted display face.
- Phase 1, `src/styles.css`: `ink-*` warmed (same names), `brand-*` is coral,
  new `pen-*` palette (50/100/300/500/600/700), `late-*` moved to crimson
  (`#d92d4a` / `#a3122f`), every semantic token re-pointed in both columns, dark
  column is warm charcoal. New tokens: `on-status`, `pen-text`, `pen-text-hover`,
  `pen-tint`, `pen-tint-strong`, `on-pen-tint`, `focus`. The global
  `:focus-visible` ring now reads `--color-focus` (pen-500 light, pen-300 dark).
- **`on-brand` flipped from white to `#2b1310`.** The three status-fill sites moved
  to `text-on-status` in the same commit: `task-row.html`, `task-detail.html`,
  `toasts.html` (error tone, including its Undo, which was `text-brand-100`).
- `brand-text` / `brand-text-hover` kept as **deprecated aliases of `pen-text`** so
  the ~27 `text-brand-text` sites stay readable until Phase 2 renames them.
- New `tools/contrast-check.mjs`: parses `@theme` and the first `.dark` block,
  measures 31 pairs per theme plus the heat-map top step, two expected failures
  that encode why coral is never text, one known gap. Passes.
- 680 tests / 37 files passing. `ng build` 438.94 kB initial (107.53 kB transfer),
  styles 44.84 kB. Both run on a Linux copy of the working tree, see Didn't work.
- Screenshotted `/welcome` and `/login` from the production build in both themes.
  Warm, readable, still the old always-dark poster layout, as expected.

**Decided**
- All of it is in `BUILD-PLAN.md` §9 "The paper retheme" and `RETHEME-PLAN.md` §1.
  Short form: coral is a fill and never text (4.21:1 as text, 2.68:1 under white,
  neighbour of overdue red); a blue-black pen does brand-as-text; `on-brand` is
  ink in both themes; Fraunces self-hosted for welcome, login and app page titles
  only; welcome and login stop being dark in both themes; the hero becomes a
  try-it page on the real `parse-capture`, nothing saved.
- The plan lives in `docs/RETHEME-PLAN.md`, not `BUILD-PLAN.md`, at Noel's choice.
  `BUILD-PLAN.md` holds state and decisions only and points at it.
- `on-status` had to land in Phase 1, not Phase 2 as first planned. `on-brand`
  cannot flip while anything uses it on green.

**Didn't work**
- **`ng test` and `ng build` cannot run through Cowork's shell on Noel's Mac.**
  That shell is a Linux VM mounting the folder, and `node_modules` holds darwin
  binaries: `lightningcss` throws `MODULE_NOT_FOUND`. Do not `npm install` there,
  it would break the Mac install. Worked around by tarring the tree without
  `node_modules`, `npm ci` in the cloud container, and running there. Claude Code
  on the Mac has no such problem.
- The cloud container ships Node 22.22.2, which Angular 22 refuses. `nodejs.org`
  is not needed: `npm i --prefix <dir> node@24` gives a working binary from the
  npm registry.
- **git could not remove its own `.git/index.lock` from that shell** until Noel
  granted delete permission for the folder. That is where the `tmp_obj_*` and
  `*.lock` files in `_to_delete/` came from in earlier sessions.
- `git commit` there has no identity. Used `-c user.name/-c user.email` per
  command with Noel's existing author line; no config was written.
- First version of the token script matched the dark block by exact whitespace
  and aborted before writing. Replaced with a regex over the whole `.dark` block.

**Open**
- **Nobody has looked at a signed-in screen on this branch.** Run `npm start` on
  `retheme/paper` and click through Today, composer, task detail, calendar, heat
  map, reporting, settings, toasts, both themes. Expect half-finished: primary
  buttons still say `bg-brand-600`, now the darker hover coral.
- D5: white tick on `done-500` is 2.54:1, predates this work, BUILD-PLAN §12.
- D1 to D4 in the plan: handwriting font or inline SVG, keep amber/violet for
  quick/deep, active nav wash, final crimson.
- Hexes outside the stylesheet are still indigo: `public/icon.svg`, manifest
  `theme_color`, `index.html` theme-color and pre-paint script, `core/theme.ts`,
  `brand/logo.html`, `brand/logo.ts`, `empty-state.html`, `welcome.css`,
  `supabase/functions/notify/index.ts`. That is Phase 3, and `notify` is its own
  deploy.
- `_to_delete/` still holds ~180 stale git temp files. Delete is now possible;
  left alone because nobody asked.

**Next**
- Phase 2 of `docs/RETHEME-PLAN.md`. First build the audit table at the bottom of
  that file: `grep -rnE "brand-[a-z0-9/-]+" src/app --include=*.html --include=*.ts`
  minus specs, one row per site with the new class and the rule from §4 applied
  (fill or selection stays brand as `bg-brand-500 hover:bg-brand-600
  text-on-brand`; text, icons, checkbox borders and rings go to pen; active-nav
  wash is `brand-tint`; parsed-input wash is `pen-tint`). Show Noel the table, then
  apply it, then delete the `brand-text` aliases from `styles.css`.

**Touched** — `docs/RETHEME-PLAN.md`, `BUILD-PLAN.md`, `AGENTS.md`, `src/styles.css`,
`tools/contrast-check.mjs`, `src/app/features/today/task-row.html`,
`src/app/features/today/task-detail.html`, `src/app/shared/toasts.html`

## 2026-09-11 · claude-code · 0005 applied, notify deployed whole

**Did**
- **Applied `0005_multitenancy_hardening.sql` to live** as
  `20260911074356 daybook_multitenancy_hardening`. Seven migrations now, not six.
  Applied through the Supabase MCP `apply_migration`, then verified the stored
  statements against the repo file by whitespace-normalised md5 —
  `02b056fe00bb8e834accd917e5547b34` on both sides. What ran is the file.
- Verified live, one by one: `push_subscriptions` exists with RLS on and one
  owner policy; the legacy `user_settings.push_subscription` row backfilled into
  it (1 row); `due_reminders` now returns `(task_id, user_id, text, reminder_at,
  subscription_id, endpoint, p256dh, auth)`; grants are `service_role`-only on
  `due_reminders` / `due_digests` / `digest_payload`, `authenticated` +
  `service_role` on `register_push_subscription`, `anon` nowhere;
  `tasks_category_idx` created.
- Timezone defence proven on live, not just locally: `daybook_local_now('Not/AZone')`
  returns null, and an `update user_settings set timezone = 'Mars/Olympus_Mons'`
  raises `22023` from the trigger with the stored zone unchanged.
- **Deployed the repo's `notify` whole** — `supabase functions deploy notify
  --project-ref zzacswfongmzpnhcjiqp`, now **version 13**, `verify_jwt` still
  true. Deleted the do-not-deploy header from
  `supabase/functions/notify/index.ts` in the same change.
- **Confirmed the new code running on the cron, not just uploaded.** The 07:50Z
  tick returned `reminders:{"sent":0,"failed":0,"devices_dropped":0}` where
  07:45Z returned `{"sent":0,"failed":0}`. `devices_dropped` exists only in the
  rewritten `runReminders`, so the new function read the new eight-column
  `due_reminders` and finished without throwing. That key is the tell — check
  for it after any future `notify` deploy.
- Read the deployed source before replacing it: live was exactly what the 6 Sep
  entry described — the 22 Aug function plus `isRetryableSendFailure`, with the
  old `subscription jsonb` reminder loop intact.
- Supabase performance advisor: the **four `auth_rls_initplan` findings are
  gone**. Three `unused_index` INFOs remain, two of which are the indexes 0005
  just created. Security advisor unchanged: `pg_net` in public, leaked-password
  protection off, and the three by-design `authenticated`-callable
  `SECURITY DEFINER` functions.
- 680 tests / 37 files passing. `auth.test.mjs` and `webpush.test.mjs` pass
  (13/13 in webpush). Bundle 438.64 kB (107.47 kB transfer) — unchanged, no app
  code touched.

**Decided**
- **Deploy Edge Functions with the Supabase CLI, not the MCP tool.** The CLI
  reads the files off disk, so what ships is what is committed; pasting three
  files through a tool argument is a transcription risk for no gain. It needs
  no `supabase link` — `--project-ref` is enough — and it does not need Docker,
  despite warning that Docker is not running.
- **`supabase db push` is not usable on this repo and should not be reached
  for.** The remote migration history is keyed by timestamp
  (`20260817025442…`), the repo files are `0001…0005`, so the CLI sees five
  unapplied migrations and would try to replay the schema from scratch.
  Migrations go through `apply_migration`, and the md5 check above is how you
  prove the file is what ran.

**Didn't work**
- **Nearly proved the bad-timezone fix by writing a bad zone to the live row
  inside a transaction and rolling back. Abandoned.** `execute_sql` gives no
  guarantee an explicit `BEGIN`/`ROLLBACK` is honoured as written, and a bad
  value left behind is precisely blocker 1 — the one user's digest dies
  silently and nothing reports it. The property was proved from
  `daybook_local_now('Not/AZone') → null` plus the verified function body
  instead. **Do not test a swallow-the-error path by planting the error in the
  only production row.**
- Tried to close the two secret items and could not. Deleting the leaked Resend
  `Onboarding` key needs the Resend dashboard, and rotating the `service_role`
  key needs the Supabase dashboard; neither is reachable from the MCP surface
  or the CLI. Moving the key into Vault *is* reachable, but it rewrites the
  live cron command without fixing the leak — the key stays the leaked one
  until it is rotated — so it was left for Noel rather than done half.

**Open**
- **Push has never been seen delivering off the new table.** Everything below
  the wire is verified and nothing above it is. `0006` — dropping
  `user_settings.push_subscription` — waits on that, by design.
- **The deployed frontend has been calling objects that did not exist.**
  `origin/master` contains `5b85bbd`, whose `settings.store.ts` calls
  `register_push_subscription` and `from('push_subscriptions')`. Neither existed
  in live until today, so enabling reminders in the production app has been
  broken since that deploy. Inferred from the code against the schema, not
  observed — nobody appears to have tried, and the logs do not retain that far.
  It works now.
- The 6 Sep entry called the hotfix **version 10**. The platform reports the
  pre-deploy function as **version 12** and the new one as 13. The *content*
  that entry described was right; the version number was not. Do not use "v10"
  as a landmark.
- **Delete the `Onboarding` key in Resend** (`re_71wWo2wk…`) — still live, still
  leaked, still depended on by nothing.
- **`service_role` is still plaintext in `cron.job.command`** (blocker 4), and
  leaked-password protection is still off (blocker 5). Both are dashboard
  toggles and both are what is left of Gate 0.
- PWA on the phone is still the old origin.

**Next**
Reinstall the PWA on the new origin, sign in, enable reminders, and set a task
for two minutes out. That one pass registers a row through
`register_push_subscription`, proves the per-device fan-out in `runReminders`,
and is the only thing standing between here and `0006`.

**Touched** — `supabase/functions/notify/index.ts`, `BUILD-PLAN.md`,
`docs/SESSIONS.md`, live: migration `20260911074356`, edge function `notify` v13

## 2026-09-06 · claude-code · digest delivery, key rotation, retry fix deployed

**Did**
- Cleared a stale `.git/index.lock` (0 bytes, crashed process, no git running);
  committed the 5 Sep cowork entry + BUILD-PLAN edits, which were staged but
  never committed.
- **Deployed the digest retry-storm fix as `notify` v10.** Live was still v9
  from 22 Aug, so `isRetryableSendFailure` (written 3 Sep in `5b85bbd`) had
  never shipped. Verified running: `digests:{"sent":1,"failed":0,"dropped":0}`.
- **Rotated `RESEND_API_KEY`** off the key leaked in a Cowork transcript onto a
  new `daybook-digest`. Confirmed by Resend's last-used column, not by trust.
- **Diagnosed two days of vanished digests.** Gmail accepted, returned 250, and
  silently discarded. Fixed with a Gmail "Never send it to Spam" filter;
  confirmed landing in `[INBOX]` at 10:55Z. Full chain in BUILD-PLAN §12.
- 680 tests / 37 files passing, bundle 438.64 kB (107.47 kB transfer) —
  unchanged, no app code touched this session.

**Decided**
- **Do not deploy the repo's `notify/index.ts` until 0005 is applied.**
  `5b85bbd` rewrote `runReminders` against 0005's `push_subscriptions` table
  and the new `due_reminders` shape. Live has neither, so deploying it whole
  breaks every push reminder — the subscription assembles from four
  `undefined`s. v10 is therefore the 22 Aug function plus only the digest half,
  byte-for-byte, verified by diffing both halves before deploy. The repo file
  carries a do-not-deploy header naming the coupling; delete it with 0005.
- A leaked key is not rotated by creating a new one beside it. The exposed key
  stayed valid and in use for a day after `daybook-smtp` was added, because
  that only covered Auth SMTP, not the Edge Function secret.

**Didn't work**
- **Deploying the repo's `notify` — nearly did it, and it would have silently
  broken push.** Caught only by checking `due_reminders`' live return type
  (`subscription jsonb`) and `to_regclass('public.push_subscriptions')` (null)
  before deploying. Check the live schema against the code, not the plan.
- **Chasing the missing digest from the sending side is a dead end.** Supabase
  logs, `digest_last_sent_on`, and Resend all report success; they can only see
  as far as the receiving MTA's 250. Go to the receiver's telemetry — the DMARC
  aggregate report — or you are reading the wrong instrument.
- Initially blamed a Gmail filter for the 27 Aug–4 Sep digests sitting unread
  in Trash. Wrong: Noel was deleting them. The real failure only started 5 Sep
  with the sender change.
- Wrongly said this session's forced sends would suppress tomorrow's 07:00
  digest. They do not — `due_digests` compares `digest_last_sent_on <` local
  date, so today's value still fires tomorrow. Verified in SQL.
- No Zoho attachment-download tool exists in the MCP set; the DMARC zip had to
  be downloaded by hand. Attachment *info* is available, content is not.

**Open**
- **Delete the `Onboarding` key in Resend** (`re_71wWo2wk…`). Nothing depends on
  it — verified via last-used — but it is still live and still leaked.
- `service_role` secret sits in plaintext in `cron.job.command`, readable by
  anything that can read that table, and was surfaced in this session's
  transcript. Rotate with the Resend key.
- Gmail's drop is unfixed for anyone but Noel: a second user cannot be told to
  add a filter. Domain warming is the real fix. §12.
- PWA on the phone is still the old origin; the stale push row is
  `user_settings.push_subscription` (one row), **not** a `push_subscriptions`
  table — that does not exist until 0005.
- Everything from the 5 Sep entry except `DIGEST_FROM` and the retry storm.

**Next**
Phase 7 Gate 1. Gate 0 has been written and locally proven since 3 Sep and
nothing is applied; today showed the cost of that drift, since the obvious
deploy was the wrong one. Apply 0005, then deploy the repo's `notify` whole.

**Touched** — `supabase/functions/notify/index.ts`, `BUILD-PLAN.md`,
`docs/SESSIONS.md`

## 2026-09-05 · cowork · custom domain, sending subdomain, auth lockdown

**Did**
- `daybook.noel-sebastian.com` live on Vercel and now the production domain.
  CNAME `daybook` → `703f8a9727faef44.vercel-dns-017.com`, DNS only.
  `daybook-bay.vercel.app` left serving, no redirect, as the rollback.
- `send.noel-sebastian.com` verified in Resend, Tokyo (`ap-northeast-1`). DKIM
  `resend._domainkey.send`, MX and SPF on `bounce.send`, all three verified.
- Supabase Site URL → `https://daybook.noel-sebastian.com`; redirect list cut
  from four entries to `daybook.noel-sebastian.com/**`,
  `daybook-bay.vercel.app/**`, `localhost:4200/**`.
- Custom SMTP via `smtp.resend.com:465`, sender `noreply@send.…`. Magic link
  delivered; Noel signed in on the new domain.
- `DIGEST_FROM` → `Daybook <digest@send.noel-sebastian.com>`. Closes the item
  open since 21 Aug and the Phase 7 blocker in §4.
- New signups disabled. `send.noel-sebastian.com` verified in Google Postmaster.
- No code changed, so no build or test run this session. Docs only:
  BUILD-PLAN §14 added, §2/§4/§5/§9/§12 updated.

**Decided**
- Return-path `bounce`, not Resend's default `send`, to avoid
  `send.send.noel-sebastian.com` reading like the doubled-zone DKIM bug. §9.
- Removed the `daybook-*.vercel.app/**` open redirect, and added
  `daybook-bay.vercel.app/**` explicitly — the wildcard was the only thing
  matching it, so removing it alone would have killed the rollback's sign-in.
- Deleted two redirect entries for `daybook.vercel.app`: not our host (Vercel
  gave us `-bay` because plain `daybook` was taken).
- Declined Resend's Cloudflare OAuth; added DNS by hand. The zone carries
  Noel's Zoho business mail.
- Leaked-password protection stays off permanently: Pro-only, and there is no
  password sign-in for it to protect. The advisor stays red by design. §14.

**Didn't work**
- **First magic link went to Gmail spam with perfect auth** — `dkim=pass`,
  `spf=pass`, `dmarc=pass` (headers in §14). Reputation, not DNS. Do not
  tighten DMARC in response; that record governs the Zoho mail too.
- **Two Supabase saves silently did nothing.** The secrets form hides a
  "Confirm replacing existing secret" dialog behind Save; the User Signups
  block has its Save below the fold. Both looked successful. Read the stored
  value back — the form clearing means nothing.
- Postmaster verification failed twice, at 30s and 4min, then passed unprompted.
  Negative DNS caching from the premature first check. Retry, never re-add.
- Leaked-password toggle flips in the UI and does not persist. That is the
  Pro gate, not a bug.

**Open**
- Tonight's digest is the first real send from `digest@`. If `DIGEST_FROM` were
  wrong the failure mode is the §4 retry storm, 288 sends/day.
- The Resend key Noel pasted into the Cowork transcript needs rotating. SMTP is
  on a new `daybook-smtp` key; `RESEND_API_KEY` still holds the exposed one.
- The installed PWA on the phone is the old origin. Reinstall, re-subscribe to
  push, clear the stale `push_subscriptions` rows.
- `index.ts` still treats every non-`ok` Resend response as retryable. §4.
- Everything from the 4 Sep entry.

**Next**
Watch tomorrow's digest arrive from `digest@send.noel-sebastian.com`, then
Phase 7 — `DIGEST_FROM` no longer blocks it.

**Touched** — `BUILD-PLAN.md`, `docs/SESSIONS.md`

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
- **Bundle 532.51 → 438.64 kB** (128.85 → 107.47 kB transfer) by dropping
  `createClient()` for `auth-js` + `postgrest-js`. §9. Also opt-in route
  preloading (`core/preload.ts`, idle-callback, skipped on `saveData`),
  `withViewTransitions({ skipInitialTransition: true })`, a `preconnect` to
  Supabase, and budgets tightened 560 kB/1 MB → 450/480.
- **Tests 55 → 680**, 4 files → 37. New `src/testing` harness: zoneless
  providers, a chainable `FakeSupabase` no spec can escape, row builders.
- **Two bugs fixed**: `task.store.ts` latching `loaded: true` before checking
  the error, and `parse-capture.ts`'s first-date-wins guard.
- Deleted dead `shared/mark.ts` + `.html`. Removed `@supabase/supabase-js`
  entirely (`node_modules/@supabase` 19 MB → 4.7 MB); the five type-only
  imports now name `auth-js`, where those types actually live.
- **Fixed the theme toggle's own a11y gap, found by a spec agent.** It declared
  `role="radiogroup"` and did not honour it — three tab stops, no arrow keys.
  Now a roving `tabindex` (only the checked option is tabbable) with
  Left/Right/Home/End, wrapping, selection following focus, and `toggle()`
  opening onto the checked option so focus and selection cannot disagree.
  Seven tests; six fail with the bindings removed.

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
