import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCapture, toCaptureText, writeToken } from './parse-capture';
import { today } from './dates';

// Fixed reference so "thursday" is deterministic.
// 2026-08-17 is a Monday.
const REF = new Date(2026, 7, 17, 9, 0, 0);

describe('parseCapture', () => {
  it('pulls date, time, category and energy out of one line', () => {
    const r = parseCapture('call physio thursday 2pm #physio !quick', REF);

    expect(r.text).toBe('call physio');
    expect(r.scheduled_date).toBe('2026-08-20');
    expect(r.categorySlug).toBe('physio');
    expect(r.energy).toBe('quick');
    expect(r.reminder_at).not.toBeNull();
    expect(new Date(r.reminder_at!).getHours()).toBe(14);
  });

  it('defaults to today when no date is given', () => {
    const r = parseCapture('take the bins out', REF);
    expect(r.scheduled_date).toBe(today());
    expect(r.reminder_at).toBeNull();
  });

  it('sets no reminder when the date has no time', () => {
    const r = parseCapture('invoice the client friday', REF);
    expect(r.scheduled_date).toBe('2026-08-21');
    expect(r.reminder_at).toBeNull();
  });

  it('does not let chrono read a date out of a #tag', () => {
    // "may" inside "#maybe" must not schedule anything.
    const r = parseCapture('sort the shed #maybe', REF);
    expect(r.text).toBe('sort the shed');
    expect(r.categorySlug).toBe('maybe');
    expect(r.scheduled_date).toBe(today());
    expect(r.tokens.filter((t) => t.kind === 'date')).toHaveLength(0);
  });

  it('keeps the first of each token type', () => {
    const r = parseCapture('thing #work #family !deep !quick', REF);
    expect(r.categorySlug).toBe('work');
    expect(r.energy).toBe('deep');
  });

  it('reports token ranges that line up with the input', () => {
    const input = 'call physio thursday #physio';
    const r = parseCapture(input, REF);
    for (const t of r.tokens) {
      expect(input.slice(t.start, t.end)).toBe(t.raw);
    }
  });

  it('returns empty text when the input is only tags', () => {
    const r = parseCapture('#work !quick', REF);
    expect(r.text).toBe('');
  });

  it('collapses the whitespace left behind by stripped tokens', () => {
    const r = parseCapture('pay   the  #bills   rent', REF);
    expect(r.text).toBe('pay the rent');
  });
});

describe('toCaptureText', () => {
  it('spells the tokens back out for an edit box', () => {
    expect(toCaptureText('call physio', 'physio', 'quick')).toBe('call physio #physio !quick');
  });

  it('omits what the task does not have', () => {
    expect(toCaptureText('call physio', null, null)).toBe('call physio');
    expect(toCaptureText('call physio', 'physio', null)).toBe('call physio #physio');
    expect(toCaptureText('call physio', null, 'deep')).toBe('call physio !deep');
  });

  it('round-trips through the parser without moving the task', () => {
    // The property that matters: opening an edit box and saving it again
    // unchanged must not alter the task.
    const round = parseCapture(toCaptureText('call physio', 'physio', 'quick'), REF);

    expect(round.text).toBe('call physio');
    expect(round.categorySlug).toBe('physio');
    expect(round.energy).toBe('quick');
  });

  it('leaves the date out, so a re-save cannot re-read it against a new today', () => {
    expect(toCaptureText('call physio thursday', null, null)).toBe('call physio thursday');
    // "thursday" is only there because it is part of the stored text; the
    // seeded picker is what actually carries the day.
  });
});

describe('writeToken', () => {
  /** Writes into `input` the way the chip controls do, tokens and all. */
  const write = (
    input: string,
    kind: 'date' | 'category' | 'energy',
    raw: string | null,
    caret = input.length,
  ) => writeToken(input, parseCapture(input, REF).tokens, kind, raw, caret);

  it('appends a token when there is none, after the task text', () => {
    expect(write('call physio', 'category', '#physio').text).toBe('call physio #physio');
    expect(write('call physio', 'energy', '!deep').text).toBe('call physio !deep');
  });

  it('replaces an existing token of the same kind in place', () => {
    expect(write('call physio #admin !quick', 'category', '#health').text).toBe(
      'call physio #health !quick',
    );
    expect(write('call physio #admin !quick', 'energy', '!deep').text).toBe(
      'call physio #admin !deep',
    );
  });

  it('collapses every token of the kind into the one the parser honours', () => {
    // parseCapture takes the first #tag, so a second left behind would render
    // as a chip in the mirror while meaning nothing.
    const r = write('call #admin physio #health', 'category', '#urgent');
    expect(r.text).toBe('call #urgent physio');
    expect(parseCapture(r.text, REF).tokens.filter((t) => t.kind === 'category')).toHaveLength(1);
  });

  it('clears the kind on a null raw, taking the spare space with it', () => {
    expect(write('call physio #admin !quick', 'category', null).text).toBe('call physio !quick');
    expect(write('call physio #admin', 'category', null).text).toBe('call physio');
    expect(write('#admin call physio', 'category', null).text).toBe('call physio');
  });

  it('is a no-op when clearing a kind that is not there', () => {
    expect(write('call physio', 'category', null).text).toBe('call physio');
  });

  it('round-trips: writing what is already there changes nothing', () => {
    expect(write('call physio #admin', 'category', '#admin').text).toBe('call physio #admin');
  });

  it('keeps the caret in the task text when a token is appended', () => {
    // Caret after "call", mid-sentence. Appending must not drag it to the end,
    // or the next keystroke lands inside the token.
    const r = write('call physio', 'category', '#physio', 4);
    expect(r.text).toBe('call physio #physio');
    expect(r.caret).toBe(4);
  });

  it('shifts the caret by the length a replacement changed', () => {
    // Caret at the very end, token replaced earlier in the string.
    const input = 'call #a physio';
    const r = write(input, 'category', '#health', input.length);
    expect(r.text).toBe('call #health physio');
    expect(r.caret).toBe(input.length + '#health'.length - '#a'.length);
  });

  it('pulls the caret back when the token under it is removed', () => {
    const input = 'call physio #admin';
    const r = write(input, 'category', null, input.length);
    expect(r.text).toBe('call physio');
    expect(r.caret).toBe('call physio'.length);
  });

  it('never returns a caret outside the text', () => {
    for (const raw of ['#health', null]) {
      for (const caret of [0, 3, 99]) {
        const r = write('call physio #admin', 'category', raw, caret);
        expect(r.caret).toBeGreaterThanOrEqual(0);
        expect(r.caret).toBeLessThanOrEqual(r.text.length);
      }
    }
  });

  it('leaves a parse that survives being written back out', () => {
    const r = write('call physio thursday 2pm', 'energy', '!quick');
    const parsed = parseCapture(r.text, REF);
    expect(parsed.text).toBe('call physio');
    expect(parsed.energy).toBe('quick');
    expect(parsed.scheduled_date).toBe('2026-08-20');
  });
});

describe('only the first date wins', () => {
  /**
   * The clock is pinned rather than a fixed `ref` being passed.
   *
   * The bug lived in a guard comparing `scheduled_date` against `today()`.
   * `today()` reads the wall clock, while the `REF` above is frozen in Aug
   * 2026, so under a fixed ref the two could never be equal and the broken
   * branch was unreachable — a spec built on REF cannot see this bug at all.
   * Reproducing it needs `today()` and the parse reference to be the same day,
   * which is what production always does and what `setSystemTime` recreates.
   *
   * Pinned to Monday 17 Aug 2026 so "today" and "friday" are four days apart.
   * Picking the day matters: on a real Friday the two phrases resolve to the
   * same date and the assertion passes against the bug.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a first date that resolves to today', () => {
    // Before the fix this returned Friday: scheduled_date is initialised to
    // today(), so the guard read "already today" as "nothing claimed it yet"
    // and let the second date overwrite a deliberate one.
    expect(parseCapture('call mum today then friday').scheduled_date).toBe('2026-08-17');
    expect(today()).toBe('2026-08-17');
  });

  it('still lets a non-today first date win, which always worked', () => {
    expect(parseCapture('call mum tomorrow then friday').scheduled_date).toBe('2026-08-18');
  });

  it('keeps the first date and its time when a bare date follows', () => {
    const r = parseCapture('call mum today at 2pm then friday');
    expect(r.scheduled_date).toBe('2026-08-17');
    expect(new Date(r.reminder_at!).getHours()).toBe(14);
  });
});
