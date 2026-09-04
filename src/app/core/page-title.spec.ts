import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, TitleStrategy, type Route } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../app.routes';
import { PageTitle } from './page-title';

/**
 * Two failures with one cause: a router navigation is not a page load.
 *
 * Nothing reloads, nothing takes focus, and the title never changed — so five
 * open tabs all read "Daybook", and moving from Today to Calendar was
 * announced to a screen reader as nothing at all. `announced` is rendered by
 * `App` into a visually hidden `aria-live="polite"` region outside the outlet,
 * so it survives every navigation; a live region that unmounts and remounts is
 * not announced.
 */

@Component({
  selector: 'app-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Blank {}

function navigable(list: Route[]): Route[] {
  return list.flatMap((route) => (route.children?.length ? navigable(route.children) : [route]));
}

describe('PageTitle', () => {
  let router: Router;
  let title: PageTitle;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'today', title: 'Today', component: Blank },
          { path: 'calendar', title: 'Calendar', component: Blank },
          { path: 'nowhere', component: Blank },
        ]),
        { provide: TitleStrategy, useExisting: PageTitle },
      ],
    });

    router = TestBed.inject(Router);
    title = TestBed.inject(PageTitle);
  });

  it('names the tab after the page, so two open tabs are not the same word twice', async () => {
    await router.navigateByUrl('/today');

    expect(document.title).toBe('Today · Daybook');
  });

  it('renames it on the way to the next page', async () => {
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/calendar');

    expect(document.title).toBe('Calendar · Daybook');
  });

  it('speaks the page that just arrived', async () => {
    await router.navigateByUrl('/today');

    expect(title.announced()).toBe('Today page');
  });

  it('says nothing until the first navigation resolves', () => {
    expect(title.announced()).toBe('');
  });

  it('announces each arrival, not only the first', async () => {
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/calendar');

    expect(title.announced()).toBe('Calendar page');
  });

  it('falls back to the app’s own name rather than a stray separator', async () => {
    await router.navigateByUrl('/nowhere');

    expect(document.title).toBe('Daybook');
  });

  it('announces nothing for a page with no name, rather than the word "page" alone', async () => {
    await router.navigateByUrl('/nowhere');

    expect(title.announced()).toBe('');
  });

  it('is what the router asks, so no page has to remember to call it', () => {
    expect(TestBed.inject(TitleStrategy)).toBe(title);
  });
});

describe('the app’s routes', () => {
  /**
   * The whole announcement mechanism rests on `title` being present in
   * `app.routes.ts` — that is the entire per-route cost, and a route added
   * without one is silent rather than broken, which is the hardest kind of
   * regression to notice.
   */
  it('every page a person can navigate to carries a name', () => {
    const unnamed = navigable(routes)
      .filter((route) => route.component ?? route.loadComponent)
      .filter((route) => !route.title)
      .map((route) => route.path);

    expect(unnamed).toEqual([]);
  });
});
