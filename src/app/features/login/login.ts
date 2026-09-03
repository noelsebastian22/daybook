import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { Logo } from '../../shared/brand/logo';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Logo],
  templateUrl: './login.html',
})
export class Login {
  protected readonly session = inject(SessionStore);
  protected readonly email = signal('');

  protected sendLink(): void {
    const value = this.email().trim();
    if (value) void this.session.signInWithMagicLink(value);
  }
}
