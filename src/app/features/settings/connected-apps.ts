import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { friendlyDate, toLocalDate } from '../../core/dates';
import { OAuthConsent, type ConnectedApp } from '../../core/oauth-consent';
import { ToastStore } from '../../core/toast.store';

type View = { state: 'loading' | 'failed' } | { state: 'ready'; apps: ConnectedApp[] };

/**
 * The apps a user has let into their Daybook through `/oauth/consent` —
 * Claude, mostly — and the way to throw one out. Its own component so
 * Settings does not grow a fifth concern, and so a failure here (the OAuth
 * server switched off, say) stays in this box.
 *
 * No Undo on Disconnect, unlike the rest of the app: a revoked grant cannot be
 * restored from here, only re-granted by connecting again from the app.
 */
@Component({
  selector: 'app-connected-apps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connected-apps.html',
})
export class ConnectedApps {
  private readonly consent = inject(OAuthConsent);
  private readonly toast = inject(ToastStore);

  protected readonly view = signal<View>({ state: 'loading' });
  protected readonly busy = signal<string | null>(null);

  protected readonly apps = computed(() => {
    const view = this.view();
    return view.state === 'ready' ? view.apps : [];
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.view.set({ state: 'ready', apps: await this.consent.connectedApps() });
    } catch {
      this.view.set({ state: 'failed' });
    }
  }

  protected since(app: ConnectedApp): string {
    return friendlyDate(toLocalDate(new Date(app.grantedAt)));
  }

  protected async disconnect(app: ConnectedApp): Promise<void> {
    if (this.busy()) return;
    this.busy.set(app.clientId);
    try {
      await this.consent.disconnect(app.clientId);
      const view = this.view();
      if (view.state === 'ready') {
        this.view.set({
          state: 'ready',
          apps: view.apps.filter((a) => a.clientId !== app.clientId),
        });
      }
      this.toast.show(`Disconnected ${app.name}.`);
    } catch {
      this.toast.error(`Could not disconnect ${app.name}.`);
    } finally {
      this.busy.set(null);
    }
  }
}
