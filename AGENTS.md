# AGENTS.md

Conventions for this repo. Read this before changing anything.

**`BUILD-PLAN.md` is the single source of truth** for what Daybook is, what is
built, what is left and why every decision was made. If a change contradicts
something in there, update that file in the same commit or don't make the
change. Feature state is tracked there and nowhere else.

The Notion page is historical. Do not update it.

## Session log

Start every session with `/session-handoff start` and end it with
`/session-handoff`. `docs/SESSIONS.md` is the only shared memory between
agents, since none of them can see another's conversation.

The skill's canonical copy is `.agents/skills/session-handoff/SKILL.md`,
symlinked to `.claude/skills/session-handoff` so Claude Code auto-discovers it.
Claude Code only reads skills from `.claude/skills/`, never from `.agents/`, so
that symlink is load-bearing. Edit the `.agents/` copy.

## Stack

- Angular 22, standalone components, zoneless
- Signals for local state, NgRx SignalStore for shared state
- Supabase (Postgres, Auth, later Storage and Edge Functions)
- Tailwind v4, configured through `.postcssrc.json`, theme in `src/styles.css`
- PWA via `@angular/pwa`

## Hard rules

- **TypeScript everywhere. No `any`.** Supabase rows are typed against
  `src/app/core/models.ts`.
- **No `NgModule`.** Standalone only.
- **No `*ngIf` / `*ngFor`.** Built-in control flow (`@if`, `@for`, `@switch`).
- **No `zone.js`.** The app is zoneless. Anything that mutates state outside
  Angular must go through a signal.
- **Components are `ChangeDetectionStrategy.OnPush`** without exception.
- `input()` / `output()` functions, not the decorators.
- `inject()`, not constructor parameter injection.

## State

Four stores and one service, all `providedIn: 'root'`:

| Store | File | Owns |
|---|---|---|
| `SessionStore` | `core/session.store.ts` | Supabase session, user, auth actions |
| `TaskStore` | `core/task.store.ts` | tasks, categories, filters, snapshots, rollover |
| `SettingsStore` | `core/settings.store.ts` | the `user_settings` row |
| `ToastStore` | `core/toast.store.ts` | transient messages and undo |
| `OfflineQueue` | `core/offline-queue.ts` | writes made with no connection |

Rules:

- **Every mutation is optimistic.** Patch the store first, call Supabase
  after, roll the patch back and toast on failure. No spinners on writes.
- **A dropped connection is not a failure.** Route write errors through
  `isOffline()`: queue and keep the optimistic state, or roll back and toast.
  Never queue a rejection the server will keep making.
- **Every page calls `ensureLoaded()`, not `init()`.** Any page can be the
  first one mounted, including a deep link.
- **Undo toasts, never confirmation dialogs.**
- Components read from stores and call store methods. Components do not talk
  to Supabase directly.

## Dates

Use `core/dates.ts`. **Never call `toISOString()` to get a calendar date.**
It converts to UTC first, which in Sydney puts anything before 10am on the
previous day and silently corrupts rollover. `toLocalDate()` exists for this.

A "day" in this app is always a local `YYYY-MM-DD` string.

## Database

- Migrations live in `supabase/migrations/`, numbered, never edited once
  applied. Add a new file instead.
- **RLS on every table, always.** Owner-only via `auth.uid() = user_id`.
- `SECURITY DEFINER` functions called by a signed-in user must
  `raise exception` on a null `auth.uid()` and be revoked from `anon` and
  `public`.
- **Functions called by the cron instead of a person are the exception**, and
  are locked down the other way: `auth.uid()` is null by definition there, so
  they revoke execute from `anon`, `authenticated` **and** `public`, and grant
  it to `service_role` only. See `0003_digest_and_reminders.sql`. Do not add
  an `auth.uid()` guard to one of these — it would only break it.
- **There is no `status` column and there will not be one.** See
  `BUILD-PLAN.md`.

## Naming

- Files kebab-case: `task-row.ts`, `parse-capture.ts`
- Components are nouns without a suffix: `Today`, `Login`, `TaskRow`
- Stores end in `Store`, services do not carry a `Service` suffix

## Colour

Green and red are reserved. Green means completed, red means overdue or
badly avoided. Nothing else may use them, or they stop carrying meaning.
Everything else comes from the `ink` and `brand` scales in `src/styles.css`.

- **Only shades declared in `@theme` exist.** Writing `text-ink-800` emits no
  CSS and fails silently — the element just inherits. Eleven elements were
  doing exactly that before Phase 6. Check the scale before using a shade.
- **`ink-400` is the lightest colour allowed on text.** It is tuned to clear
  WCAG AA against `ink-50` (4.74:1), which is the harder of the two page
  backgrounds. `ink-300` is lighter and is for decoration only.
- **Never fade a whole element with `opacity` to mean "de-emphasised".** It
  takes the element's children down with it, including badge backgrounds, and
  no colour choice inside can recover the contrast. Change the text colour.

## Accessibility

- **One global `:focus-visible` ring**, in `@layer base` in `src/styles.css`.
  Do not add per-element focus rings. An element that genuinely needs its own
  uses `outline-none` plus its own ring, and being in `base` lets that win.
- Icon-only controls carry `aria-label`. Toggles carry `aria-pressed`.
- Anything decorative — a glyph, an illustration, a mirror div — is
  `aria-hidden`. An illustration that carries an argument gets `role="img"`
  and one `aria-label` that states the argument, not a label per shape.
- **Route changes are announced by `core/page-title.ts`**, which also sets the
  document title. New routes need a `title` in `app.routes.ts`; nothing else.

## Motion

- **Anything that reorders or removes a row goes through
  `withViewTransition()`** in `core/view-transition.ts`, not a keyframe. Rows
  carry `view-transition-name: task-{id}`, so the browser animates whatever
  moved. It handles the zoneless `tick()` and the reduced-motion opt-out.
- That name must be **unique across the live DOM**. A list showing the same
  task twice, or hidden rather than unmounted, silently kills the transition.
- The completion choreography is four beats and no more: the box fills, the
  tick pops, the strike draws, the row re-sorts. A completed row is **not**
  faded — see Colour.

## Performance bar

Sub-100ms perceived latency on every interaction. That is an architecture
constraint (optimistic local writes), not a CSS one. If a change introduces a
round trip in front of a UI update, it is wrong.
