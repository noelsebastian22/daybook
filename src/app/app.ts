import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/toasts';
import { SessionStore } from './core/session.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: `
    @if (session.isResolved()) {
      <router-outlet />
    } @else {
      <div class="grid min-h-dvh place-items-center">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600"
        ></div>
      </div>
    }
    <app-toasts />
  `,
})
export class App {
  protected readonly session = inject(SessionStore);
}
