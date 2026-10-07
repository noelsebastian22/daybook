import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { toConsentRequest, type ConsentRequest } from './oauth-consent.helpers';

/** An app the user has let in, for the Settings list. */
export interface ConnectedApp {
  clientId: string;
  name: string;
  grantedAt: string;
}

export type ConsentLookup =
  | { state: 'consent'; request: ConsentRequest }
  /** Already approved before: Supabase hands back the way out directly. */
  | { state: 'redirect'; url: string };

/**
 * The OAuth 2.1 server's user-facing calls, for the consent page.
 *
 * A service for the same reason `Access` is one: the page's states are then
 * testable against a stub without teaching `FakeSupabase` about the OAuth
 * server. Every decision returns the URL rather than letting auth-js navigate
 * (`skipBrowserRedirect`), so the page can say where it is going first.
 */
@Injectable({ providedIn: 'root' })
export class OAuthConsent {
  private readonly sb = inject(Supabase);

  async lookup(authorizationId: string): Promise<ConsentLookup> {
    const { data, error } = await this.sb.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) throw new Error(error?.message ?? 'Could not load this request.');
    if ('authorization_id' in data) return { state: 'consent', request: toConsentRequest(data) };
    return { state: 'redirect', url: data.redirect_url };
  }

  async decide(authorizationId: string, decision: 'approve' | 'deny'): Promise<string> {
    const options = { skipBrowserRedirect: true };
    const { data, error } =
      decision === 'approve'
        ? await this.sb.auth.oauth.approveAuthorization(authorizationId, options)
        : await this.sb.auth.oauth.denyAuthorization(authorizationId, options);
    if (error || !data) throw new Error(error?.message ?? 'Could not save that choice.');
    return data.redirect_url;
  }

  /** Every app this user has allowed, newest first. */
  async connectedApps(): Promise<ConnectedApp[]> {
    const { data, error } = await this.sb.auth.oauth.listGrants();
    if (error || !data) throw new Error(error?.message ?? 'Could not load connected apps.');
    return data
      .map((g) => ({
        clientId: g.client.id,
        name: g.client.name?.trim() || 'An unnamed app',
        grantedAt: g.granted_at,
      }))
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }

  /**
   * Revokes consent, ends the app's sessions and kills its refresh tokens —
   * Supabase does all three. The app has to go through consent again to get
   * back in.
   */
  async disconnect(clientId: string): Promise<void> {
    const { error } = await this.sb.auth.oauth.revokeGrant({ clientId });
    if (error) throw new Error(error.message);
  }

  /** A full navigation: the client's callback is not part of this app. */
  leave(url: string): void {
    location.assign(url);
  }
}
