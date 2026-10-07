import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { OAuthConsent } from '../../core/oauth-consent';
import type { ConsentRequest } from '../../core/oauth-consent.helpers';
import { consentPath, rememberReturn } from '../../core/return-to';
import { SessionStore } from '../../core/session.store';
import { ToastStore } from '../../core/toast.store';
import { Logo } from '../../shared/brand/logo';

type View =
  | { state: 'loading' | 'signed-out' | 'invalid' | 'failed' }
  | { state: 'consent'; request: ConsentRequest }
  | { state: 'leaving'; host: string };

/**
 * Where Supabase's OAuth server sends someone connecting an app — Claude, or
 * any other MCP client — to their Daybook. It is the OAuth server's
 * Authorization Path. See docs/MCP-PLAN.md §6.
 *
 * **No guard**, like `/access/decide`: a signed-out visitor has to be able to
 * land here. They are sent through sign-in and brought back by `return-to.ts`,
 * because both sign-in routes come home to /today.
 *
 * Opening the page decides nothing. Approve and Deny are the only two things
 * that do, and the page names where the browser goes next before it goes —
 * the MCP spec requires the redirect host to be shown, and a loopback one
 * gets a warning, because any program on the computer can listen there.
 */
@Component({
  selector: 'app-oauth-consent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo],
  templateUrl: './oauth-consent.html',
})
export class OAuthConsentPage {
  private readonly consent = inject(OAuthConsent);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastStore);

  private readonly authorizationId =
    inject(ActivatedRoute).snapshot.queryParamMap.get('authorization_id') ?? '';

  protected readonly view = signal<View>({ state: 'loading' });
  protected readonly busy = signal(false);

  protected readonly request = computed(() => {
    const view = this.view();
    return view.state === 'consent' ? view.request : null;
  });

  protected readonly leavingTo = computed(() => {
    const view = this.view();
    return view.state === 'leaving' ? view.host : '';
  });

  constructor() {
    toObservable(this.session.isResolved)
      .pipe(filter(Boolean), take(1))
      .subscribe(() => void this.load());
  }

  private async load(): Promise<void> {
    if (!this.authorizationId) {
      this.view.set({ state: 'invalid' });
      return;
    }
    if (!this.session.isAuthenticated()) {
      this.view.set({ state: 'signed-out' });
      return;
    }
    try {
      const result = await this.consent.lookup(this.authorizationId);
      if (result.state === 'redirect') {
        this.go(result.url);
        return;
      }
      this.view.set(result);
    } catch {
      this.view.set({ state: 'failed' });
    }
  }

  protected signIn(): void {
    rememberReturn(consentPath(this.authorizationId));
    void this.router.navigate(['/login']);
  }

  protected async decide(decision: 'approve' | 'deny'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.go(await this.consent.decide(this.authorizationId, decision));
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Could not reach the server.');
      this.busy.set(false);
    }
  }

  private go(url: string): void {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // Shown as given; the browser will refuse it if it is not a URL.
    }
    this.view.set({ state: 'leaving', host });
    this.consent.leave(url);
  }
}
