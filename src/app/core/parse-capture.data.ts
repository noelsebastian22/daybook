/**
 * The capture box's token syntax, as data.
 *
 * There is no keyword table here and there is deliberately not going to be
 * one: dates are chrono-node's job, so the only vocabulary Daybook defines
 * itself is these two sigils. They live apart from `parse-capture.ts` because
 * the syntax is the contract the user types against, while the parser is just
 * the code that reads it — and the chip controls, the highlighter and the
 * `toCaptureText` round-trip all have to agree with what is written here.
 *
 * Both carry the `g` flag because `parseCapture` reads them with `matchAll`,
 * which requires it. `matchAll` iterates over an internal clone, so sharing a
 * single module-level regex across calls does not leak `lastIndex` between
 * them.
 */

/**
 * `#category` — letters, numbers, underscore and hyphen, Unicode-aware, so a
 * non-Latin tag is a tag rather than a stray `#`. Lowercased into the slug by
 * the parser; the slug is what `resolveCategory` matches on, which is why a
 * category's slug is never renamed once tags exist.
 */
export const CATEGORY_RE = /#([\p{L}\p{N}_-]+)/gu;

/**
 * `!quick` / `!deep` — the two `Energy` values from `models.ts`, spelled out.
 * `\b` stops `!quicker` reading as `!quick` followed by stray text.
 */
export const ENERGY_RE = /!(quick|deep)\b/giu;
