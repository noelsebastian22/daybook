import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Access } from '../../core/access';
import { normalizeEmail } from '../../core/access.helpers';
import type { AccessOutcome } from '../../core/models';
import { ToastStore } from '../../core/toast.store';
import { Logo } from '../../shared/brand/logo';

/** The form, or whichever of the four answers came back. */
type View = 'form' | AccessOutcome;

@Component({
  selector: 'app-request-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Logo],
  templateUrl: './request-access.html',
})
export class RequestAccess {
  private readonly access = inject(Access);
  private readonly toast = inject(ToastStore);

  protected readonly email = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly view = signal<View>('form');

  constructor() {
    // Set by session.store when a magic-link signup is refused: it has the
    // address because they typed it into /login, so the form opens with it
    // already in place. The OAuth bounce carries no address and lands here
    // empty.
    const prefill = inject(ActivatedRoute).snapshot.queryParamMap.get('email');
    if (prefill) this.email.set(prefill);
  }

  protected async submit(): Promise<void> {
    const email = normalizeEmail(this.email());
    if (!email || this.busy()) return;

    this.busy.set(true);
    try {
      this.view.set(await this.access.request(email, this.note().trim()));
    } catch (error) {
      // The form stays exactly as it was, so nothing they typed is lost and
      // trying again is one click. A failure here is the network, not them.
      this.toast.error(error instanceof Error ? error.message : 'Could not send that request.');
    } finally {
      this.busy.set(false);
    }
  }
}
