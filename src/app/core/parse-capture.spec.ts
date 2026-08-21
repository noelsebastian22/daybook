import { describe, expect, it } from 'vitest';
import { parseCapture, toCaptureText } from './parse-capture';
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
