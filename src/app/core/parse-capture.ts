import * as chrono from 'chrono-node';
import type { Energy } from './models';
import { toLocalDate, today } from './dates';

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

const CATEGORY_RE = /#([\p{L}\p{N}_-]+)/gu;
const ENERGY_RE = /!(quick|deep)\b/giu;

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
    if (reminder_at === null && scheduled_date === today()) {
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
