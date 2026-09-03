import * as chrono from 'chrono-node';
import type { Energy } from './models';
import { toLocalDate, today } from './dates';
import { CATEGORY_RE, ENERGY_RE } from './parse-capture.data';

export type TokenKind = 'date' | 'category' | 'energy';

export interface CaptureToken {
  start: number;
  end: number;
  kind: TokenKind;
  /** Text as typed. */
  raw: string;
  /** What the chip should display. */
  label: string;
}

export interface ParsedCapture {
  /** The task text with all tokens stripped out. */
  text: string;
  scheduled_date: string;
  reminder_at: string | null;
  categorySlug: string | null;
  energy: Energy | null;
  tokens: CaptureToken[];
}

/**
 * The inverse of `parseCapture`, as far as it usefully goes: a task's text
 * with its category and energy spelled back out as tokens, so an edit box
 * renders the same chips the capture box would have and both are edited the
 * same way.
 *
 * The date is deliberately left out. It rides in the picker instead, where an
 * edit can move it without re-typing a word — and round-tripping it through
 * the text would mean re-parsing "thursday" against a new today and silently
 * moving the task a week.
 */
export function toCaptureText(
  text: string,
  categorySlug: string | null,
  energy: Energy | null,
): string {
  return [text, categorySlug && `#${categorySlug}`, energy && `!${energy}`]
    .filter(Boolean)
    .join(' ');
}

export interface CaptureEdit {
  text: string;
  /** Where the caret should sit once the new text is in the box. */
  caret: number;
}

/**
 * Writes a token into the capture text on behalf of a manual chip control.
 *
 * The chips are a pure render of `parseCapture`, so a control cannot hold its
 * own value — it edits the text and lets the parse come back round. That keeps
 * one source of truth and it shows the user the token they could have typed.
 *
 * Every existing token of the kind is replaced by the single new one. Not just
 * the first: `parseCapture` honours only the first `#tag` and `!energy`, so a
 * leftover second one would sit in the box highlighted like a chip while
 * meaning nothing. `raw` of null clears the kind entirely.
 *
 * With nothing to replace, the token is appended after the task text — the
 * order `toCaptureText` already produces, so an edit box round-trips unchanged.
 * The caret is preserved rather than pushed to the end, so typing continues in
 * front of the appended token instead of inside it.
 */
export function writeToken(
  input: string,
  tokens: CaptureToken[],
  kind: TokenKind,
  raw: string | null,
  caret: number,
): CaptureEdit {
  const mine = tokens.filter((t) => t.kind === kind).sort((a, b) => a.start - b.start);

  if (mine.length === 0) {
    if (raw === null) return { text: input, caret };
    const head = input.replace(/\s+$/, '');
    return {
      text: head ? `${head} ${raw}` : raw,
      caret: Math.min(caret, head.length),
    };
  }

  let text = input;
  let next = caret;

  // Descending, so a token's own indices are still valid by the time it is cut.
  for (let i = mine.length - 1; i >= 0; i--) {
    const insert = i === 0 && raw !== null ? raw : '';
    let { start, end } = mine[i];

    // A token being removed takes one adjacent space with it, or the box
    // collects a double space every time a chip is changed.
    if (!insert) {
      if (start > 0 && text[start - 1] === ' ') start -= 1;
      else if (text[end] === ' ') end += 1;
    }

    text = text.slice(0, start) + insert + text.slice(end);
    if (next > end) next += insert.length - (end - start);
    else if (next > start) next = start + insert.length;
  }

  return { text, caret: Math.max(0, Math.min(next, text.length)) };
}

const overlaps = (a: CaptureToken, b: CaptureToken) => a.start < b.end && b.start < a.end;

/**
 * Parses `call physio thursday 2pm #physio !quick` into its parts.
 *
 * Order matters: #tags and !energy are extracted first so chrono cannot
 * claim a substring inside one of them (it will happily read "may" out of
 * "#maybe"). Date tokens overlapping an already-claimed range are dropped.
 */
export function parseCapture(input: string, ref: Date = new Date()): ParsedCapture {
  const tokens: CaptureToken[] = [];

  let categorySlug: string | null = null;
  for (const m of input.matchAll(CATEGORY_RE)) {
    const slug = m[1].toLowerCase();
    categorySlug ??= slug;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: 'category',
      raw: m[0],
      label: slug,
    });
  }

  let energy: Energy | null = null;
  for (const m of input.matchAll(ENERGY_RE)) {
    const value = m[1].toLowerCase() as Energy;
    energy ??= value;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: 'energy',
      raw: m[0],
      label: value,
    });
  }

  let scheduled_date = today();
  let reminder_at: string | null = null;
  /**
   * Whether a date token has claimed the schedule yet.
   *
   * This is a flag rather than a `scheduled_date === today()` check, which is
   * what it used to be. `scheduled_date` is *initialised* to today, so that
   * test could not tell "nothing has claimed it" from "the first token
   * resolved to today" — and a later token then overrode a deliberate one.
   * `call mum today then friday` scheduled Friday; `call mum tomorrow then
   * friday` correctly kept tomorrow. Same sentence shape, different answer,
   * depending only on whether the first date happened to be today.
   */
  let dateClaimed = false;

  const results = chrono.parse(input, ref, { forwardDate: true });
  for (const r of results) {
    const token: CaptureToken = {
      start: r.index,
      end: r.index + r.text.length,
      kind: 'date',
      raw: r.text,
      label: r.text.trim(),
    };
    if (tokens.some((t) => overlaps(t, token))) continue;

    tokens.push(token);

    // Only the first usable date drives scheduling.
    if (!dateClaimed) {
      dateClaimed = true;
      const date = r.start.date();
      scheduled_date = toLocalDate(date);
      if (r.start.isCertain('hour')) {
        reminder_at = date.toISOString();
      }
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  let text = '';
  let cursor = 0;
  for (const t of tokens) {
    text += input.slice(cursor, t.start);
    cursor = t.end;
  }
  text += input.slice(cursor);

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    scheduled_date,
    reminder_at,
    categorySlug,
    energy,
    tokens,
  };
}

/** Splits the raw input into plain runs and token runs, for the mirror div. */
export function segments(
  input: string,
  tokens: CaptureToken[],
): Array<{ text: string; kind: TokenKind | null }> {
  const out: Array<{ text: string; kind: TokenKind | null }> = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start > cursor) out.push({ text: input.slice(cursor, t.start), kind: null });
    out.push({ text: input.slice(t.start, t.end), kind: t.kind });
    cursor = t.end;
  }
  if (cursor < input.length) out.push({ text: input.slice(cursor), kind: null });
  return out;
}
