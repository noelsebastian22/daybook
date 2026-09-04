import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { render, type Rendered } from '../../../testing/render';
import { Welcome } from './welcome';

/**
 * The marketing page, covered lightly and deliberately: its copy and its type
 * scale are meant to change, and a spec that pinned either would be a spec
 * that has to be rewritten every time the page is redesigned.
 *
 * What is worth locking in is the accessibility contract, because it is the
 * part a redesign silently breaks. The hero animation is an *argument* — a
 * task lifting off yesterday's page onto today's with its count ticking over —
 * and it is the one thing about Daybook no other list app does. It carries one
 * `role="img"` and one label that states the argument; the eight cards and
 * rows it is drawn from are furniture and are hidden. Reading them out one by
 * one would say nothing at all.
 */

async function renderWelcome(): Promise<Rendered<Welcome>> {
  return render(Welcome);
}

describe('Welcome', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('makes one claim, as the page’s only first-level heading', async () => {
    const page = await renderWelcome();

    expect(page.queryAll('h1')).toHaveLength(1);
    expect(page.query('h1')?.textContent).toContain('comes with you');
  });

  it('states the carry-over in words as well as in motion', async () => {
    const page = await renderWelcome();
    const illustration = page.query('[role="img"]');

    expect(page.queryAll('[role="img"]')).toHaveLength(1);
    expect(illustration?.getAttribute('aria-label')).toContain('carried count');
  });

  it('hides the shapes the illustration is drawn from, rather than labelling each one', async () => {
    const page = await renderWelcome();
    const illustration = page.query('[role="img"]') as HTMLElement;

    const exposed = Array.from(illustration.children).filter(
      (child) => child.getAttribute('aria-hidden') !== 'true',
    );

    expect(exposed).toEqual([]);
  });

  it('sends every route out of the page to the same door', async () => {
    const page = await renderWelcome();
    const links = page.queryAll('a').map((a) => a.getAttribute('href'));

    expect(links.every((href) => href === '/login')).toBe(true);
    // One in the header for someone who already has an account, one in the
    // hero and one at the close for someone who does not.
    expect(links).toHaveLength(3);
  });

  it('offers a way in before the page has been read, not only after it', async () => {
    const page = await renderWelcome();
    const first = page.query('a');

    expect(first?.getAttribute('href')).toBe('/login');
  });
});
