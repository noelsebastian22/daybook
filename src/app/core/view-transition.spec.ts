import type { ApplicationRef } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion, withViewTransition } from './view-transition';

/**
 * jsdom implements no View Transitions API, so what is testable here is the
 * contract around it rather than the animation: the mutation happens on every
 * path, the API is only reached when it exists and motion is welcome, and the
 * explicit `tick()` runs *inside* the callback.
 *
 * That ordering is the load-bearing part. The app is zoneless, so a signal
 * write does not touch the DOM until change detection runs, and the browser
 * snapshots the "after" state the moment the callback returns — without the
 * tick both snapshots are identical and nothing animates at all. A fake
 * `startViewTransition` can prove the tick is called and that it is called
 * after the mutation and before the callback returns.
 *
 * **Not covered, and not coverable here:** that the browser matches elements
 * across the two snapshots by `view-transition-name`, and therefore that a row
 * showing the same task twice kills the transition. That needs a real engine.
 */

/**
 * The DOM lib types `startViewTransition` as always present and returning a
 * full `ViewTransition`, which is exactly the claim `view-transition.ts` guards
 * against at runtime. Casting through `unknown` is what lets the spec install
 * and remove it the way a real browser does or does not have it.
 */
const doc = document as unknown as {
  startViewTransition?: (callback: () => void) => unknown;
};

function fakeAppRef(log: string[]): ApplicationRef {
  return { tick: () => log.push('tick') } as unknown as ApplicationRef;
}

/** Installs an API that runs its callback synchronously, as the real one does. */
function withApi(log: string[]): ReturnType<typeof vi.fn> {
  const start = vi.fn((callback: () => void) => {
    log.push('start');
    callback();
    log.push('returned');
    return { finished: Promise.resolve() };
  });
  doc.startViewTransition = start;
  return start;
}

function reducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
  }));
}

afterEach(() => {
  delete doc.startViewTransition;
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('is true when the OS asks for less movement', () => {
    reducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when it does not', () => {
    reducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('assumes motion is fine on a browser that cannot be asked', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('withViewTransition', () => {
  it('makes the change even where the API does not exist', () => {
    reducedMotion(false);
    const log: string[] = [];

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(log).toEqual(['mutate']);
  });

  it('does not tick on the fallback path — the caller’s own render will', () => {
    reducedMotion(false);
    const log: string[] = [];

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(log).not.toContain('tick');
  });

  it('runs the change inside the transition when the API is there', () => {
    reducedMotion(false);
    const log: string[] = [];
    const start = withApi(log);

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(start).toHaveBeenCalledOnce();
    expect(log).toEqual(['start', 'mutate', 'tick', 'returned']);
  });

  it('ticks after the mutation and before the callback returns, or both snapshots match', () => {
    reducedMotion(false);
    const log: string[] = [];
    withApi(log);

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(log.indexOf('mutate')).toBeLessThan(log.indexOf('tick'));
    expect(log.indexOf('tick')).toBeLessThan(log.indexOf('returned'));
  });

  it('skips the transition when the OS asked for less movement', () => {
    reducedMotion(true);
    const log: string[] = [];
    const start = withApi(log);

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(start).not.toHaveBeenCalled();
    expect(log).toEqual(['mutate']);
  });

  it('still makes the change under reduced motion — the opt-out is the animation, not the write', () => {
    reducedMotion(true);
    const log: string[] = [];
    withApi(log);

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(log).toContain('mutate');
  });

  it('calls the API on the document, not detached from it', () => {
    reducedMotion(false);
    const log: string[] = [];
    let receiver: unknown = null;
    doc.startViewTransition = function (this: unknown, callback: () => void) {
      receiver = this;
      callback();
      return { finished: Promise.resolve() };
    };

    withViewTransition(fakeAppRef(log), () => log.push('mutate'));

    expect(receiver).toBe(document);
  });
});
