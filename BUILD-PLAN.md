# Daybook: build plan and locked decisions

Source of truth for *why* things are the way they are. The Notion spec is the
product brief; this file is what survived contact with the database.

## What it is

One page per day. Completed tasks are stamped with a time and kept.
Unfinished tasks carry forward automatically. Anything can be scheduled ahead.

Personal project first. Possibly a product later.

## Phase status

Current state. The chronological record is `docs/SESSIONS.md`.

| Phase | Scope | State |
|---|---|---|
| 1 | Auth, data model, session store, guard, create-and-save | **done** |
| 2 | Today view, natural language capture, rollover, PWA shell | **done, unverified by a human** |
| 3 | Magic Plus, task-as-object view transitions, swipe, completion choreography | **next** |
| 4 | Calendar (past heat map, future counts), Upcoming drill-in | not started |
| 5 | Email digest, weekly review, Web Push reminders | not started |
| 6 | Hero, empty-state illustrations, charts, visual polish | not started |

Phase 3 sits ahead of history on purpose. It is the differentiator, and the
app is useful without a history view.

**Phase 2 is built but nobody has signed in.** Every rollover path was proven
against the live database with a seeded auth user, but no task has been added
through the UI by a person. Until that happens, treat Phase 2 as unverified.

## Spec coverage

Every numbered item from the Notion spec, and where it actually stands.

### Core features

| # | Feature | State |
|---|---|---|
| 1 | Add to-dos for the day | done |
| 2 | Schedule for a future date | done |
| 3 | Natural language capture with inline chips | done |
| 4 | Complete with a timestamp | done |
| 5 | Daily history preserved and viewable | **data only** — `day_snapshots` written, no UI (Phase 4) |
| 6 | Automatic carry-forward | done |
| 7 | Optional reminder times | **parsed and stored, never fires** — no notification, not editable (Phase 5) |
| 8 | Energy tag, Quick vs Deep, filterable | done |
| 9 | Category tag for filtering | **tag and display done, no filter by category** |
| 10 | Carried-over and reschedule counts | data + badge done; the insight view is Phase 5 |
| 11 | Upcoming strip, next 7 days, collapsed | done |
| 12 | Daily email digest | not started (Phase 5) |
| 13 | Weekly review | not started (Phase 5) |
| 14 | Weekly bar chart of completions | not started (Phase 6) |
| 15 | Calendar heat map | not started (Phase 4) |
| 16 | Empty-state illustrations | **text and glyph placeholders in place**, no artwork (Phase 6) |

### Signature interactions

| Interaction | State |
|---|---|
| Natural language capture | done |
| Optimistic updates everywhere | done |
| Undo toast instead of dialogs | done |
| Magic Plus draggable add button | not started |
| Task-as-object expansion | **router has `withViewTransitions()`, nothing uses it** |
| Completion animation | **keyframe exists, no row-leave or list-close** |
| Swipe right complete, swipe left reschedule | not started |

### Pages

| Page | State |
|---|---|
| Login | done |
| Dashboard / Today | done |
| Calendar | not started |
| Weekly Review | not started |
| Settings | not started |

## Remaining work, in the order it should be done

**0. Verify Phase 2 by hand.** `npm install && npm start`, sign in, add a task
with a date, a `#tag` and an `!energy`, complete it, reload. One evening. Do
this before anything else: everything below assumes the loop works.

**Phase 3 — the differentiator**

- Task-as-object: a `/today/:id` route, `view-transition-name: task-{id}` per
  row, list **unmounted** while the card shows (not hidden, or the transition
  breaks silently).
- Magic Plus: draggable FAB. Drop in the list to insert there, on a calendar
  cell to schedule, on a category chip to pre-tag. Blocked on Phase 4 for the
  calendar drop target; build the list and chip targets first.
- Completion choreography: checkbox fill, strike, dim, row leaves, list closes
  the gap.
- Swipe right to complete, swipe left to reschedule.
- **Delete and edit a task.** `TaskStore.remove()` exists with no UI, and there
  is no way to fix a typo at all. Not in the spec, needed the first day of real
  use.

**Phase 4 — history**

- Bidirectional calendar reading `day_snapshots`: past cells as a completion
  heat map, future cells as scheduled counts, today the boundary.
- Tap a cell for that day's list.
- Filter Today by category (spec item 9, currently only energy filters).
- **Offline write queue.** Foreground replay in `TaskStore`; iOS has no
  Background Sync API. Right now a write made offline is lost on reload.

**Phase 5 — the loop that runs without you**

- Settings page: digest preferences, timezone, manage categories. Nothing
  reads `user_settings.timezone` yet.
- Resend account plus an Edge Function for the digest. Supabase does not send
  mail.
- `pg_cron` schedule driving digest and reminders off the same function.
- VAPID keys and a real Web Push subscription flow into
  `user_settings.push_subscription`. Installed PWA only, iOS 16.4+.
- Weekly review: most carried over, most rescheduled, completion trend.

**Phase 6 — polish**

- Real app icons. Currently the Angular schematic defaults.
- Hero and marketing view.
- AI-generated empty-state illustrations.
- Weekly bar chart.
- Accessibility pass. Nothing has been audited.

**Not phased, needed before daily use**

- Hosting on Netlify, and a custom iOS "Add to Home Screen" hint. iOS gives no
  install prompt, and an uninstalled PWA can have its storage evicted after
  about 7 days.
- Google OAuth credentials. See `README.md`.

## Locked decisions

**Angular over Astro/Next.** Real interactivity and state, not a brochure
site. Also a low-stakes place to go deeper on Signals and SignalStore.
React/Next is deliberately saved for the *next* side project.

**PWA over native.** Fits the actual usage pattern (commute, work breaks,
home) without a second codebase. A native wrap stays possible later.

**Supabase over a hand-rolled backend.** Free tier covers personal use and
Google OAuth comes built in.

**No `status` column.** With `scheduled_date`, `completed_at` and
`carried_over_count`, all three states derive. Nothing to keep in sync.

**No kanban / board view.** It would need a status table, drag and drop,
fractional index ordering and a separate mobile interaction path, and it
pulls the app toward being a project tracker when the premise is a daily log.
Every extra column is somewhere tasks go to sit for weeks.

**No "someday" bucket.** `scheduled_date` is required, which forces a
decision at capture time. Friction by design.

**Rollover is lazy on app open, not cron.** Uses the client's local date,
clamped server-side to within a day of server time. Timezone-correct by
construction, nothing to debug at 2am, idempotent.

**Carry-forward and reschedule are counted separately.** Deliberately pushing
something to next week is a stronger avoidance signal than passively letting
it roll.

**Upcoming looks 7 days ahead.** Anything beyond a week on a daily app is a
wish list, not a plan.

## Decisions made during the build

These were not in the Notion spec. They are now.

**`categories` table added.** `tasks.category_id` referenced a table that did
not exist anywhere in the spec.

**`user_settings` table added.** Phase 5 needs digest preferences, timezone
and a Web Push subscription, and nothing in the model held them.

**RLS added on all four tables.** The spec never mentioned it. Without it the
publishable key reads every row in the database.

**Snapshots are written for every day in the gap, not just the closing day.**
The spec wrote one row per rollover run. Skip a weekend and Monday's run
would write a single Sunday row, losing Friday and Saturday from the heat map
entirely. The RPC now loops from the last snapshot to today, and each day
counts every task still open on that date (`scheduled_date <= day`), not just
tasks sitting exactly on it.

**`carried_over_count` counts days, not rollover runs.** The spec said
"increments each time a task rolls over". That makes the number depend on how
often the app is opened: a task ignored for a week reads as 1 if you open the
app once and 7 if you open it daily. Same avoidance, different number. It now
increments by `today - scheduled_date`, so it measures the thing it claims to.

**Unknown `#tag` creates the category.** Typing `#physio` when no physio
category exists creates it rather than silently dropping the tag. Dropping
input the user clearly meant is worse than an occasional stray category, and
categories are trivial to delete.

**Setup runs as an idempotent RPC, not a trigger on `auth.users`.** Triggers
on that table fail in ways that are painful to debug and can block sign-up.

**Google OAuth ships alongside a magic-link fallback.** Google needs manual
Google Cloud configuration. The fallback means Phase 1 is testable before
that happens, and it stays useful as a recovery path afterwards.

**`@ngrx/signals` is on `22.0.0-rc.0`.** The stable line (21.x) peer-requires
Angular 21. Reverting to Angular 21 LTS is a one-command change if the RC
causes trouble.

## Known gaps, deliberately deferred

- **Offline writes are not queued.** Optimistic updates cover an in-session
  drop, but a write made with no connection is lost on reload. iOS has no
  Background Sync API at all, so this has to be a foreground replay queue in
  `TaskStore`. Phase 3 or 4.
- **Email digest has no provider yet.** Supabase does not send mail. Resend
  plus an Edge Function on the existing cron, in Phase 5.
- **Web Push needs VAPID keys** and a real subscription flow.
  `user_settings.push_subscription` is where it lands. Phase 5.
- **No hosting yet.** Netlify when it goes up.

## iOS PWA constraints to design around

- No automatic install prompt. Needs a custom "Add to Home Screen" hint.
- No Background Sync API. Sync on foreground only.
- Cached storage can be evicted after roughly 7 days of non-use unless the
  PWA is installed.
- Push and badging need iOS 16.4 or later.

## View Transitions gotcha

`view-transition-name` must be unique across the live DOM. When the Phase 3
detail card is showing, the list must be **unmounted**, not hidden, or the
transition silently breaks.
