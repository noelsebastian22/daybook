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
| 3 | Magic Plus, task-as-object view transitions, swipe, completion choreography | **next** |
| 4 | Calendar, history drill-in, category filter, offline queue | not started |
| 5 | Settings, email digest, weekly review, Web Push reminders | not started |
| 6 | Hero, empty-state illustrations, charts, visual polish | not started |

Phases are deliberately not time-based. Each one is picked up whenever there is
a spare hour.

Phase 3 sits ahead of history on purpose. It is the differentiator, and the app
is useful without a history view. Phase 4 sits where it does because a calendar
needs a few weeks of real data before it is worth looking at. Phase 5's three
items are built together because they share one cron plus Edge Function.

**Phase 2 is half verified.** Google sign-in works end to end and
`ensure_user_setup` seeds the four default categories on first login, both
confirmed by hand on 17 Aug. Every rollover path was proven against the live
database with a seeded auth user and forged JWT claims. What has **not** been
done by a person: adding a task through the capture box, completing one, and
watching a real overnight rollover. Until that happens, treat the task loop as
unverified.

---

## 4. Remaining work, in the order it should be done

### 0. Verify the task loop by hand

Sign-in is done. **Capture is done too**, confirmed by hand on 18 Aug: a task
with a date and a `#tag` parsed correctly, the category chip rendered and it
landed on the right day under the right header in the Upcoming strip.

What is left: complete something and check the timestamp, then leave an
incomplete task overnight and confirm it carries over with the badge showing.

One evening plus one morning. Everything below assumes the loop works.

### Phase 3, the differentiator

Ordered. Each item below is a prerequisite for the ones under it more often
than not, and the order was set on 18 Aug against the Todoist captures.

1. **Confirm that a task was added.** `Capture.onKeydown` clears the box and
   emits, with no toast. A task scheduled for a future day then lands in the
   Upcoming strip, which is collapsed by default, so it disappears from view
   the instant it is created and the add reads as a failure. Found in real use
   on 18 Aug — the only thing here proven broken by a person. Fix is a
   `ToastStore` message naming the day it landed on ("Added to Friday 21 Aug"),
   with undo. Auto-expanding the strip was considered and rejected because it
   moves the page under the cursor mid-typing. The `Open` action waits for the
   `/today/:id` route below.
2. **Date picker.** **Done, 18 Aug**, in `shared/date-picker.ts`. The date chip
   in capture is a button that opens it: a shortcut row with each option's
   resolved day printed beside it (Today, Tomorrow, This weekend, Next week —
   Mon 24 Aug) above a month grid, plus a time field writing `reminder_at`. No
   "No Date", no "Repeat" — see §9. Built before the edit UI on purpose,
   because one picker then serves capture, edit and reschedule-from-a-row; the
   latter two are wired up in item 3. **Not yet used by a person.**
3. **Task-as-object and inline edit.** A `/today/:id` route,
   `view-transition-name: task-{id}` per row, list **unmounted** while the card
   shows. Edit is the `Capture` component rendered in the row's slot, not a
   second form. `TaskStore.remove()` exists with no UI, and there is currently
   no way to fix a typo at all. Not in the original spec; needed the first day
   of real use.
4. **Floating composer.** Capture moves from the always-visible box at
   `today.ts:45` to a floating input invoked by an `Add task` button, with
   explicit cancel and commit. Replaces the Magic Plus FAB, which is now out of
   scope — see §10.
5. **Nav shell.** Drawer on desktop, hamburger sheet on mobile, one nav model
   on both: Today / Upcoming / Reporting. Reporting is the home for §5's weekly
   review and §6's completion chart and will be empty until there is real data.
   **Opens from the button only, never a left-edge swipe** — see §9.
6. **Completion choreography.** Checkbox fills, text strikes and dims, row
   leaves, list closes the gap. Currently only a scale keyframe exists.
7. **Swipe gestures.** Right to complete, left to reschedule, mobile only.

**6 and 7 are blocked on captures.** Both are judged on touch timing and every
Todoist capture taken so far is the web app driven by a mouse. They need the
Todoist **iOS app** recorded before the work starts. See
`docs/reference/todoist/NOTES.md`.

### Phase 4, history

- **Bidirectional calendar** reading `day_snapshots`: past cells as a
  completion heat map, future cells as a count of scheduled tasks, today the
  boundary. Tap any cell for that day's list.
- **Filter Today by category.** Only energy filters exist today.
- **Offline write queue.** Foreground replay in `TaskStore`. A write made with
  no connection is currently lost on reload, and iOS has no Background Sync API
  to lean on.

### Phase 5, the loop that runs without you

- **Settings page.** Digest preferences, timezone, manage categories. Nothing
  currently reads `user_settings.timezone`.
- **Resend account and a digest Edge Function.** Supabase does not send mail.
- **`pg_cron` schedule** driving digest and reminders off the same function.
- **VAPID keys and a real Web Push subscription flow** into
  `user_settings.push_subscription`. Installed PWA only, iOS 16.4 or later.
- **Weekly review.** Most carried over, most rescheduled, completion trend.

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

1. **Add to-dos for the day.** State: done.
2. **Schedule to-dos for a future date**, entered primarily through natural
   language, with the date picker behind the chip for anything the sentence
   does not say. State: done.
3. **Natural language capture.** Typing `call physio thursday 2pm #physio
   !quick` parses into date, time, category and energy, with tokens rendering
   as inline chips as you type. State: done.
4. **Complete with a timestamp**, not just a checkbox, so history and the email
   digest can show "completed at 9:15 AM". State: done.
5. **Daily history.** Each day's list preserved with date and details, viewable
   later. State: **data only.** `day_snapshots` accumulate correctly; there is
   no UI to read them. Phase 4.
6. **Automatic carry-forward.** Incomplete tasks roll to the next day. State:
   done.
7. **Optional reminder times.** State: **visible and editable, never fires.**
   `reminder_at` is set by the capture parser or the date picker's time field,
   and shows as its own chip beside the date. Nothing sends it. Phase 5.
8. **Energy tag per task, Quick or Deep**, so the list can be filtered by how
   much focus is available. State: done, including the filter.
9. **Category tag** (Freelance, Work, Family, Health, or anything typed as a
   `#tag`) for filtering. State: **half done.** Tagging, auto-creation and
   display work. There is no filter by category. Phase 4.
10. **Carried-over count**, incremented automatically on rollover, and a
    separate **reschedule count** for manual pushes. Together they answer "what
    do I keep avoiding". State: data and the row badge are done. The insight
    view is Phase 5.
11. **Upcoming strip** on Today, collapsed by default, showing the next 7 days.
    State: done.
12. **Daily email digest**: completed versus incomplete, plus a preview of
    tomorrow. State: not started. Phase 5.
13. **Weekly review**: tasks carried over or rescheduled most often, plus a
    completion trend. State: not started. Phase 5.
14. **Simple visual stats**, e.g. a glanceable weekly bar chart of tasks
    completed per day. Kept minimal, not an analytics dashboard. State: not
    started. Phase 6.
15. **Calendar view**: heat map of past days and scheduled counts for future
    days, in one bidirectional view. State: not started. Phase 4.
16. **Empty state illustrations**, AI-generated, e.g. "all clear for today".
    State: **placeholders.** Text and a glyph are in place, no artwork. Phase 6.

### 5.1 Signature interactions

The three interactions that make this a product rather than a CRUD list.
Treated as core, not polish.

- **Floating composer** (borrowed from Todoist). An `Add task` button opens a
  floating input over the list, with the date chip live from the moment it
  opens and explicit cancel and commit. Replaced the Magic Plus draggable FAB
  on 18 Aug; see §9 and §10. State: not started, Phase 3.
- **Task as object.** Tapping a task expands it into a card while the rest of
  the list fades back, using the View Transitions API with
  `view-transition-name: task-{id}` per row. Implemented as a route so
  deep-linking and the back button work, via Angular's `withViewTransitions()`.
  State: **router configured, nothing uses it.**
- **Natural language capture** (borrowed from Todoist). The primary input path.
  Rendered as a transparent textarea over a styled mirror div, not
  contenteditable. State: done.

### 5.2 Interaction rules

- **Optimistic updates everywhere.** Write to the store first, sync to Supabase
  after, roll back and toast on error. No spinners. State: done.
- **Undo toast instead of confirmation dialogs.** State: done.
- **Completion animates.** Checkbox fills, text strikes and dims, row leaves
  and the list closes the gap. State: **keyframe only**, no row-leave.
- **Swipe right to complete, swipe left to reschedule**, on mobile. State: not
  started.
- **Sub-100ms perceived latency on every interaction.** This is what makes it
  feel native, and it is an architecture decision (optimistic local writes),
  not a CSS one.

### 5.3 Pages

| Page | Purpose | State |
|---|---|---|
| **Login** | Google OAuth, magic-link fallback | done |
| **Dashboard / Today** | Add and complete tasks, filter Quick/Deep, collapsed Upcoming strip | done |
| **Upcoming** | The next 7 days as a list grouped by day header, with a per-day `+ Add task` row that schedules by position, and a week strip that pages forward. Not the calendar — that is a grid, and it is the row below | not started, Phase 3 |
| **Calendar** | Bidirectional. Past cells show completion density as a heat map, future cells show a count of scheduled tasks, today is the boundary. Tap a cell for that day's list | not started |
| **Weekly Review** | Most carried over, most rescheduled, completion trend | not started |
| **Settings** | Email digest preferences, timezone, manage categories | not started |

Navigation is a drawer on desktop and a hamburger sheet on mobile, the same
model at both widths: Today / Upcoming / Reporting. Reporting is where Weekly
Review and the §6 chart live. State: not started, Phase 3.

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

- **Offline writes are not queued.** Optimistic updates cover an in-session
  drop, but a write made with no connection is lost on reload. Phase 4.
- **Email digest has no provider.** Supabase does not send mail. Resend plus an
  Edge Function, Phase 5.
- **Web Push needs VAPID keys** and a real subscription flow. Phase 5.
- **No hosting, no CI, not deployed anywhere.**
- **The task loop is half verified by a person.** Sign-in, first-login seeding
  and adding a dated, tagged task through the capture box are confirmed as of
  18 Aug. Completing a task and watching a real overnight rollover are not.
- **Adding a task gives no feedback.** See §4 item 1. Known-broken in real use,
  not yet fixed, and now first in the Phase 3 order.
- **No edit or delete UI.** `TaskStore.remove()` exists and nothing calls it;
  a typo cannot be corrected at all. §4 item 3.
- **The reminder is set but never sent.** The chip and the picker's time field
  landed on 18 Aug, so a time is now visible and correctable. Nothing delivers
  it. Phase 5.
- **Completion and swipe motion are blocked on captures from the wrong
  device.** Every Todoist reference so far is the web app driven by a mouse.
  See `docs/reference/todoist/NOTES.md`.

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
