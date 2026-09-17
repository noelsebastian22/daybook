#!/usr/bin/env node
/**
 * Re-measures the colour pairs the theme depends on, in both themes, straight
 * from `src/styles.css`. Exits non-zero if any pair drops under its floor.
 *
 *   node tools/contrast-check.mjs
 *
 * AGENTS.md says contrast is measured, not eyeballed. The numbers used to live
 * only in comments beside the tokens, which is fine until somebody changes a
 * token and the comment keeps saying 9.2:1. This reads the values the browser
 * will actually get.
 *
 * How it reads the file: the light column is every `--color-*` declared inside
 * `@theme { … }`; the dark column is the light column overlaid with every
 * `--color-*` in the first `.dark { … }` block. That mirrors the cascade, so a
 * token the dark block does not mention (the whole palette, by design) keeps
 * its light value. No dependencies, no build step, no browser.
 *
 * Adding a pair: put it in PAIRS with the floor it has to clear. 4.5 for text,
 * 3 for the focus ring and other non-text UI (WCAG 1.4.11). A pair that is
 * *supposed* to fail, and exists to explain why a token is not used a certain
 * way, goes in EXPECTED_FAILURES so the reason stays executable.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles.css'),
  'utf8',
);

/** The body of the first block that starts at `opener`, braces balanced. */
function block(opener) {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`No "${opener}" block in styles.css`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error(`Unclosed "${opener}" block`);
}

function colours(body) {
  const out = {};
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const light = colours(block('@theme {'));
const dark = { ...light, ...colours(block('.dark {')) };

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `top` at `alpha` over `bottom`, all 0..1 channels. */
const over = (top, alpha, bottom) => top.map((c, i) => c * alpha + bottom[i] * (1 - alpha));

/** [foreground token, background token, floor, what it is] */
const PAIRS = [
  ['text', 'surface', 4.5, 'body text on the page'],
  ['text', 'surface-sunken', 4.5, 'body text on the desk / drawer'],
  ['text', 'surface-raised', 4.5, 'body text on an overlay'],
  ['text-muted', 'surface', 4.5, 'muted text on the page'],
  ['text-muted', 'surface-sunken', 4.5, 'muted text on the desk'],
  ['text-subtle', 'surface', 4.5, 'meta text on the page'],
  ['text-subtle', 'surface-sunken', 4.5, 'meta text on the desk — the hard one'],
  ['text-subtle', 'surface-raised', 4.5, 'meta text on an overlay'],
  ['text-subtle', 'hover', 4.5, 'meta text on a hovered row'],
  ['on-brand', 'brand-500', 4.5, 'label on a primary button'],
  ['on-brand', 'brand-600', 4.5, 'label on a hovered primary button'],
  ['on-status', 'late-700', 4.5, 'text on an error toast'],
  ['on-inverse', 'inverse', 4.5, 'text on a toast / active filter'],
  ['on-inverse-accent', 'inverse', 4.5, 'Undo on a toast'],
  ['pen-text', 'surface', 4.5, 'links on the page'],
  ['pen-text', 'surface-sunken', 4.5, 'links in the drawer'],
  ['pen-text', 'surface-raised', 4.5, 'links on an overlay'],
  ['pen-text-hover', 'surface', 4.5, 'hovered link'],
  ['on-pen-tint', 'pen-tint', 4.5, 'parsed token in the capture box'],
  ['on-pen-tint', 'pen-tint-strong', 4.5, 'parsed token, strong wash'],
  ['on-brand-tint', 'brand-tint', 4.5, 'active nav item'],
  ['on-brand-tint', 'brand-tint-strong', 4.5, 'selected day'],
  ['done-text', 'surface', 4.5, '"done 20:11"'],
  ['on-done-tint', 'done-tint', 4.5, 'done badge'],
  ['late-text', 'surface', 4.5, 'overdue text'],
  ['on-late-tint', 'late-tint', 4.5, 'carried ×4 badge'],
  ['on-quick-tint', 'quick-tint', 4.5, '!quick badge'],
  ['on-deep-tint', 'deep-tint', 4.5, '!deep badge'],
  ['on-status', 'done-500', 3, 'the tick on a completed checkbox'],
  ['focus', 'surface', 3, 'focus ring on the page'],
  ['focus', 'surface-sunken', 3, 'focus ring on the desk'],
  ['focus', 'surface-raised', 3, 'focus ring on an overlay'],
];

/** Pairs that must FAIL. Each one is the reason a rule exists. */
const EXPECTED_FAILURES = [
  ['on-status', 'brand-500', 4.5, 'white on coral — why on-brand is ink'],
  ['brand-700', 'surface', 4.5, 'coral as text — why coral is never text (light theme)', 'light'],
];

/**
 * Pairs that are under their floor today, on purpose or not yet decided.
 * Reported every run, never fatal, so they cannot be forgotten and cannot
 * block unrelated work. Fixing one means moving it up into PAIRS.
 *
 * Empty, and that is the point: the list is kept so the next gap has an
 * obvious place to go that is not a comment nobody reads. The one entry it
 * ever held — the white tick on done-500, 2.54:1 — was closed on 17 Sep by
 * darkening the green to #0e9f6e (3.39:1) and is now enforced in PAIRS.
 */
const KNOWN_GAPS = [];

let failed = 0;
const line = (ok, r, label) => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(6)}  ${label}`);

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name}`);
  for (const [fg, bg, floor, label] of PAIRS) {
    for (const t of [fg, bg]) if (!theme[t]) throw new Error(`Token --color-${t} not found`);
    const r = ratio(rgb(theme[fg]), rgb(theme[bg]));
    const ok = r >= floor;
    if (!ok) failed++;
    line(ok, r, `${fg} on ${bg} (≥${floor}) — ${label}`);
  }
  for (const [fg, bg, floor, label] of KNOWN_GAPS) {
    const r = ratio(rgb(theme[fg]), rgb(theme[bg]));
    console.log(`  ${r >= floor ? 'ok  ' : 'gap '} ${r.toFixed(2).padStart(6)}  ${fg} on ${bg} (≥${floor}) — ${label} — known gap, not fatal`);
  }
  for (const [fg, bg, floor, label, only] of EXPECTED_FAILURES) {
    if (only && only !== name) continue;
    const r = ratio(rgb(theme[fg]), rgb(theme[bg]));
    const ok = r < floor;
    if (!ok) failed++;
    line(ok, r, `${fg} on ${bg} must stay under ${floor} — ${label}`);
  }

  // The calendar heat map: the day number sits ON the top step.
  const heat = block(name === 'light' ? ':root {\n  --heat-1' : '.dark {\n  --heat-1');
  const top = heat.match(/--heat-4:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (top) {
    const cell = over([top[1], top[2], top[3]].map((n) => n / 255), Number(top[4]), rgb(theme.surface));
    const onCell = ratio(rgb(theme.text), cell);
    const vsPage = ratio(cell, rgb(theme.surface));
    const ok = onCell >= 3 && vsPage >= 1.5;
    if (!ok) failed++;
    line(ok, onCell, `day number on heat-4 (≥3, large bold digit), cell vs page ${vsPage.toFixed(2)} (≥1.5)`);
  }
}

console.log(failed ? `\n${failed} pair(s) out of bounds.` : '\nAll pairs inside their floors.');
process.exit(failed ? 1 : 0);
