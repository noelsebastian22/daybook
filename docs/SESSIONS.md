# Session log

Shared memory across Cowork, Claude Code and Command Code. No agent can see another's
conversation; this file is the handoff.

Not a changelog — git covers that. This records **intent, dead ends, and open threads**:
the things that live in a conversation and would otherwise die with it.

Written by the `session-handoff` skill. Newest entry first. Never edit a past entry; if
it turned out wrong, say so in a new one.

<!-- newest first -->

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
