import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Access } from '../../core/access';
import type { AccessLookup } from '../../core/models';
import { ToastStore } from '../../core/toast.store';
import { Logo } from '../../shared/brand/logo';

/**
 * Everything the page can be showing. `loading` until the lookup answers,
 * `failed` when it could not; the rest are the function's own states.
 */
type View =
  | { state: 'loading' | 'failed' | 'expired' | 'invalid' }
  | Extract<AccessLookup, { state: 'pending' }>
  | { state: 'approved' | 'denied'; email: string };

/**
 * Where the link in a "someone asked for access" email lands.
 *
 * **No sign-in.** The address that email goes to is not a Daybook account,
 * and does not need to be: the token in the link is the permission. It is
 * 32 random bytes, stored only as a hash, spent on first use and dead after
 * 30 days. So this sits outside both guards — signed in, signed out or on a
 * device that has never seen the app, it behaves the same.
 *
 * The token arrives in the URL fragment, which no browser sends to a server,
 * and leaves in a POST body. It never appears in a request URL at all.
 *
 * Opening the page decides nothing. That is the reason it exists rather than
 * a link that approves on open: an email scanner fetching the link would
 * otherwise be approving people.
 */
@Component({
  selector: 'app-access-decide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo],
  templateUrl: './access-decide.html',
})
export class AccessDecide {
  private readonly access = inject(Access);
  private readonly toast = inject(ToastStore);

  private readonly token =
    new URLSearchParams(inject(ActivatedRoute).snapshot.fragment ?? '').get('token') ?? '';

  protected readonly view = signal<View>({ state: 'loading' });
  protected readonly busy = signal(false);

  /** The request being decided, while there is one. */
  protected readonly request = computed(() => {
    const view = this.view();
    return view.state === 'pending' ? view : null;
  });

  /** Who the decision was about, once it is made. */
  protected readonly decidedEmail = computed(() => {
    const view = this.view();
    return view.state === 'approved' || view.state === 'denied' ? view.email : '';
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.token) {
      this.view.set({ state: 'invalid' });
      return;
    }
    try {
      this.view.set(await this.access.lookup(this.token));
    } catch {
      this.view.set({ state: 'failed' });
    }
  }

  protected async decide(decision: 'approve' | 'deny'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.view.set(await this.access.decide(this.token, decision));
    } catch (error) {
      // The token is only spent when the server answers, so a failure here
      // leaves it live and the buttons where they were. Pressing again is
      // the whole recovery.
      this.toast.error(error instanceof Error ? error.message : 'Could not reach the server.');
    } finally {
      this.busy.set(false);
    }
  }
}
