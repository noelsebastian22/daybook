import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionStore } from '../../core/session.store';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="grid min-h-dvh place-items-center bg-linear-to-br from-brand-600 via-brand-500 to-indigo-400 p-6">
      <div class="w-full max-w-sm">
        <div class="mb-8 text-center text-white">
          <div
            class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-2xl backdrop-blur"
            aria-hidden="true"
          >
            &#9745;
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">Daybook</h1>
          <p class="mt-2 text-sm text-white/80">
            One page per day. Whatever you don't finish comes with you.
          </p>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow-xl shadow-brand-700/20">
          <button
            type="button"
            class="flex w-full items-center justify-center gap-3 rounded-xl border border-ink-200 px-4 py-3 font-medium transition hover:bg-ink-50 disabled:opacity-50"
            [disabled]="session.busy()"
            (click)="session.signInWithGoogle()"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.6a4.8 4.8 0 0 1-2.08 3.15v2.6h3.36C20.84 17.9 22 15.3 22 12.2Z"/>
              <path fill="#34A853" d="M12 22c2.82 0 5.18-.93 6.9-2.53l-3.37-2.6c-.93.63-2.13 1-3.53 1-2.71 0-5-1.83-5.83-4.3H2.7v2.7A10 10 0 0 0 12 22Z"/>
              <path fill="#FBBC05" d="M6.17 13.57a6 6 0 0 1 0-3.83V7.04H2.7a10 10 0 0 0 0 8.98l3.47-2.45Z"/>
              <path fill="#EA4335" d="M12 5.9c1.53 0 2.9.53 3.98 1.56l2.98-2.98C17.18 2.77 14.82 1.8 12 1.8A10 10 0 0 0 2.7 7.04l3.47 2.7C7 7.73 9.29 5.9 12 5.9Z"/>
            </svg>
            Continue with Google
          </button>

          <div class="my-5 flex items-center gap-3 text-xs text-ink-400">
            <span class="h-px flex-1 bg-ink-200"></span>
            or
            <span class="h-px flex-1 bg-ink-200"></span>
          </div>

          @if (session.magicLinkSentTo(); as sentTo) {
            <div class="rounded-xl bg-done-100 p-4 text-sm text-done-700">
              Link sent to <strong>{{ sentTo }}</strong>. Open it on this device to finish signing in.
            </div>
          } @else {
            <form (ngSubmit)="sendLink()">
              <label class="mb-1.5 block text-sm font-medium text-ink-600" for="email">
                Email a sign-in link
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                autocomplete="email"
                placeholder="you@example.com"
                class="w-full rounded-xl border border-ink-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                [(ngModel)]="email"
              />
              <button
                type="submit"
                class="mt-3 w-full rounded-xl bg-ink-900 px-4 py-3 font-medium text-white transition hover:bg-ink-600 disabled:opacity-50"
                [disabled]="session.busy() || !email()"
              >
                {{ session.busy() ? 'Sending...' : 'Send link' }}
              </button>
            </form>
          }
        </div>

        <p class="mt-6 text-center text-xs text-white/70">
          Google sign-in stays inactive until the OAuth credentials are added in Supabase.
        </p>
      </div>
    </div>
  `,
})
export class Login {
  protected readonly session = inject(SessionStore);
  protected readonly email = signal('');

  protected sendLink(): void {
    const value = this.email().trim();
    if (value) void this.session.signInWithMagicLink(value);
  }
}
