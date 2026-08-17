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

Three stores, all `providedIn: 'root'`:

| Store | File | Owns |
|---|---|---|
| `SessionStore` | `core/session.store.ts` | Supabase session, user, auth actions |
| `TaskStore` | `core/task.store.ts` | tasks, categories, filter, rollover |
| `ToastStore` | `core/toast.store.ts` | transient messages and undo |

Rules:

- **Every mutation is optimistic.** Patch the store first, call Supabase
  after, roll the patch back and toast on failure. No spinners on writes.
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
- `SECURITY DEFINER` functions must `raise exception` on a null `auth.uid()`
  and be revoked from `anon` and `public`.
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

## Performance bar

Sub-100ms perceived latency on every interaction. That is an architecture
constraint (optimistic local writes), not a CSS one. If a change introduces a
round trip in front of a UI update, it is wrong.
