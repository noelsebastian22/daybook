import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { describe, expect, it, vi } from 'vitest';
import { HARD_LOAD, unknownRouteGuard } from './unknown-route.guard';

const URL_IN = '/access/decide#token=abc123';

/**
 * `newer` is what activateUpdate() reports: whether this tab moved onto a
 * newer version than the one it was running.
 */
function setup(sw: { isEnabled: boolean; newer?: boolean; fails?: boolean }) {
  const hardLoad = vi.fn();
  const swUpdate = {
    isEnabled: sw.isEnabled,
    checkForUpdate: vi.fn(async () => {
      if (sw.fails) throw new Error('no worker');
      return !!sw.newer;
    }),
    activateUpdate: vi.fn(async () => !!sw.newer),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SwUpdate, useValue: swUpdate },
      { provide: HARD_LOAD, useValue: hardLoad },
    ],
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      unknownRouteGuard({} as ActivatedRouteSnapshot, { url: URL_IN } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  return { run, hardLoad, swUpdate };
}

const isToday = (result: boolean | UrlTree) =>
  result instanceof UrlTree && result.toString() === '/today';

describe('unknownRouteGuard', () => {
  // The 3 Oct case: the email linked to /access/decide, the tab was still
  // running the build from before that route existed, and it fell through
  // to /today with the token hanging off the end.
  it('reloads onto a newer version at the same URL, fragment and all', async () => {
    const { run, hardLoad } = setup({ isEnabled: true, newer: true });
    const result = await run();
    expect(hardLoad).toHaveBeenCalledWith(URL_IN);
    expect(result).toBe(false);
  });

  // Also the loop guard: after the reload the new version is current, so a
  // URL that is unknown to it too lands here and goes to /today.
  it('goes to /today when there is nothing newer', async () => {
    const { run, hardLoad } = setup({ isEnabled: true, newer: false });
    expect(isToday(await run())).toBe(true);
    expect(hardLoad).not.toHaveBeenCalled();
  });

  it('goes to /today with no service worker at all', async () => {
    const { run, hardLoad, swUpdate } = setup({ isEnabled: false });
    expect(isToday(await run())).toBe(true);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(hardLoad).not.toHaveBeenCalled();
  });

  it('goes to /today when the worker cannot be asked', async () => {
    const { run, hardLoad } = setup({ isEnabled: true, fails: true });
    expect(isToday(await run())).toBe(true);
    expect(hardLoad).not.toHaveBeenCalled();
  });
});
