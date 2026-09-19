import { describe, expect, it } from 'vitest';
import { isNotApprovedError, normalizeEmail } from './access.helpers';

describe('normalizeEmail', () => {
  it('lowercases and trims, so a typed address matches a stored one', () => {
    expect(normalizeEmail('  Noel@Example.COM ')).toBe('noel@example.com');
  });

  it('leaves an already-normal address alone', () => {
    expect(normalizeEmail('a@b.com')).toBe('a@b.com');
  });

  it('collapses whitespace-only input to empty', () => {
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('isNotApprovedError', () => {
  it('matches on the code the hook returns', () => {
    expect(isNotApprovedError({ code: 'daybook_not_approved' })).toBe(true);
  });

  // Whether `code` survives to the client is unverified — see
  // docs/ACCESS-PLAN.md §11. The message fallback is what makes this work
  // either way, and it is deleted once the real shape is known.
  it('falls back to the message when no code arrives', () => {
    expect(isNotApprovedError({ message: 'This email has not been approved for Daybook yet.' })).toBe(
      true,
    );
  });

  it('does not match an unrelated auth failure', () => {
    expect(isNotApprovedError({ message: 'Invalid login credentials' })).toBe(false);
  });

  it('does not match nothing', () => {
    expect(isNotApprovedError(null)).toBe(false);
    expect(isNotApprovedError(undefined)).toBe(false);
  });
});
