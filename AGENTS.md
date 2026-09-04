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
- **Templates live in a sibling `.html` file**, never inline. `task-row.ts`
  holds the class, `task-row.html` holds the markup, joined by
  `templateUrl: './task-row.html'`. Same for the one component with styles:
  `welcome.ts` / `welcome.css` via `styleUrl`.

  This retired a footgun rather than a preference. An inline `template:` is a
  template literal, so **a single backtick anywhere inside it — including in an
  HTML comment — closes it**, and the compiler then reports a dozen errors
  pointing at the decorator and the last line of the file rather than at the
  comment. It cost five builds across three sessions, twice in `shell.ts`
  alone. In a `.html` file there is no literal left to close, so write a class
  name in backticks in a comment if you like.

  A host-only directive with no markup needs no file — `swipe.ts` has none.

## State

Four stores and two services, all `providedIn: 'root'`:

| Store | File | Owns |
|---|---|---|
| `SessionStore` | `core/session.store.ts` | Supabase session, user, auth actions |
| `TaskStore` | `core/task.store.ts` | tasks, categories, filters, snapshots, rollover |
| `SettingsStore` | `core/settings.store.ts` | the `user_settings` row |
| `ToastStore` | `core/toast.store.ts` | transient messages and undo |
| `OfflineQueue` | `core/offline-queue.ts` | writes made with no connection |
| `Nav` | `core/nav.ts` | drawer collapsed, composer open |
| `Theme` | `core/theme.ts` | light / dark / system, and what that resolves to |

`Nav` and `Theme` hold chrome, not data, and are plain services rather than
stores because there is nothing to load or roll back. `Nav` exists because
three components that are nowhere near each other in the tree need the same two
booleans: the drawer collapses, `toasts.ts` has to move with it, and the
drawer's `Add task` button opens a composer that renders inside `Today`.

Both persist to `localStorage` under a key with **no uid** — `daybook.nav.v1`,
`daybook.theme.v1`. That is deliberate and it is the opposite of
`daybook.queue.v1.<uid>`. A device preference is a property of the screen and
two accounts sharing a laptop should share it; the offline queue holds one
account's pending writes, and leaking those across accounts was a real bug
(§9, C2). **Preference against data is the line.**

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

## Naming and file layout

- Files kebab-case: `task-row.ts`, `parse-capture.ts`
- Components are nouns without a suffix: `Today`, `Login`, `TaskRow`
- Stores end in `Store`, services do not carry a `Service` suffix

One subject, one basename, siblings in the same folder:

| Suffix | Holds |
|---|---|
| `.ts` | the class, and only the class |
| `.html` | the template |
| `.css` | component styles — there is exactly one, `welcome.css` |
| `.constants.ts` | tuning values, with the comment that explains them |
| `.data.ts` | static tables and lists |
| `.helpers.ts` | pure functions, no injection, no clock |
| `.spec.ts` | the tests |

**Do not create an empty `.css` per component.** This app is utility-first;
twenty empty stylesheets is cargo cult and the `anyComponentStyle` budget
exists partly to discourage it.

**No barrel files.** No `index.ts` re-exports — they defeat tree-shaking and
this app fights for every kilobyte. Import the module directly.

A constant that has a comment explaining *why* it is that value keeps the
comment when it moves. That comment is what stops the next person silently
"fixing" a deliberate number — `swipe.constants.ts` is the example to copy.

## Testing

`npx ng test --watch=false`. Vitest through `@angular/build:unit-test`, jsdom,
no browser.

`src/testing/` is the harness, and `harness.spec.ts` is its self-test — read
that first, and check it if the whole suite goes red at once.

- `test-providers.ts` is wired through `providersFile` in `angular.json` and is
  installed in **every** spec. It supplies `provideZonelessChangeDetection()`
  (without it, fixture creation throws and blames `NgZone`) and swaps
  `Supabase` for `FakeSupabase`, so **no spec can reach the network**.
- `fake-supabase.ts` — `onFrom`, `onRpc`, `emitAuth`, `chainFor`, `calls`,
  `ok()` / `fail()`. The query builder is chainable and absorbs methods it has
  not heard of, so adding an `.order()` does not break a spec that never cared.
- `fakes.ts` — row builders. Name only the field under test:
  `makeTask({ completed_at: null })`.
- `render.ts` — `await render(Component, { inputs, providers })`.

Rules that come from real failures here:

- **`await` every interaction.** The app is zoneless; nothing re-renders on its
  own. A click without an await reads the DOM as it was *before* the click, and
  the failure looks like the handler never ran.
- **Pin the clock whenever behaviour depends on `today()`.** It reads the wall
  clock. `parse-capture.spec.ts` used a `REF` frozen in Aug 2026, so anything
  compared against `today()` could never be equal — a real bug sat under that
  spec, unreachable. Use `vi.useFakeTimers()` + `vi.setSystemTime()`.
- **Check your test can fail.** The first replacement for that same bug still
  passed, because the real "today" was a Friday and the phrase said "friday".
  A test that passes either way is worse than no test.
- **Never assert on a Tailwind class string.** It pins spelling, not behaviour,
  and dark mode rewrote most of them. Assert on text, ARIA, state and calls.
- `src/testing/**` is excluded from `tsconfig.app.json`. It was briefly being
  compiled into the production bundle.

## Colour

**Write semantic tokens, not palette shades, for any surface, text or border.**
`bg-surface`, `bg-surface-sunken`, `bg-surface-raised`, `bg-hover`,
`text-text`, `text-text-muted`, `text-text-subtle`, `border-border`,
`text-on-brand`. They are defined twice in `src/styles.css` — once on `:root`,
once under `.dark` — and that is the whole of dark mode.

The raw ramps (`ink-*`, `brand-*`, `done-*`, `late-*`, `quick-*`, `deep-*`)
are **palette**. They mean nothing about placement and are identical in both
themes. Never redefine one per theme: half the app reads `brand-600` to mean
"the brand", and a brand that changes colour in the dark is a bug.

**`bg-white` is not a token and cannot flip.** It is a Tailwind built-in
resolving to `#fff`. There were 58 literal `white` call sites before dark mode
and migrating them was most of the work. The survivors are on `welcome` and
`login`, which sit on a deliberately dark backdrop in *both* themes.

The rule underneath all of it: **content is the brightest surface, chrome
recedes behind it, overlays separate from both.** How that is expressed
inverts with the theme, which is why it is a token and not a class:

- In **light**, the page is white, the drawer is `ink-50`, hovers **dim**, and
  overlays stay white and lean on their shadow.
- In **dark**, the page is near-black, the drawer is darker still, hovers
  **lighten**, and overlays are *lighter* than the page — a shadow does almost
  nothing on a dark ground, so elevation has to be carried by lightness.

Both are `bg-surface` / `bg-hover` / `bg-surface-raised` at the call site.

- A **task row's background must equal the page's and be opaque.** The row is
  the lid over the swipe action layer; anything translucent shows the "Done"
  and "Tomorrow" labels through every row at rest. `bg-surface` is opaque in
  both themes; keep it that way.
- The `100`-level tints (`done`, `late`, `quick`, `deep`, `brand-50`) are pale
  pastels that glare on a dark surface, so they have `*-tint` / `*-on-tint`
  token pairs that repoint to a dark wash with the text moving toward the 300
  step. Use the pair, not the raw shade.

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

## Spacing, radius and type

Declared in `@theme` in `src/styles.css`. Adapted from Doist's published
token package — the naming is theirs, the values are Daybook's. See
`BUILD-PLAN.md` §9 for why the library itself was not adopted.

**Spacing is 1, 2, 3, 4, 6, 8 and nothing else.** That is 4/8/12/16/24/32px,
which is both Tailwind's default scale and Doist's, so there are no aliases to
learn. No fractional steps — `py-0.5`, `gap-1.5`, `px-2.5` and `px-3.5` were
eighteen eyeballed values across the core surfaces and they are gone. The rule
governs padding, margin and gap; `h-` and `w-` are sizes, not spacing, and are
not bound by it.

The one exception is `0.5` (2px) to optically centre a control or icon against
a line of text — alignment, not spacing. There is exactly one, on the checkbox
in `task-row.ts`, and it is commented as such.

**The iOS safe area is `safe-py-*` / `safe-pb-*`, and it owns that axis.**
These are hand-written rules in `src/styles.css`, not Tailwind utilities, and
the step is baked into the name — `safe-py-6` means 24px *plus* the notch
inset, so there is no `py-6` beside it. Do not pair one with a `py-*` on the
same axis, and do not reintroduce a flat `safe-top`: unlayered CSS beats
Tailwind's `@layer utilities` regardless of specificity, so a bare
`padding-top: env(safe-area-inset-top)` silently zeroes the padding on every
browser without a notch while looking correct on the installed iPhone. That is
the same silent-failure family as `text-ink-800` and `rounded-lg`, and it had
flattened every header in the app against the top of the desktop viewport.

**Three radii exist**, named for what they sit on rather than by size:

| Token | Value | Used on |
|---|---|---|
| `rounded-control` | 6px | checkboxes, small buttons, chips |
| `rounded-card` | 12px | task rows, nav items, icon buttons |
| `rounded-panel` | 16px | composer, dialogs, page sections |

Plus `rounded-full` for pills. `rounded-lg`, `rounded-xl` and `rounded-2xl` are
no longer used anywhere and reaching for one is the same mistake as reaching
for `text-ink-800`. Decorative geometry is exempt and there are two pieces of
it: the chart bar caps in `reporting.ts` and the legend swatch in
`calendar.ts`, which is 12px square and would read as a circle at 6px.

**Seven type steps**, named for the job, not the size, and set in `rem` so the
app scales with the browser font size:

| Token | Value | Used on |
|---|---|---|
| `text-caption` | 12px | badges, meta rows, micro labels |
| `text-body` | 14px | default UI text |
| `text-task` | 15px | the task line — the app's primary content |
| `text-subtitle` | 16px | the capture box |
| `text-header` | 20px | the task-detail title |
| `text-display` | 24px | page titles |
| `text-display-lg` | 30px | login wordmark, reporting figures |

**The whole app is migrated.** `text-sm`, `text-xs`, `text-base`, `text-lg`,
`text-xl` and the arbitrary sizes are gone from every signed-in surface, and
reaching for one is the same mistake as reaching for `rounded-lg`.

Each step carries its own line height, so `leading-*` beside one of these is
usually a mistake. There is exactly one deliberate exception: the capture box
in `capture.ts` keeps `leading-6` because its mirror `div` and its `textarea`
must share an integer line box or the syntax highlight drifts off the text.
It is commented in place.

**`welcome.ts` is exempt, and it is the only file that is.** A marketing page
needs a register the app never uses; its hero runs 44px to 60px, its closer
30px to 36px, and its subhead 18px. Everything else on that page is on the
tokens. The exemption is written into the file's own header comment. Do not
extend it to a signed-in surface.

Do not add a new arbitrary text size — extend the scale instead.

**Three font weights**: `font-normal`, `font-medium`, `font-semibold`. Nothing
else, and in particular not `font-bold`. Doist's middle weight is 600 where
Daybook's `font-medium` is 500; whether to follow them is a question for the
visual pass, not a thing to change one call site at a time.

## Typeface

**No webfont, anywhere, deliberately.** `--font-sans` is a system stack. The
theme named Inter for months without ever loading it, so every screen ever
reviewed was already rendering in `system-ui`; the stack now says so on
purpose rather than by accident. A PWA that has to work offline should not have
a face that arrives over the network, and Todoist ships the same decision.

`'Segoe UI'` must stay ahead of `system-ui` in the stack. Under CJK locales on
Windows, `system-ui` resolves to Microsoft YaHei UI or Yu Gothic UI, whose
Latin glyphs are wider and heavier and which have no semibold.

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
