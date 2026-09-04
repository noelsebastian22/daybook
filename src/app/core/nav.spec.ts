import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Nav } from './nav';

const KEY = 'daybook.nav.v1';

@Component({
  selector: 'app-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class Blank {}

/** A macrotask, so a router navigation started but not awaited can finish. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Nav', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'today', component: Blank },
          { path: 'calendar', component: Blank },
        ]),
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('the drawer', () => {
    it('starts open', () => {
      expect(TestBed.inject(Nav).collapsed()).toBe(false);
    });

    it('remembers being folded away', () => {
      TestBed.inject(Nav).toggleCollapsed();

      expect(localStorage.getItem(KEY)).toBe('collapsed');
    });

    it('reads the stored preference back on the next page load', () => {
      localStorage.setItem(KEY, 'collapsed');

      expect(TestBed.inject(Nav).collapsed()).toBe(true);
    });

    it('records being opened again, rather than only being closed', () => {
      localStorage.setItem(KEY, 'collapsed');
      const nav = TestBed.inject(Nav);

      nav.toggleCollapsed();

      expect(nav.collapsed()).toBe(false);
      expect(localStorage.getItem(KEY)).toBe('open');
    });

    it('still toggles when storage is unavailable', () => {
      // Safari in private mode throws on read as well as on write, and a
      // preference that cannot be saved is not worth failing a click over.
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('private mode');
        },
        setItem: () => {
          throw new Error('private mode');
        },
      });
      const nav = TestBed.inject(Nav);

      expect(nav.collapsed()).toBe(false);
      nav.toggleCollapsed();
      expect(nav.collapsed()).toBe(true);
    });

    it('is not scoped to a user, because it describes the screen', () => {
      // Deliberately unlike `daybook.queue.v1.<uid>`: two accounts sharing one
      // laptop should share whether the sidebar is folded away.
      TestBed.inject(Nav).toggleCollapsed();

      expect(localStorage.length).toBe(1);
      expect(localStorage.key(0)).toBe(KEY);
    });
  });

  describe('the composer', () => {
    it('starts closed', () => {
      expect(TestBed.inject(Nav).composerOpen()).toBe(false);
    });

    it('closes when the user leaves the page it belongs to', async () => {
      // Otherwise opening it, going to Calendar and coming back finds it still
      // open over a list nobody asked to add to.
      const nav = TestBed.inject(Nav);
      await TestBed.inject(Router).navigate(['/today']);
      nav.composerOpen.set(true);

      await TestBed.inject(Router).navigate(['/calendar']);

      expect(nav.composerOpen()).toBe(false);
    });

    it('opens on Today from wherever the button was pressed', async () => {
      // The drawer button works from every page, and Today is the only list
      // that is always the right answer.
      const router = TestBed.inject(Router);
      const nav = TestBed.inject(Nav);
      await router.navigate(['/calendar']);

      nav.openComposer();
      await tick();

      expect(router.url).toBe('/today');
      expect(nav.composerOpen()).toBe(true);
    });
  });
});
