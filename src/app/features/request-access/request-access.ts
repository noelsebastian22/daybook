import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
