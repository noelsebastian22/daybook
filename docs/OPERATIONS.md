# Operations

Deploying, auth URLs, DNS and the asset pipeline. Split out of `README.md` so
that file can stay about the product.

**`BUILD-PLAN.md` §2 and §14 are the source of truth** for the Google OAuth
console, the DNS zone and the email setup. This file holds the parts you need in
hand while working, and points at those sections for the reasoning.

## Hosting

Vercel, with DNS on Cloudflare. The production host is
**`daybook.noel-sebastian.com`**. `daybook-bay.vercel.app` still resolves and is
on the auth allow list, but it is not the host anyone should be using.

Vercel's git integration deploys `master` on push with no manual step.
**"Merged but not deployed" is not a state this project has** — assume a push to
`master` is in production within a minute or two.

`vercel.json` carries four things, all load-bearing:

- the build command
- the output directory, `dist/daybook/browser` and not `dist/daybook`
- the SPA rewrite
- the cache headers

The cache headers matter more than they look. `ngsw.json`, `ngsw-worker.js` and
the manifest must stay uncached; hashed `chunk-`, `main-` and `styles-` files are
immutable for a year. Cache the service worker manifest and an installed PWA
will never take an update again.

### Cloudflare

Point Cloudflare at Vercel **DNS-only, grey cloud**. Do not proxy. Proxied,
Cloudflare terminates TLS itself, Vercel cannot complete its ACME challenge, and
the failure presents as an SSL error or a redirect loop rather than anything
naming the cause.

Two standing rules on this zone, both in `BUILD-PLAN.md` §14:

- **The apex is not ours to touch.** It runs a Zoho business mailbox and a
  portfolio. Records get added, never edited or deleted.
- **Do not enable Cloudflare Email Routing.** It is half-initialised and would
  put its own MX on the apex, breaking Zoho.

## Supabase auth URLs

The app is on Supabase project `daybook`, region ap-southeast-2 (Sydney). The
URL and publishable key live in `src/environments/environment.ts` and are
committed deliberately: every table is behind RLS, owner-only via
`auth.uid() = user_id`.

Authentication → URL Configuration currently holds:

| Setting | Value |
|---|---|
| Site URL | `https://daybook.noel-sebastian.com` |
| Redirect allow list | `https://daybook.noel-sebastian.com/**` |
| | `https://daybook-bay.vercel.app/**` |
| | `http://localhost:4200/**` |

Three things worth not relearning:

- **The `/**` wildcard is required.** `session.store.ts` passes
  `redirectTo: location.origin + '/today'` for both Google and the magic link,
  and Supabase silently rejects any `redirectTo` not on the list, bouncing you
  back to the login screen with no error shown.
- **The localhost entry is load-bearing.** Delete it and `ng serve` cannot sign
  in. A dev server on a port other than 4200 needs its own entry.
- **Deploying needs no Google console change.** Google's only redirect URI is
  the Supabase callback; it never returns to the app directly. Details and the
  reasoning are in `BUILD-PLAN.md` §2.

## Email

Outbound mail goes through Resend from `Daybook <digest@send.noel-sebastian.com>`,
on a verified sending subdomain kept deliberately separate from the apex so a
deliverability problem can never reach the business mailbox.

The digest and the push reminders are both sent by the `notify` Edge Function in
`supabase/functions/notify/`, scheduled with pg_cron. `due_digests()` and
`due_reminders()` decide who is due, in each user's own timezone.

**An Edge Function change is its own deploy.** It does not ride along with a
push to `master`.

## Theming

`src/styles.css` defines a palette (`ink-*`, `brand-*`, `done-*`…) that is the
same in both themes, and a layer of semantic tokens (`surface`, `text`,
`border`, `hover`…) defined once on `:root` and again under `.dark`. Call sites
use the semantic tokens, so almost nothing in the app knows which theme it is
in.

The choice is stored in `daybook.theme.v1` and applied by a small synchronous
script in `index.html` before first paint, which is what stops a dark install
flashing white on every cold load. The key deliberately carries no user id: a
device preference belongs to the screen, and two accounts sharing a laptop
should share it.

`tools/contrast-check.mjs` checks the token pairs against WCAG AA. Run it after
touching colour.

## Regenerating the icons

`public/icon.svg` is the source. After changing it:

```bash
node tools/build-icons.mjs
```

That rewrites `public/icons/*.png`, `favicon.ico` and the apple-touch-icon,
rendering through headless Chrome so the repo needs no native image toolchain.
The logo source art and the rejected directions are in `docs/reference/brand/`.

## Regenerating the screenshots

The images in `README.md` were taken against canned rows rather than a real
account, so no real task text ships in the repo. Nothing is signed in: the
`Supabase` service is swapped for a fake at bootstrap behind a `?harness` flag
in `src/main.ts`, every component, template, token and font stays real, and only
the data is invented. `?harness=guest` reports no session, which is the only way
to reach `/welcome` and `/login` in a browser that holds a real one.

**The scaffolding is not committed.** It is about 180 lines and lives only for
as long as it takes to shoot the images, because `main.ts` importing it pulls it
into the initial chunk. It has now been written twice, on 17 Sep and 19 Sep; if
it gets written a third time, reconsider that and find a way to keep it out of
the production graph instead.

## Preview deployments

**The preview URL is not usable for the checks it exists for.** The project has
`ssoProtection: { deploymentType: "all_except_custom_domains" }`, so a preview
host answers 302 to a Vercel login while the custom domain answers 200. Signing
into Vercel in mobile Safari to look at a preview is worse than the thing being
checked. **Anything that needs a real phone has to go to production.**
