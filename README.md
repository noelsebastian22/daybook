# Daybook

One page per day. Whatever you don't finish comes with you.

Angular 22 + Supabase, shipped as an installable PWA.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:4200 and sign in with the email link.

## Supabase

Project `daybook`, region ap-southeast-2 (Sydney).
URL and publishable key live in `src/environments/environment.ts`. The
publishable key is safe in the bundle: every table is behind RLS.

Migrations in `supabase/migrations/` are already applied to the live project.
They are here so the schema is reproducible, not because anything is pending.

### Auth

Google sign-in is live. Google Cloud project `daybook-505822`, consent screen
published to Production. Full configuration is recorded in `BUILD-PLAN.md` §2.

The magic link still works and is kept deliberately as a recovery path.

**Deploying to production** needs no Google console change. In the Supabase
dashboard only:

- Authentication → URL Configuration → set **Site URL** to
  `https://daybook-bay.vercel.app`
- Add `https://daybook-bay.vercel.app/**` to the **Redirect URLs** allow list
- Add `https://daybook-*.vercel.app/**` too, so preview deployments can sign in

Vercel appended `-bay` because `daybook.vercel.app` was already taken. The
production host is therefore `daybook-bay.vercel.app`, and the preview wildcard
happens to cover it as well.

The `/**` wildcard is required. `login.ts` passes
`redirectTo: location.origin + '/today'`, and Supabase silently rejects any
`redirectTo` not on the allow list, bouncing you back to the login screen with
no error shown.

## Hosting

Vercel, with DNS on Cloudflare. `vercel.json` sets the build command, the
output directory (`dist/daybook/browser`, not `dist/daybook`), the SPA rewrite
and the cache headers — `ngsw.json` and `ngsw-worker.js` must stay uncached or
the installed PWA will never take an update. Point Cloudflare at Vercel
**DNS-only, grey cloud**; do not proxy.

## Capture syntax

Typing into the box on the Today view:

| Token | Effect | Example |
|---|---|---|
| plain text | the task | `call the physio` |
| natural date | schedules it | `thursday`, `next monday`, `in 3 days` |
| date + time | schedules and sets a reminder | `thursday 2pm` |
| `#tag` | category, created if new | `#physio` |
| `!quick` / `!deep` | energy tag | `!quick` |

`call physio thursday 2pm #physio !quick` becomes a task called
"call physio", scheduled Thursday, reminder at 2pm, category physio, quick.

No date means today. Enter adds, Shift+Enter is a newline.

## How rollover works

On app open the client sends its **local** date to `rollover_and_snapshot`.
The function clamps that date to within a day of server time, writes a
`day_snapshots` row for every day since the last one, then moves every
incomplete past-dated task to today and adds the number of days it slipped to
`carried_over_count`.

It is idempotent. Running it twice on the same day does nothing.

## Scripts

```bash
npm start          # dev server
npm run build      # production build
npm test           # unit tests (vitest, jsdom, no browser)
```

## Where things are

```
src/
  app/
    core/          stores, Supabase client, guards, dates, capture parsing,
                   nav and theme services
    features/
      welcome/     marketing page, the only file exempt from the type scale
      login/       Google + magic link
      today/       Today view, capture box, task row, composer, task detail
      upcoming/    the next seven days
      calendar/    month grid and the day drill-in
      reporting/   charts
      settings/    timezone, digest, reminders
    shared/        shell, brand/logo, toasts, popover, date picker, swipe,
                   empty states, install hint, theme toggle
  testing/         spec harness: zoneless providers, a fake Supabase, row
                   builders. Excluded from the production compile.
  styles.css       the theme — palette, semantic tokens, both colour schemes
supabase/
  migrations/      numbered SQL, never edited once applied
docs/
  SESSIONS.md      chronological log, written by the session-handoff skill
  reference/       Todoist captures and the logo source art
tools/
  build-icons.mjs  rasterises public/icon.svg into the PNGs and favicon.ico
```

A component is a set of siblings sharing one basename: `task-row.ts` for the
class, `task-row.html` for the template, `task-row.spec.ts` for the tests, plus
`.constants.ts` / `.data.ts` / `.helpers.ts` where those exist. Templates are
never inline — see `AGENTS.md` for why that is a rule and not a preference.

## Theming

Light, dark and system, toggled from the top right. `src/styles.css` defines a
palette (`ink-*`, `brand-*`, `done-*`…) that is the same in both themes, and a
layer of semantic tokens (`surface`, `text`, `border`, `hover`…) defined once
on `:root` and again under `.dark`. Call sites use the semantic tokens, so
almost nothing in the app knows which theme it is in.

The choice is stored in `daybook.theme.v1` and applied by a small synchronous
script in `index.html` before first paint, which is what stops a dark install
flashing white on every cold load.

## Regenerating the icons

`public/icon.svg` is the source. After changing it:

```bash
node tools/build-icons.mjs
```

That rewrites `public/icons/*.png`, `favicon.ico` and the apple-touch-icon,
rendering through headless Chrome so the repo needs no native image toolchain.
The logo source art and the rejected directions are in `docs/reference/brand/`.

**`BUILD-PLAN.md` is the single source of truth**: what the app is, the full
feature list with current state, the data model, rollover logic, every locked
decision and everything still to do.

`AGENTS.md` has the repo conventions. `docs/SESSIONS.md` is the chronological
log, written by the `session-handoff` skill in `.agents/skills/`.
