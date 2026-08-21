import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Names the page, in two places that both needed it.
 *
 * Every route rendered as "Daybook" in the tab and in history, so five open
 * tabs were indistinguishable. Worse, a router navigation changes nothing a
 * screen reader notices — no page load, no focus move — so moving from Today
 * to Calendar was announced as nothing at all.
 *
 * `Title.setTitle` fixes the first. `announced` fixes the second: `App`
 * renders it into a visually hidden `aria-live="polite"` region, so each
 * navigation speaks the name of the page that just arrived. Polite rather
 * than assertive — it should not cut across a toast confirming the thing the
 * user just did.
 */
@Injectable({ providedIn: 'root' })
export class PageTitle extends TitleStrategy {
  private readonly title = inject(Title);

  /** The page name to speak. Empty until the first navigation resolves. */
  readonly announced = signal('');

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);

    this.title.setTitle(page ? `${page} · Daybook` : 'Daybook');
    this.announced.set(page ? `${page} page` : '');
  }
}
