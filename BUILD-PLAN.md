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
| Hosting | Netlify (not set up yet) |
| Email | Resend (not set up yet) |

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
| 2 | Today view, natural language capture, rollover, PWA shell | **done, unverified by a human** |
| 3 | Date picker, task-as-object view transitions, floating composer, nav shell, swipe, completion choreography | **done, verified on screen** — 7 of 7; swipe untested (desktop) |
| 4 | Calendar, history drill-in, category filter, offline queue | **done, verified on screen**; offline queue untested |
| 5 | Settings, email digest, weekly review, Web Push reminders | **digest proven end to end into a real inbox, 21 Aug. Push still unproven; cron still unscheduled** |
| 6 | Hero, empty-state illustrations, charts, visual polish | not started |

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

What is still unverified by a person: **swipe** (no touch device in the pass),
the **offline queue**, and **Web Push**, which no device has ever received.

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
7. **Swipe gestures.** **Built, 21 Aug**, `shared/swipe.ts`. Right completes,
   left reschedules, touch pointers only. Fires on release, not on crossing the
   threshold, so a gesture can be backed out of. **The four timing constants at
   the top of that file are reasoned, not measured** — the captures below never
   happened, so they remain the one thing here still owed.

**6 and 7 were unblocked rather than waited on.** The plan held both for
Todoist **iOS** captures that were never taken. 6 turned out not to need them:
View Transitions decide the motion, not a chosen duration. 7 does still want
them — see the note on its constants. `docs/reference/todoist/NOTES.md`.

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

### Phase 6, polish

- **Real app icons.** Currently the Angular schematic defaults, a purple shield.
- Hero and marketing view.
- AI-generated empty-state illustrations.
- Weekly bar chart of tasks completed per day.
- **Accessibility pass.** Nothing has been audited.

### Not phased, needed before daily use

- **Hosting on Netlify.** When it goes up, the only auth change needed is
  adding the production URL to the Supabase redirect allow list and updating
  Site URL. No Google console change.
- **Custom iOS "Add to Home Screen" hint.** iOS gives no install prompt, and an
  uninstalled PWA can have its cached storage evicted after roughly 7 days.

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
   as inline chips as you type. State: done.
4. **Complete with a timestamp**, not just a checkbox, so history and the email
   digest can show "completed at 9:15 AM". State: done.
5. **Daily history.** Each day's list preserved with date and details, viewable
   later. State: **done.** `day_snapshots` accumulate correctly and the
   calendar plus `/calendar/:date` read them. A past day shows what was
   finished and what was carried off, from two different sources — see §4.
6. **Automatic carry-forward.** Incomplete tasks roll to the next day. State:
   done, and confirmed in normal use by an unattended rollover on 19 Aug.
7. **Optional reminder times.** State: **built end to end, keyed, never yet
   fired.** `reminder_at` is set by the parser or the picker; `due_reminders()`
   finds them, the `notify` function encrypts and posts them. The VAPID pair
   was generated on 21 Aug and all three secrets are set, so Settings now
   reports "Reminders need the installed app" rather than "not configured".
   Nothing has been delivered yet: the cron is still unscheduled, and a real
   delivery needs a built PWA over HTTPS installed to a home screen.
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
    rendered, because nothing scheduled on 20 Aug was completed. Only the cron
    is left before it arrives unprompted.
13. **Weekly review**: tasks carried over or rescheduled most often, plus a
    completion trend. State: **done**, at `/reporting`.
14. **Simple visual stats**, e.g. a glanceable weekly bar chart of tasks
    completed per day. Kept minimal, not an analytics dashboard. State:
    **done early**, as the fortnight chart in Reporting. It arrived with the
    weekly review rather than in Phase 6 because the review needed it.
15. **Calendar view**: heat map of past days and scheduled counts for future
    days, in one bidirectional view. State: **done**, at `/calendar`.
16. **Empty state illustrations**, AI-generated, e.g. "all clear for today".
    State: **placeholders.** Text and a glyph are in place, no artwork. Phase 6.

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
- AI-generated illustrations for the hero and empty states.

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
  created_at         timestamptz not null default now()
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
`push_subscription jsonb`, `seeded_at`. Nothing reads `timezone` yet.

### Security

RLS is enabled on all four tables, owner-only, all four verbs, via
`auth.uid() = user_id`. Both RPCs are `SECURITY DEFINER`, raise on a null
`auth.uid()`, and are revoked from `anon` and `public`.

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
so replacing them is a one-place edit when the iOS captures exist.

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

---

## 10. Explicitly out of scope

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

## 11. Backlog

Not core. Revisit once the main app is solid.

- **Receipt / attachment upload per task**, e.g. a receipt photo on an
  expense-related task. Uses Supabase file storage.
- **Native app wrap.**

---

## 12. Known gaps, deliberately deferred

- **`ensure_user_setup` fires twice on every page load**, consistently two calls
  for every one `rollover_and_snapshot`. It is idempotent so no data is harmed,
  but it is four wasted round trips on every app open, against the sub-100ms
  bar in `AGENTS.md`. Cause not investigated.
- **A rollover failure is invisible to the user.** `task.store.ts:253` logs to
  the console and silently `return`s. Related, and unexplained: `rollover
  failed` plus `InvalidStateError: Transition was aborted` were seen once on a
  genuinely cold first load on 21 Aug and never reproduced across four reloads.
- **A row's carried badge is dropped the instant it completes**, while the
  category chip survives. The count disappears at the exact moment it carries
  the most meaning. Deliberate or not, it is unreviewed. Noel's call.
- **Toasts and the composer centre on the viewport, not the content column.**
  Both use `fixed inset-x-0`, which spans under the 240px sidebar, putting them
  ~112px left of the column they belong to on desktop. Invisible on mobile.
- **The digest sends from a shared Resend address.** `DIGEST_FROM` is
  `onboarding@resend.dev`, which Resend only delivers to the account owner. It
  works for Noel and for nobody else. A verified domain is the fix, and it is
  not urgent while Daybook has one user.
- **The digest's "Yesterday you finished" section has never rendered.**
  `completed_yesterday` keys off `scheduled_date = yesterday`, and nothing
  scheduled on 20 Aug was completed. `call doctor` is scheduled 21 Aug and
  completed, so the 22 Aug digest should exercise it — worth actually reading
  that email rather than assuming.
- **Web Push has keys but has never sent anything.** The VAPID pair was
  generated on 21 Aug, the public half is in both `environment*.ts` and all
  three secrets are set. Settings now reports "Reminders need the installed
  app" rather than "not configured". The **wire format is still unproven** — no
  device has received a push. Testing it needs a built PWA over HTTPS,
  installed to a home screen.
- **Web Push and VAPID need explaining to Noel properly.** Agreed on 21 Aug to
  hold this as a discovery step at the end of the build rather than expand on
  it mid-flight.
- **The cron is not scheduled**, so nothing fires unprompted. `pg_cron` and
  `pg_net` are now enabled (migration `0004`), so all that remains is running
  `supabase/cron/schedule-notify.sql` by hand with the service role key pasted
  in. It must be the service role key: `notify` 403s anything else.
- **No hosting, no CI, not deployed anywhere.** The code now lives on GitHub at
  `noelsebastian22/daybook`, `master` tracking `origin/master` since 18 Aug.
  That is a remote, not a deployment.
- **Swipe and the offline queue are the last unverified features.** The 21 Aug
  clickthrough was done on a desktop browser, so neither was exercised. Every
  other page and interaction in Phases 3 to 5 has now been seen working.
- **Swipe thresholds are guesses.** The four constants in `shared/swipe.ts`
  were reasoned, not measured, because the Todoist iOS captures the plan
  called for were never taken. The gesture works; whether it *feels* right is
  untested on a real thumb.
- **The initial bundle budget was raised from 500 kB to 560 kB** to take the
  router features and five new pages. Actual initial total is 517 kB. Every
  page lazy-loads; the growth is in the shared vendor chunk.
- **The Todoist captures are still the wrong device.** Every reference is the
  web app driven by a mouse. Completion motion no longer needs them; swipe
  still does. See `docs/reference/todoist/NOTES.md`.

---

## 13. Platform constraints and gotchas

### iOS PWA

- No automatic install prompt. Needs a custom "Add to Home Screen" hint.
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
