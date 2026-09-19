import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, type Rendered } from '../../../testing/render';
import { Welcome } from './welcome';

/**
 * The marketing page, covered lightly and deliberately: its copy and its type
 * scale are meant to change, and a spec that pinned either would be a spec
 * that has to be rewritten every time the page is redesigned.
 *
 * What is worth locking in is the accessibility contract, because it is the
 * part a redesign silently breaks — and this page has just proved that, by
 * being redesigned. The old hero was a looping animation carrying one
 * `role="img"` and one label that stated its argument. It is now a real,
 * usable page (`try-page.ts`), so the contract inverts: the interactive
 * demo must be reachable as controls, and the decorative handwriting that
 * sits beside it must NOT be, because everything it says is already said in
 * real text.
 *
 * `try-page.spec.ts` covers what the demo actually does. This file only
 * checks that the page frames it correctly.
 */

async function renderWelcome(): Promise<Rendered<Welcome>> {
  return render(Welcome);
}

describe('Welcome', () => {
  beforeEach(() => {
    // The hero renders a live date. Pin the clock so "page N of 365" and the
    // date line cannot make this suite depend on the day it is run.
    //
    // `toFake: ['Date']` and not the full timer set: the app is zoneless, so
    // `render()` waits on `fixture.whenStable()`, and faking the timers it is
    // waiting on hangs the spec rather than failing it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 17, 9, 0, 0));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes one claim, as the page’s only first-level heading', async () => {
    const page = await renderWelcome();

    expect(page.queryAll('h1')).toHaveLength(1);
    expect(page.query('h1')?.textContent).toContain('Leftovers included');
  });

  it('puts a usable page in the hero, not a picture of one', async () => {
    const page = await renderWelcome();

    // The demo is real controls. If someone replaces it with an illustration
    // again, this is the line that should stop them.
    expect(page.query('app-try-page')).not.toBeNull();
    expect(page.queryAll('[role="img"]')).toHaveLength(0);
    // A box you can type into. It is a `textarea` rather than an `input`
    // because it carries the live highlight — see try-page.html.
    expect(page.query('app-try-page textarea')).not.toBeNull();
  });

  it('hides the handwritten notes from assistive technology', async () => {
    const page = await renderWelcome();

    // They are decoration: each one restates something the page already says
    // in real text, so reading them aloud would say it twice.
    const notes = page.queryAll('svg path[d]');
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('sends every route out of the page to one of the two doors', async () => {
    const page = await renderWelcome();
    const routed = page
      .queryAll('a')
      .map((a) => a.getAttribute('href'))
      .filter((href) => !href?.startsWith('#'));

    // This used to assert a single door. The access gate added the second:
    // /login for someone who already has an account, /request-access for
    // someone who does not. Sign in stays primary in both places — an
    // approved visitor looks exactly like a stranger until they try.
    expect(routed.every((href) => href === '/login' || href === '/request-access')).toBe(true);
    // Three to sign in: the header, the hero and the close. Two to ask:
    // beside the hero action, and under the closing one.
    expect(routed.filter((href) => href === '/login')).toHaveLength(3);
    expect(routed.filter((href) => href === '/request-access')).toHaveLength(2);
  });

  it('points its one in-page link at a section that exists', async () => {
    const page = await renderWelcome();
    const jump = page.queryAll('a').find((a) => a.getAttribute('href')?.startsWith('#'));

    // A "See how it works" link that scrolls nowhere is worse than no link.
    const target = jump?.getAttribute('href')?.slice(1);
    expect(target).toBeTruthy();
    expect(page.query(`#${target}`)).not.toBeNull();
  });

  it('offers a way in before the page has been read, not only after it', async () => {
    const page = await renderWelcome();
    const first = page.query('a');

    expect(first?.getAttribute('href')).toBe('/login');
  });
});
