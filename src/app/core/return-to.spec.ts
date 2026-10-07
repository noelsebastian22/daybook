import { afterEach, describe, expect, it } from 'vitest';
import { consentPath, rememberReturn, RETURN_TTL_MS, takeReturn } from './return-to';

describe('return-to', () => {
  afterEach(() => localStorage.clear());

  it('hands back a consent path once', () => {
    rememberReturn(consentPath('abc-123'), 1_000);
    expect(takeReturn(2_000)).toBe('/oauth/consent?authorization_id=abc-123');
    expect(takeReturn(3_000)).toBeNull();
  });

  it('encodes the id so it cannot smuggle in another parameter', () => {
    expect(consentPath('a&next=/x')).toBe('/oauth/consent?authorization_id=a%26next%3D%2Fx');
  });

  // The guard that reads this redirects wherever it says. Anything but a
  // consent URL is refused at the door, so it cannot become an open redirect.
  it('refuses to store anywhere but the consent page', () => {
    rememberReturn('/today');
    rememberReturn('https://evil.example/oauth/consent?authorization_id=x');
    rememberReturn('//evil.example/oauth/consent?authorization_id=x');
    expect(takeReturn()).toBeNull();
  });

  it('refuses a tampered value read back out', () => {
    localStorage.setItem('daybook.returnTo', JSON.stringify({ path: '/settings', at: Date.now() }));
    expect(takeReturn()).toBeNull();
    localStorage.setItem('daybook.returnTo', 'not json');
    expect(takeReturn()).toBeNull();
  });

  it('expires', () => {
    rememberReturn(consentPath('abc'), 0);
    expect(takeReturn(RETURN_TTL_MS + 1)).toBeNull();
  });
});
