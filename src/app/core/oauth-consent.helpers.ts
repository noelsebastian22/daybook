import type { OAuthAuthorizationDetails } from '@supabase/auth-js';

/** What the consent page shows, flattened from what Supabase Auth returns. */
export interface ConsentRequest {
  authorizationId: string;
  clientName: string;
  /** Where the browser goes after a decision, as a bare host. */
  redirectHost: string;
  /** A loopback redirect: some program on this computer is asking. */
  loopback: boolean;
  email: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The host the MCP spec says a consent screen must show plainly. Falls back
 * to the raw string when it does not parse, rather than hiding it.
 */
export function redirectHost(uri: string): { host: string; loopback: boolean } {
  try {
    const url = new URL(uri);
    return { host: url.host, loopback: LOOPBACK.has(url.hostname) };
  } catch {
    return { host: uri, loopback: false };
  }
}

export function toConsentRequest(details: OAuthAuthorizationDetails): ConsentRequest {
  const { host, loopback } = redirectHost(details.redirect_uri);
  return {
    authorizationId: details.authorization_id,
    clientName: details.client.name?.trim() || 'An unnamed app',
    redirectHost: host,
    loopback,
    email: details.user.email,
  };
}
