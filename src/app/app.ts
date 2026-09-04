import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/toasts';
import { SessionStore } from './core/session.store';
import { PageTitle } from './core/page-title';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: `
    @if (session.isResolved()) {
      <router-outlet />
    } @else {
      <div class="grid min-h-dvh place-items-center" role="status">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand-600"
          aria-hidden="true"
        ></div>
        <span class="sr-only">Loading Daybook</span>
      </div>
    }
    <app-toasts />

    <!--
      Navigation announcements. A router navigation is not a page load, so
      nothing tells a screen reader the page changed; PageTitle writes the
      new page's name here and the live region reads it out. Outside the
      outlet so it survives every navigation — a live region that unmounts
      and remounts is not announced at all.
    -->
    <p class="sr-only" role="status" aria-live="polite">{{ title.announced() }}</p>
  `,
})
export class App {
  protected readonly session = inject(SessionStore);
  protected readonly title = inject(PageTitle);
}
