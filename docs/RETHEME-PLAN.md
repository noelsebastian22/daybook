# Daybook retheme plan: Paper and coral

Status: **approved 17 Sep 2026, in progress on branch `retheme/paper`.** Phases 0, 1 and 2 done 17 Sep. Next: Phase 3.

This file plans one piece of work: moving Daybook from the navy and indigo look to the
"Paper and coral" theme, and rebuilding the welcome hero. `BUILD-PLAN.md` stays the source of
truth for what Daybook is. Phase 0 below links this file from there and records the decisions
it reverses, so the two cannot drift. When the last phase ships, this file is frozen and the
outcome is summarised in `BUILD-PLAN.md` §9.

Design reference: the "Daybook welcome hero" design canvas (desktop, mobile, colour options).

---

## 1. What is decided

| Decision | Choice |
|---|---|
| Direction | Paper and biro: warm paper surfaces, ink text, handwritten marks |
| Brand colour | Coral `#EC7F72`, used for the icon and primary action fills |
| Second colour | Blue-black "pen" `#27356B`, used for links, checkboxes, stamps, focus |
| Scope | Full retheme of the signed-in app, both themes, not an accent swap |
| Display face | Fraunces on welcome, login and app page titles. UI text stays on the system stack |
| Hero | Live try-it page running the real `parse-capture`. Nothing is saved. CTA "Start today's page" |
| Copy | UX-writing pass, sentence case, no em dashes in anything a user reads |

Decisions this reverses, all of which get recorded in Phase 0:

1. `BUILD-PLAN.md` §5.4 "The brand is `#6366f1`".
2. `BUILD-PLAN.md` §9 and `AGENTS.md` Typeface: "No webfont, anywhere, deliberately."
3. `AGENTS.md` Colour: welcome and login "sit on a deliberately dark backdrop in both themes".
   They become paper in light and a night desk in dark, and follow the theme like every other page.
4. `--color-on-brand` "white in both themes". Coral cannot carry white text (2.68:1), so
   `on-brand` becomes dark ink and the status fills get their own token.

---

## 2. Rules for the work

These are the existing repo rules, restated for this job so every phase is held to them.

- **Tokens first.** The theme is decided in `src/styles.css` and nowhere else. No `dark:` variants,
  no new literal hexes in templates, no new arbitrary sizes. If a call site needs a colour that
  has no token, add the token.
- **Palette is identical in both themes. Only semantic tokens move.** Unchanged from today.
- **Green means done, red means overdue.** Coral is a neighbour of red, so coral is never used
  for text, borders, badges or anything that signals state. It is a fill for the icon and for
  primary actions only. Overdue red moves toward crimson to widen the gap (§3.1).
- **Contrast is measured, not eyeballed.** Every text pair in §3.3 has a number. Phase 1 adds
  `tools/contrast-check.mjs` so the numbers are re-run whenever a token changes.
- **Spacing 1, 2, 3, 4, 6, 8. Three radii. Seven type steps. Three weights.** The retheme changes
  colour and one typeface. It does not touch these scales.
- **One phase, one branch, one reviewable set of commits.** Work happens on `retheme/paper`.
  Each phase ends with `npx ng test --watch=false` green and `npm run build` inside budget.
- **Specs assert on text, ARIA, state and calls.** Copy changes will break some specs on purpose.
  Update the expected strings in the same commit as the copy.
- **Every session starts with `/session-handoff start` and ends with `/session-handoff`.**

---

## 3. Token design

### 3.1 Palette (same in both themes)

`ink-*` keeps its name, which now suits the theme, and its values warm up. `brand-*` keeps its
name and becomes coral, so "brand-600 means the brand" stays true. `pen-*` is new.

| Token | Now | New | Note |
|---|---|---|---|
| `ink-50` | `#f6f7fb` | `#F6EEDC` | the desk |
| `ink-100` | `#eceef6` | `#F1EADA` | |
| `ink-200` | `#d6dae9` | `#E4DAC3` | paper edge, hairlines |
| `ink-300` | `#8a90ab` | `#A79E8B` | decoration only |
| `ink-400` | `#676d8b` | `#6B6353` | lightest text colour, 5.14:1 on `ink-50` |
| `ink-500` | `#5c6280` | `#5E5748` | |
| `ink-600` | `#4a5070` | `#4A4438` | |
| `ink-700` | `#363b55` | `#352F26` | |
| `ink-900` | `#171a2b` | `#1F1B16` | |
| `brand-50` | `#eef2ff` | `#FDEDEA` | |
| `brand-100` | `#e0e7ff` | `#FBCFC8` | blush, the headline highlight |
| `brand-500` | `#6366f1` | `#EC7F72` | the brand |
| `brand-600` | `#4f46e5` | `#E36F61` | primary fill hover |
| `brand-700` | `#4338ca` | `#C25B4F` | pressed, button edge |
| `pen-50` | new | `#EEF0F8` | |
| `pen-100` | new | `#E4E8F6` | |
| `pen-300` | new | `#AAB6EE` | pen text in dark |
| `pen-500` | new | `#3B4A8C` | focus ring |
| `pen-600` | new | `#27356B` | the pen |
| `pen-700` | new | `#1B2650` | |
| `late-100` | `#fee2e2` | `#FDE3E8` | |
| `late-500` | `#ef4444` | `#D92D4A` | crimson, pulled away from coral |
| `late-700` | `#b91c1c` | `#A3122F` | |
| `done-*`, `quick-*`, `deep-*` | unchanged | unchanged | see open decision D2 |

Primary fills move from `bg-brand-600` to `bg-brand-500` with `hover:bg-brand-600`, because the
brand step is 500 and the hover has to get darker, not lighter.

### 3.2 Semantic tokens

| Token | Light | Dark | Change |
|---|---|---|---|
| `surface` | `#FFFDF7` | `#1E1B15` | paper sheet |
| `surface-sunken` | `#F6EEDC` | `#161410` | the desk, the drawer |
| `surface-raised` | `#FFFFFF` | `#27231C` | overlays |
| `hover` | `#F8F2E4` | `#2A261E` | |
| `hover-strong` | `#F1EADA` | `#332E25` | |
| `fill` | `#F1EADA` | `#302B22` | |
| `fill-strong` | `#E4DAC3` | `#433C30` | |
| `border-soft` | `#EFE7D6` | `#2C2820` | |
| `border` | `#E4DAC3b3` | `#383227` | |
| `border-strong` | `#E4DAC3` | `#4A4234` | |
| `text` | `#1F1B16` | `#F3ECDD` | |
| `text-muted` | `#4A4438` | `#CFC6B3` | |
| `text-subtle` | `#6B6353` | `#A79E8B` | |
| `text-disabled` | `#D9CFBA` | `#5A5243` | |
| `inverse` / `inverse-hover` / `on-inverse` | `#1F1B16` / `#4A4438` / `#FFFDF7` | `#F3ECDD` / `#FFFFFF` / `#1E1B15` | |
| `on-inverse-accent` | `#FBCFC8` | `#A8443A` | the Undo in a toast |
| `on-brand` | `#2B1310` | `#2B1310` | **was white.** Same in both themes because the fill does not move |
| `on-status` | `#FFFFFF` | `#FFFFFF` | **new.** Text on a `done` or `late` fill |
| `brand-tint` / `brand-tint-strong` | `#FDEDEA` / `#FBCFC8` | `#3A211D` / `#4A2A25` | selection and active states |
| `on-brand-tint` | `#1F1B16` | `#F8D9D3` | ink, not coral |
| `pen-text` / `pen-text-hover` | `#27356B` / `#3B4A8C` | `#AAB6EE` / `#C7D0F5` | **new.** Replaces `brand-text` |
| `pen-tint` / `pen-tint-strong` | `#EEF0F8` / `#E4E8F6` | `#232A47` / `#2D3660` | **new.** Parsed date tokens, info chips |
| `on-pen-tint` | `#27356B` | `#C7D0F5` | **new** |
| `brand-text`, `brand-text-hover` | | | **retired** after Phase 2. Coral is never text |
| `done-*`, `quick-*`, `deep-*` pairs | unchanged | unchanged | |
| `late-text` / `late-tint` / `on-late-tint` | `#A3122F` / `#FDE3E8` / `#A3122F` | `#FB7185` / `#3A1A22` / `#FDA4B4` | follows the crimson move |

Also in `styles.css`: the focus ring becomes `pen-500` in light and `pen-300` in dark (it is
currently one colour for both, which worked only because welcome and login were always dark).
The heat map stays green and is re-checked against the new surfaces.

### 3.3 Measured contrast for the proposed values

| Pair | Ratio |
|---|---|
| `text` on `surface` | 16.83 |
| `text-muted` on `surface-sunken` | 8.36 |
| `text-subtle` on `surface-sunken` (the hard one) | 5.14 |
| `on-brand` ink on `brand-500` coral | 6.52 |
| `on-brand` ink on `brand-600` hover | 5.58 |
| white on `brand-500`, for the record | 2.68, fails, which is why `on-brand` flips |
| `brand-700` coral as text on `surface`, for the record | 4.21, fails, which is why coral is never text |
| `pen-text` on `surface` / on `surface-sunken` | 11.42 / 10.06 |
| `on-pen-tint` on `pen-tint-strong` | 9.50 |
| focus ring `pen-500` on `surface` / `surface-sunken` | 8.11 / 7.15 |
| `late-text` on `surface` | 7.69 |
| `on-status` white on `late-700` | 7.82 |
| `done-text` on `surface` | 5.39 |
| `on-quick-tint` on `quick-tint` | 4.51, passes with no margin, watch it |
| Dark: `text` / `text-muted` / `text-subtle` on `surface` | 14.60 / 10.13 / 6.47 |
| Dark: `text-subtle` on `surface-raised` | 5.89 |
| Dark: `pen-text` on `surface` | 8.70 |
| Dark: `late-text` on `surface` | 6.38 |

---

## 4. What the audit found

The app is in good shape for this. Almost every surface, text and border already goes through
a semantic token, so most of the retheme is one file.

| Thing | Count | Where |
|---|---|---|
| `brand-*` utility call sites | about 70 | 20 files, listed by the grep in Phase 2 |
| of which `text-brand-text` (becomes `pen-text`) | about 27 | capture, shell, today, task-detail, upcoming, reporting, day-detail, date-picker, calendar, settings, theme-toggle, task-row |
| of which `bg-brand-600` primary fills | 9 | shell, today, capture, upcoming, day-detail, date-picker, settings x2, `app.ts` spinner |
| `text-on-brand` on a **status** fill (must become `on-status`) | 3 | `task-row.html:62`, `task-detail.html:32`, `toasts.html:27` plus its two `/60` and `/10` variants |
| focus and selection rings `ring-brand-500`, `outline-brand-500`, `border-brand-500` | 9 | settings, date-picker, calendar, capture, today, task-row, task-detail, login |
| direct `ink-*` call sites | 6 | mostly welcome and login |
| `bg-white` / `text-white` in the signed-in app | 0 | already migrated |
| literal hexes outside `styles.css` | 9 files | `index.html`, `core/theme.ts`, `welcome.css`, `login.html` (Google logo, leave), `brand/logo.html`, `brand/logo.ts`, `empty-state.html`, `public/icon.svg`, `public/manifest.webmanifest`, `supabase/functions/notify/index.ts` |
| em dashes in rendered template text | 12 files to check | many are inside HTML comments and are fine. The digest subject `Daybook — ${subject}` in `notify/index.ts:133` is real |

Classification rule for the `brand-*` sites, applied one by one in Phase 2:

- A **fill that is the primary action or the selected thing** stays brand: `bg-brand-500`,
  `hover:bg-brand-600`, `text-on-brand`.
- **Text, icons, links, checkbox borders and focus rings** become pen.
- **A wash behind an active nav item or a selected day** is `brand-tint` with `on-brand-tint` ink text.
- **A wash behind parsed input** (the date token in the capture box) is `pen-tint`.

---

## 5. Phases

### Phase 0. Record the decisions (done 17 Sep)
No code.
- Create branch `retheme/paper`.
- `BUILD-PLAN.md`: add a pointer to this file under §4, rewrite §5.4 UI direction, add a §9 entry
  "The paper retheme, 17 Sep" covering the four reversals in §1 and why.
- `AGENTS.md`: update **Colour** (coral is fill only, pen is text, `on-brand` is ink,
  `on-status` exists, welcome and login follow the theme) and **Typeface** (one self-hosted
  display face, where it may be used, UI text stays system).
- Done when: both files read correctly on their own to an agent who has not seen this chat.

### Phase 1. Tokens (done 17 Sep)
Landed as planned, with two additions: the three status-fill call sites moved to `text-on-status` here rather than in Phase 2, because `on-brand` could not flip safely without them, and a `--color-focus` token carries the per-theme focus ring. 680 tests pass, initial bundle 438.94 kB, `tools/contrast-check.mjs` passes with one reported known gap (D5).
Files: `src/styles.css`, new `tools/contrast-check.mjs`.
- Replace the palette values and both semantic columns per §3. Add `pen-*`, `on-status`, the
  `pen-*` semantic set. Keep `brand-text` temporarily, pointed at the pen values, so nothing
  breaks between Phase 1 and Phase 2.
- Split the focus ring per theme.
- Re-tune the heat ramp alphas against `#FFFDF7` and `#1E1B15` and re-measure the day number on the top step.
- Rewrite the comments that explain values. A comment that explains a number moves with the number.
- `tools/contrast-check.mjs`: reads the two token blocks, checks the pairs in §3.3, exits non-zero under 4.5:1 (3:1 for the focus ring).
- Done when: the app runs, both themes are warm, nothing is unreadable, the script passes, tests are green. It will look half finished. That is expected.

### Phase 2. Call sites (done 17 Sep)
Applied per the audit table in §9. Departures from the plan as written: the toasts sites had already moved in Phase 1; rings went to the `focus` token rather than literal `pen-500`; the settings toggle knob got a dedicated `--color-knob` (white in both themes) because `on-brand` went ink; welcome and login poster decoration is deferred to Phases 5 and 6, so the done-gate grep is amended in §9. D3 decided for `brand-tint` (§8). 680 tests, build 439.19 kB, contrast check passes bar the known D5 gap.
Files: the 20 templates from the audit.
- Build the audit table first (file, line, current class, new class, rule applied) as a section
  at the bottom of this file, then apply it. Mechanical, but reviewed line by line.
- `text-brand-text` to `text-pen-text`. `bg-brand-600` to `bg-brand-500 hover:bg-brand-600`.
  Rings and checkbox borders to `pen-500`. The three status sites to `text-on-status`.
- `toasts.html` `text-brand-100` becomes `text-on-inverse-accent`, which is what it always meant.
- Remove `brand-text` and `brand-text-hover` from `styles.css` once nothing reads them.
- Done when: `grep -rE "brand-text|text-brand-[0-9]" src/app` returns nothing, the primary
  buttons read as coral with ink labels in both themes, completed checkboxes still show a white tick on green.

### Phase 3. Brand assets and the hexes outside the stylesheet
- `public/icon.svg`: flat coral `#EC7F72` field (drop the indigo gradient), marks in `#FFFDF7`. Run `node tools/build-icons.mjs`.
- `shared/brand/logo.html` and `logo.ts`: coral tile, wordmark tones from the new ink values. Add the Fraunces wordmark in Phase 4.
- `public/manifest.webmanifest`: `theme_color` and `background_color` to `#F6EEDC`.
- `src/index.html` and `core/theme.ts`: `theme-color` is `#F6EEDC` in light and `#161410` in dark, in both the meta tag and the inline pre-paint script. They must agree or a dark install flashes.
- `shared/empty-state.html`: replace `#6366f1` with the pen token, keep green for the done scene.
- `supabase/functions/notify/index.ts`: digest email hexes to the new ink and crimson values,
  subject line loses its em dash. **This is a deploy of an edge function, so it is its own commit
  and its own deploy step**, not bundled with the front end.
- Done when: a fresh install shows the coral icon and a cream status bar, and a dark install does not flash.
  Note: installed PWAs refresh their icon slowly or never. Expect to reinstall to see it on iOS.

### Phase 4. Typeface
- Self-host one variable file: Fraunces, Latin subset, `wght` 400 to 700 and the `opsz` axis, as
  `public/fonts/fraunces-var.woff2`. Target 40 kB or less. No Google Fonts request at runtime.
- `styles.css`: `@font-face` with `font-display: swap`, and `--font-display: 'Fraunces', ui-serif, 'New York', Georgia, serif`.
  The fallback stack matters: until the file arrives, and if it never does, headings render in the system serif.
- `ngsw-config.json`: fonts move from the lazy `assets` group to a prefetch group so the face is there offline after first load.
- `<link rel="preload">` for the font in `index.html` only if the welcome LCP measurably needs it. Measure first.
- Apply `font-display` to: welcome headings, the login lockup line, `text-display` page titles, `text-display-lg` figures in reporting, the date header on Today. Nowhere else.
- Weights stay at the three the app allows. Fraunces at `font-semibold` for headings.
- Handwriting (Caveat) is open decision D1. Default if not decided: subset to the glyphs of the two notes, welcome only, loaded lazily.
- Done when: initial bundle budget still passes, the font is in the service worker cache after one visit, and with the font blocked in devtools the pages still look deliberate.

### Phase 5. Welcome page
Files: `features/welcome/*`, new `features/welcome/try-page.ts`, `try-page.html`, `try-page.helpers.ts`, specs.
- Structure: header, hero (copy left, the try-it page right), three value props, the three mechanics
  sections restyled on paper, closer, footer. The always-dark poster is gone.
- `TryPage` component: OnPush, signals for tasks, draft, day offset. Uses the real `parseCapture`
  from `core/parse-capture.ts` so the hero can never disagree with the app. No Supabase, no stores, nothing persisted.
  - Tick and untick. Add with Enter. A task dated for another day answers "Saved to Friday's page" and is not shown, which is what the app does.
  - "Flip to tomorrow": ticked tasks drop off, the rest arrive with `carried ×N`. Goes through `withViewTransition()`, not a keyframe, and honours reduced motion.
  - Six rows maximum, with the "That page is full" message.
  - Real `<button>`, `<form>`, `<label>`, `aria-pressed` on ticks, `aria-live="polite"` on the message line.
- The live date and "page 260 of 365" use `core/dates.ts`. Never `toISOString()`.
- `welcome.css` holds only what utilities cannot do (ruled lines, the stamp tilt, the sheet stack). Watch the 4 kB `anyComponentStyle` warning. If it trips, the try-page styles move with the try-page component. That would be the second component stylesheet in the app and needs a line in `AGENTS.md`.
- The type-scale exemption for this page stays, with the new sizes written into the header comment.
- Copy is in §7. Specs get the new strings.
- Done when: keyboard-only and VoiceOver passes through the try-it page, Lighthouse performance is no worse than today, works at 360 px wide, both themes.

### Phase 6. Login page
- Paper backdrop, the same sheet as a card, lockup in Fraunces, coral is not used here except the icon (the primary action is Google's own button, and "Send link" stays `inverse`).
- Copy per §7.
- Done when: arriving from the hero reads as one product in both themes.

### Phase 7. Signed-in polish
Small, deliberate touches that make the app feel like the same paper, without redesigning layouts:
- Today's header becomes the page header: weekday in Fraunces, date beside it.
- The carried badge takes the stamp style (pen outline, slight tilt) at `text-caption`. Tilt is decoration, the count stays readable, and the overdue red version keeps its red.
- Check every screen in both themes: shell, today, composer, task detail, upcoming, calendar and heat map, reporting charts, settings, toasts, popover, date picker, install hint, empty states.
- Re-check `quick` and `deep` tints against the new surfaces (open decision D2).
- Done when: a side by side of every screen, light and dark, has been looked at by Noel.

### Phase 8. QA and ship
- `npx ng test --watch=false`, `npm run build` inside budgets, `node tools/contrast-check.mjs`.
- Real iPhone installed-PWA check: status bar colour, safe areas, no white flash, offline load with the font.
- Deploy the front end. Deploy `notify` separately and send a test digest.
- `/session-handoff`, then freeze this file and summarise in `BUILD-PLAN.md` §9.

Suggested order of sittings, given evenings and weekends: Phases 0 and 1 together, 2 alone,
3 and 4 together, 5 over two sittings, 6 and 7 together, 8 alone.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| `on-brand` flipping to ink silently puts dark text on a green or red fill somewhere | Phase 2 audits every `on-brand` site before the token flips. `on-status` lands first |
| Coral read as "overdue" | Coral is fill only, never text or badge. Red moves to crimson. Checked on the Today list with overdue tasks present |
| Webfont hurts first paint or offline | Self-hosted, swap, prefetched by the service worker, system serif fallback designed in, budget of 40 kB |
| Two warm tints (blush and amber `quick`) or two cool tints (pen and violet `deep`) look alike | Open decision D2, judged on real screens in Phase 7 |
| Installed PWAs keep the old indigo icon | Known platform behaviour. Documented, reinstall to refresh |
| The digest email drifts from the app | Its hexes are updated in Phase 3 and listed in `AGENTS.md` as a place colours live |

---

## 7. Copy deck

Rules: sentence case, contractions, verbs on buttons, say the specific thing, no em dashes, no
uppercase tracked eyebrow labels.

**Welcome hero**
- Date line: `{Thursday 17 September} · page {260} of {365}`
- Headline: One page a day. Leftovers included.
- Supporting: Whatever you don't tick off turns up on tomorrow's page, with a count of how many times it's tagged along. Call physio, carried ×4. You'll get to it.
- Primary button: Start today's page
- Secondary link: See how it works
- Under the button: Free. Sign in with Google or an email link. No password to forget.

**Try-it page**
- Field label: Add something. Type it the way you'd say it.
- Placeholder: water the plants 5pm #home
- Hint before first flip: Leave one unticked, then turn the page.
- Button: Flip to tomorrow. After a flip: Back to today
- Messages: Type a task first. / Give it a name as well. / Saved to Friday's page. It will be waiting there. / That page is full. Tick something off first.
- Empty page: Clean page. Nothing came with you.
- Handwritten notes: third day running / see? it came with you

**Value props**
- Type it like you'd say it. "Call physio thursday 2pm" sets the day and the reminder in one line.
- Leftovers move themselves. No dragging things forward at 11pm. Open the app and they're already on today's page.
- A note every morning. What you finished, what came with you, and what today holds. At the hour you pick.

**Mechanics sections** (headings stay, labels lose the uppercase eyebrow)
- "What slipped, and what you moved" body becomes: Daybook counts two things separately. Tasks it carried over because you didn't get to them, and tasks you pushed to another day yourself. The first is drift. The second is you deciding, four times, that today isn't the day.
- Digest mock subject: Daybook: 3 on today

**Closer**
- Heading: Start with one page.
- Body: Tomorrow's writes itself out of whatever today still has on it.
- Button: Start today's page

**Login**
- Under the lockup: Today's page is waiting.
- Email label: Or get a sign-in link by email
- Sent state: Link sent to {email}. Open it on this device to finish signing in. (unchanged)
- Footer link: What is Daybook? (unchanged)

**Digest email subject**: `Daybook: {subject}`

---

## 8. Open decisions

- **D1. Handwriting.** Keep Caveat for the two notes on the welcome page (a second, tiny font file), or draw the two notes as inline SVG and ship no second font. Default: subset Caveat, welcome only.
- **D2. `quick` and `deep`.** Keep amber and violet, or turn the energy tags into neutral chips with a small icon so the app has fewer hues. Decide on real screens in Phase 7.
- **D3. Active nav item.** ~~Blush `brand-tint` wash, or plain `fill` with ink text. Decide in Phase 2 by looking at both.~~ **Decided 17 Sep, Phase 2: blush `brand-tint` + `on-brand-tint`.** Both were rendered side by side against the live tokens in both themes. `fill` lost on function, not taste: it is the same value as `hover-strong` in light (`#F1EADA`) and 3 steps from it in dark, so a `fill` active item is indistinguishable from a hovered inactive one. The blush wash reads clearly as "you are here" in both themes and is the one quiet echo of the brand in the chrome.
- **D4. Final crimson.** `#D92D4A` and `#A3122F` are proposed. Confirm on the Today list next to a coral Add button.
- **D5. The tick on a completed checkbox.** Found by `tools/contrast-check.mjs` on its first run: white on `done-500` (`#10b981`) is 2.54:1, under the 3:1 floor for a meaningful glyph. It was the same before the retheme. Closing it means darkening the reserved green to about `#0E9F6E` (3.4:1), which also moves the heat map and the charts. Listed as a known gap in the script, reported every run, not fatal.

---

## 9. Phase 2 audit table (built and applied 17 Sep 2026)

Every `brand-*` call site in `src/app` outside specs, from
`grep -rnE 'brand-[a-z0-9/-]+' src/app --include='*.html' --include='*.ts'`.
`toasts.html` is absent because Phase 1 already moved its three sites to `on-status` /
`on-inverse-accent`. Comment-only mentions (`settings.store.ts:91`, `welcome.ts:14`,
`logo.ts:13`) are ignored.

Rules applied, from §4:

- **fill** — a primary-action or selected fill stays brand; the step moves `600 → 500`
  with `hover:600`, because the brand step is 500 and hover must darken.
- **pen** — anything read (text, icons, links) becomes `pen-text` / `pen-text-hover`.
- **focus** — a hand-rolled focus ring becomes `ring-focus` / `outline-focus`, the
  per-theme token (pen-500 light, pen-300 dark). The plan's shorthand "rings to pen-500"
  predates the `--color-focus` split; the token is what it meant.
- **pen ring / pen border** — a non-focus ring or border that must stay visible in both
  themes uses `pen-text` (pen-600 light, pen-300 dark); a hover-only affordance may use
  raw `pen-500`, which is dim in dark but is only a hover.
- **tint** — a wash behind the active or selected thing is `brand-tint` +
  `on-brand-tint` (D3 still open); a wash behind parsed input or an info chip is
  `pen-tint` + `on-pen-tint`.
- **defer** — welcome is rebuilt in Phase 5, login's dark-poster decoration in Phase 6,
  illustrations and the logo in Phase 3. Not touched here.

| File:line | Current | New | Rule |
|---|---|---|---|
| `app.ts:16` | `border-t-brand-600` | `border-t-brand-500` | fill (spinner accent) |
| `shared/shell.html:123` | `text-brand-text hover:bg-brand-tint` | `text-pen-text hover:bg-brand-tint` | pen; blush hover kept — it previews the coral action, revisit with D3 |
| `shared/shell.html:127` | `bg-brand-600 text-on-brand` | `bg-brand-500 text-on-brand` | fill (Add-task plus badge) |
| `shared/shell.html:151` | `routerLinkActive="bg-brand-tint text-brand-text"` | `routerLinkActive="bg-brand-tint text-on-brand-tint"` | tint, active nav. D3: `brand-tint` won, see §8 |
| `shared/shell.html:176` | same | same as 151 | tint |
| `shared/date-picker.ts:91` | `bg-brand-600 font-semibold text-on-brand` | `bg-brand-500 font-semibold text-on-brand` | fill (selected day) |
| `shared/date-picker.ts:92` | `font-semibold text-brand-text hover:bg-brand-tint` | `font-semibold text-pen-text hover:bg-pen-tint` | pen (today is info, not the selection) |
| `shared/date-picker.html:22` | `'font-semibold text-brand-text'` | `'font-semibold text-pen-text'` | pen (selected shortcut) |
| `shared/date-picker.html:91` | `focus:ring-brand-500` | `focus:ring-focus` | focus |
| `shared/theme-toggle.html:47` | `'font-semibold text-brand-text'` | `'font-semibold text-pen-text'` | pen (selected option) |
| `today/capture.html:2` | `focus-within:ring-brand-500` | `focus-within:ring-focus` | focus |
| `today/capture.html:18` | `bg-brand-tint-strong text-brand-text` | `bg-pen-tint-strong text-on-pen-tint` | tint (parsed input, the mirror highlight) |
| `today/capture.html:60` | `bg-brand-tint text-brand-text hover:bg-brand-tint-strong` | `bg-pen-tint text-on-pen-tint hover:bg-pen-tint-strong` | tint (parsed chip) |
| `today/capture.html:81` | `bg-brand-tint … text-brand-text` | `bg-pen-tint … text-on-pen-tint` | tint (reminder chip) |
| `today/capture.html:93` | `text-brand-text/60 hover:text-brand-text` | `text-on-pen-tint/60 hover:text-on-pen-tint` | tint (the × inside the pen chip) |
| `today/capture.html:160` | `'font-semibold text-brand-text'` | `'font-semibold text-pen-text'` | pen (selected category) |
| `today/capture.html:228` | `'font-semibold text-brand-text'` | `'font-semibold text-pen-text'` | pen (selected energy) |
| `today/capture.html:253` | `bg-brand-600 … text-on-brand hover:bg-brand-700` | `bg-brand-500 … text-on-brand hover:bg-brand-600` | fill (Save button) |
| `today/today.html:95` | `text-brand-text hover:text-brand-text-hover focus-visible:outline-brand-500` | `text-pen-text hover:text-pen-text-hover focus-visible:outline-focus` | pen + focus |
| `today/today.html:121` | `hover:text-brand-text` | `hover:text-pen-text` | pen (Add-task row) |
| `today/today.html:125` | `text-brand-text group-hover:bg-brand-600 group-hover:text-on-brand` | `text-pen-text group-hover:bg-brand-500 group-hover:text-on-brand` | pen at rest, fill on hover |
| `today/task-row.html:36` | `armed ? 'text-brand-text' : 'text-brand-500/60'` | `armed ? 'text-pen-text' : 'text-pen-text/60'` | pen (swipe push label; coral read as state here, exactly what §2 forbids) |
| `today/task-row.html:63` | `hover:border-brand-500` | `hover:border-pen-500` | pen border, hover-only (checkbox) |
| `today/task-detail.html:33` | `hover:border-brand-500` | `hover:border-pen-500` | pen border, hover-only (checkbox) |
| `today/task-detail.html:64` | `bg-brand-tint … text-brand-text` | `bg-pen-tint … text-on-pen-tint` | tint (day chip is an info chip) |
| `today/task-detail.html:69` | `bg-brand-tint … text-brand-text` | `bg-pen-tint … text-on-pen-tint` | tint (reminder chip) |
| `today/task-detail.html:157` | `text-brand-text` | `text-pen-text` | pen (back link) |
| `upcoming/upcoming.html:63` | `hover:text-brand-text` | `hover:text-pen-text` | pen (Add-task row) |
| `upcoming/upcoming.html:68` | `text-brand-text group-hover:bg-brand-600 group-hover:text-on-brand` | `text-pen-text group-hover:bg-brand-500 group-hover:text-on-brand` | pen at rest, fill on hover |
| `calendar/calendar.html:47` | `hover:ring-brand-500` | `hover:ring-pen-text` | pen ring (day-cell hover, must show in dark) |
| `calendar/calendar.ts:113` | `'text-brand-text ring-2 ring-brand-500'` | `'text-pen-text ring-2 ring-pen-text'` | pen ring (today marker is info, not selection) |
| `calendar/day-detail.html:86` | `hover:text-brand-text` | `hover:text-pen-text` | pen (Add-task row) |
| `calendar/day-detail.html:90` | `text-brand-text group-hover:bg-brand-600 group-hover:text-on-brand` | `text-pen-text group-hover:bg-brand-500 group-hover:text-on-brand` | pen at rest, fill on hover |
| `reporting/reporting.html:116` | `hover:text-brand-text` | `hover:text-pen-text` | pen (category link) |
| `reporting/reporting.html:146` | `hover:text-brand-text` | `hover:text-pen-text` | pen (category link) |
| `settings/settings.html:19` | `before:bg-on-brand … checked:bg-brand-600` | `before:bg-on-status … checked:bg-brand-500` | fill; knob must stay **white in both themes** — `on-brand` is now ink and an ink knob vanishes on the dark unchecked track. `on-status` is the one white-in-both token; see note below |
| `settings/settings.html:30` | `focus:ring-brand-500` | `focus:ring-focus` | focus |
| `settings/settings.html:54` | `focus:ring-brand-500` | `focus:ring-focus` | focus |
| `settings/settings.html:66` | `text-brand-text hover:text-brand-text-hover` | `text-pen-text hover:text-pen-text-hover` | pen |
| `settings/settings.html:90` | `before:bg-on-brand … checked:bg-brand-600` | `before:bg-on-status … checked:bg-brand-500` | fill, as line 19 |
| `settings/settings.html:119` | `focus:ring-brand-500` | `focus:ring-focus` | focus |
| `login/login.html:88` | `focus:border-brand-500 focus:ring-brand-tint-strong` | `focus:border-pen-500 focus:ring-pen-tint-strong` | pen border + tint (real control; migrated now even though the page is restyled in Phase 6) |
| `login/login.html:16` | `bg-brand-600/35` blur glow | leave | defer, Phase 6 kills the dark poster |
| `login/login.html:37` | `shadow-brand-700/20` | leave | defer, Phase 6 |
| `welcome/welcome.html:37` | `text-brand-100/60` eyebrow | leave | defer, Phase 5 rebuilds the page; reads as blush on the dark poster meanwhile |
| `welcome/welcome.html:45` | `text-brand-100` headline highlight | leave | defer, Phase 5 |
| `welcome/welcome.html:56` | `hover:bg-brand-50` on the white CTA | leave | defer, Phase 5 |
| `welcome/welcome.html:134` | `bg-brand-tint … text-on-brand-tint` | leave | already semantic; page rebuilt in Phase 5 anyway |
| `welcome/welcome.html:245` | `hover:bg-brand-50` | leave | defer, Phase 5 |
| `shared/empty-state.html:125` | `stroke="var(--color-brand-tint-strong)"` | leave | defer, Phase 3 restyles the illustrations |

Notes for review:

- **Toggle knob.** Resolved: Noel chose a dedicated `--color-knob: #fff` (both themes)
  over stretching `on-status`. The table rows for `settings.html:19/90` were applied
  with `before:bg-knob` instead.
- **Phase 2 done-gate amendment.** `grep -rE "brand-text|text-brand-[0-9]" src/app`
  cannot return nothing until Phase 5, because `welcome.html:37/45` keep `text-brand-100`
  on the old poster. Gate for this phase: the grep returns **only** those two lines
  (`--exclude-dir=welcome` version returns nothing). Phase 5 clears the rest.
- **D3 lands here.** Done — both variants rendered side by side against the live tokens
  in both themes; `brand-tint` won. The reasoning is recorded in §8.
- After the table is applied: delete `--color-brand-text` / `--color-brand-text-hover`
  from both columns of `src/styles.css`, re-run `node tools/contrast-check.mjs`, tests,
  build.
