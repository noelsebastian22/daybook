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

### Turning on Google sign-in

The button is already wired. It stays inactive until the provider exists:

1. Google Cloud console → APIs & Services → Credentials → **Create OAuth
   client ID** → Web application.
2. Authorised redirect URI:
   `https://zzacswfongmzpnhcjiqp.supabase.co/auth/v1/callback`
3. Supabase dashboard → Authentication → Providers → **Google** → paste the
   client ID and secret, enable.
4. Authentication → URL Configuration → add `http://localhost:4200` and the
   production URL to the redirect allow list.

Until then the magic link works, and it is worth keeping afterwards as a
recovery path.

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
npm test           # unit tests (vitest)
```

## Where things are

```
src/app/
  core/            stores, Supabase client, guards, date and parsing helpers
  features/
    login/         Google + magic link
    today/         Today view, capture box, task row
  shared/          toasts
supabase/
  migrations/      numbered SQL, never edited once applied
```

**`BUILD-PLAN.md` is the single source of truth**: what the app is, the full
feature list with current state, the data model, rollover logic, every locked
decision and everything still to do.

`AGENTS.md` has the repo conventions. `docs/SESSIONS.md` is the chronological
log, written by the `session-handoff` skill in `.agents/skills/`.
