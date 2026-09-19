import { describe, expect, it } from 'vitest';
import { readSignupRejection } from './auth-error';

describe('readSignupRejection', () => {
  it('recognises the hook rejection in an OAuth fragment', () => {
    const hash =
      '#error=server_error&error_code=daybook_not_approved' +
      '&error_description=This%20email%20has%20not%20been%20approved%20for%20Daybook%20yet.';
    expect(readSignupRejection(hash)).toBe(true);
  });

  it('recognises it from the description alone', () => {
    expect(
      readSignupRejection('#error=server_error&error_description=This+email+has+not+been+approved'),
    ).toBe(true);
  });

  it('ignores an unrelated OAuth failure', () => {
    expect(readSignupRejection('#error=access_denied&error_description=User+cancelled')).toBe(false);
  });

  it('ignores a successful return carrying a token', () => {
    expect(readSignupRejection('#access_token=abc&token_type=bearer')).toBe(false);
  });

  it('ignores an empty hash', () => {
    expect(readSignupRejection('')).toBe(false);
    expect(readSignupRejection('#')).toBe(false);
  });
});
