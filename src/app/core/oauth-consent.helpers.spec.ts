import type { OAuthAuthorizationDetails } from '@supabase/auth-js';
import { describe, expect, it } from 'vitest';
import { redirectHost, toConsentRequest } from './oauth-consent.helpers';

describe('redirectHost', () => {
  it('shows the host of a hosted client', () => {
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toEqual({
      host: 'claude.ai',
      loopback: false,
    });
  });

  it('flags loopback redirects, by name and by address, with the port shown', () => {
    expect(redirectHost('http://localhost:3118/callback')).toEqual({
      host: 'localhost:3118',
      loopback: true,
    });
    expect(redirectHost('http://127.0.0.1:50000/callback').loopback).toBe(true);
    expect(redirectHost('http://[::1]:50000/callback').loopback).toBe(true);
  });

  it('shows an unparseable value as given rather than hiding it', () => {
    expect(redirectHost('not a url')).toEqual({ host: 'not a url', loopback: false });
  });
});

describe('toConsentRequest', () => {
  const details = (name: string): OAuthAuthorizationDetails => ({
    authorization_id: 'auth-1',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    client: { id: 'c1', name, uri: '', logo_uri: '' },
    user: { id: 'u1', email: 'noel@example.test' },
    scope: 'openid email',
  });

  it('flattens what the page needs', () => {
    expect(toConsentRequest(details('Claude'))).toEqual({
      authorizationId: 'auth-1',
      clientName: 'Claude',
      redirectHost: 'claude.ai',
      loopback: false,
      email: 'noel@example.test',
    });
  });

  it('never shows a blank name', () => {
    expect(toConsentRequest(details('  ')).clientName).toBe('An unnamed app');
  });
});
