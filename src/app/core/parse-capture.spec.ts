import { describe, expect, it } from 'vitest';
import { parseCapture } from './parse-capture';
import { addDays, toLocalDate, today } from './dates';

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

describe('dates', () => {
  it('uses the local calendar date, not UTC', () => {
    // 09:00 in Sydney is the previous day in UTC. toISOString() would be wrong.
    const morning = new Date(2026, 7, 17, 9, 0, 0);
    expect(toLocalDate(morning)).toBe('2026-08-17');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
