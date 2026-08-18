import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  comingMonday,
  comingSaturday,
  daysInMonth,
  startOfMonth,
  timeOfDay,
  toLocalDate,
  toTimestamp,
  weekdayIndex,
} from './dates';

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

describe('month grid helpers', () => {
  it('steps months from the first, so a short month cannot overflow', () => {
    // Naive month arithmetic on the 31st lands in March.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
  });

  it('starts the month and counts its days', () => {
    expect(startOfMonth('2026-08-18')).toBe('2026-08-01');
    expect(daysInMonth('2026-02-10')).toBe(28);
    expect(daysInMonth('2024-02-10')).toBe(29);
    expect(daysInMonth('2026-08-01')).toBe(31);
  });

  it('indexes weekdays from Monday', () => {
    // 2026-08-17 is a Monday, 2026-08-23 the Sunday after it.
    expect(weekdayIndex('2026-08-17')).toBe(0);
    expect(weekdayIndex('2026-08-23')).toBe(6);
  });
});

describe('shortcut days', () => {
  it('reads this weekend as the coming Saturday', () => {
    expect(comingSaturday('2026-08-18')).toBe('2026-08-22'); // Tue -> Sat
    expect(comingSaturday('2026-08-21')).toBe('2026-08-22'); // Fri -> tomorrow
    expect(comingSaturday('2026-08-22')).toBe('2026-08-22'); // Sat -> today
  });

  it('treats a Sunday as the weekend already being here', () => {
    // Not the Saturday six days out — the picker drops it as a duplicate of
    // Today instead of offering next weekend under the wrong label.
    expect(comingSaturday('2026-08-23')).toBe('2026-08-23');
  });

  it('reads next week as the next Monday, never today', () => {
    expect(comingMonday('2026-08-18')).toBe('2026-08-24'); // Tue -> Mon
    expect(comingMonday('2026-08-23')).toBe('2026-08-24'); // Sun -> tomorrow
    expect(comingMonday('2026-08-17')).toBe('2026-08-24'); // Mon -> a week out
  });
});

describe('reminder times', () => {
  it('pairs a local day with a wall-clock time', () => {
    const ts = toTimestamp('2026-08-20', '14:30');
    const d = new Date(ts);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('round-trips through the time field', () => {
    expect(timeOfDay(toTimestamp('2026-08-20', '09:05'))).toBe('09:05');
  });
});
