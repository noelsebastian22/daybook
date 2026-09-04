import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Nav } from '../core/nav';
import { OfflineQueue } from '../core/offline-queue';
import { SessionStore } from '../core/session.store';
import { render, type Rendered } from '../../testing/render';
import { Shell } from './shell';
import { NAV_ITEMS } from './shell.data';

/**
 * The shell is one nav with two behaviours. The sheet has to close itself on
 * navigation or it covers the page it just moved to, and the drawer's collapse
 * has to survive the trip through `Nav`, which two other components read.
 */

@Component({
  selector: 'app-blank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>page</p>',
})
class Blank {}

interface FakeNav {
  collapsed: WritableSignal<boolean>;
  composerOpen: WritableSignal<boolean>;
  toggleCollapsed: ReturnType<typeof vi.fn>;
  openComposer: ReturnType<typeof vi.fn>;
}

let nav: FakeNav;
let signOut: ReturnType<typeof vi.fn>;
let pending: WritableSignal<number>;

async function renderShell(): Promise<Rendered<Shell>> {
  return render(Shell);
}

function labelled(shell: Rendered<Shell>, label: string): HTMLElement | undefined {
  return shell.queryAll('button, a').find((el) => el.getAttribute('aria-label') === label);
}

/** The destinations, which are the only links inside the drawer's list. */
function destinations(shell: Rendered<Shell>): HTMLElement[] {
  return shell.queryAll('nav ul li a');
}

describe('Shell', () => {
  beforeEach(() => {
    nav = {
      collapsed: signal(false),
      composerOpen: signal(false),
      toggleCollapsed: vi.fn(),
      openComposer: vi.fn(),
    };
    signOut = vi.fn();
    pending = signal(0);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'today', component: Blank },
          { path: 'upcoming', component: Blank },
          { path: 'calendar', component: Blank },
          { path: 'reporting', component: Blank },
          { path: 'settings', component: Blank },
        ]),
        { provide: Nav, useValue: nav },
        { provide: SessionStore, useValue: { signOut } },
        { provide: OfflineQueue, useValue: { pending } },
      ],
    });
  });

  it('offers the same four destinations the nav data declares', async () => {
    const shell = await renderShell();
    expect(destinations(shell).map((a) => (a.textContent ?? '').trim())).toEqual(
      NAV_ITEMS.map((item) => item.label),
    );
  });

  it('renders one navigation landmark, not one per breakpoint', async () => {
    const shell = await renderShell();
    const navs = shell.queryAll('nav');
    expect(navs).toHaveLength(1);
    expect(navs[0].getAttribute('aria-label')).toBe('Main');
  });

  it('keeps Settings and Sign out out of the destinations', async () => {
    const shell = await renderShell();
    const labels = destinations(shell).map((a) => (a.textContent ?? '').trim());
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Sign out');
    expect(shell.byText('a', 'Settings')).not.toBeNull();
    expect(shell.byText('button', 'Sign out')).not.toBeNull();
  });

  it('marks the destination the user is on as the current page', async () => {
    const shell = await renderShell();
    await TestBed.inject(Router).navigate(['/upcoming']);
    await shell.settle();

    const current = destinations(shell).filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => (a.textContent ?? '').trim())).toEqual(['Upcoming']);
  });

  it('jumps a keyboard user past the drawer without spending a history entry', async () => {
    const shell = await renderShell();
    const skip = shell.byText('a', 'Skip to content');
    expect(skip).not.toBeNull();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip?.dispatchEvent(event);
    await shell.settle();

    expect(event.defaultPrevented).toBe(true);
  });

  describe('the mobile sheet', () => {
    it('reports whether it is open on the control that opens it', async () => {
      const shell = await renderShell();
      const hamburger = labelled(shell, 'Open the menu');
      expect(hamburger?.getAttribute('aria-expanded')).toBe('false');

      await shell.click(hamburger as HTMLElement);
      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('puts a scrim up only while it is open', async () => {
      const shell = await renderShell();
      expect(labelled(shell, 'Close the menu')).toBeUndefined();

      await shell.click(labelled(shell, 'Open the menu') as HTMLElement);
      expect(labelled(shell, 'Close the menu')).toBeDefined();
    });

    it('closes when the scrim is pressed', async () => {
      const shell = await renderShell();
      await shell.click(labelled(shell, 'Open the menu') as HTMLElement);
      await shell.click(labelled(shell, 'Close the menu') as HTMLElement);

      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape', async () => {
      const shell = await renderShell();
      await shell.click(labelled(shell, 'Open the menu') as HTMLElement);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await shell.settle();

      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes itself on navigation, or it covers the page it just moved to', async () => {
      const shell = await renderShell();
      await shell.click(labelled(shell, 'Open the menu') as HTMLElement);
      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('true');

      await TestBed.inject(Router).navigate(['/calendar']);
      await shell.settle();

      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Add task', () => {
    it('asks Nav to open the composer, since the drawer is on every page', async () => {
      const shell = await renderShell();
      await shell.click(shell.byText('button', 'Add task') as HTMLElement);

      expect(nav.openComposer).toHaveBeenCalledTimes(1);
    });

    it('closes the sheet itself, because pressing it on Today fires no navigation', async () => {
      const shell = await renderShell();
      await shell.click(labelled(shell, 'Open the menu') as HTMLElement);
      await shell.click(shell.byText('button', 'Add task') as HTMLElement);

      expect(labelled(shell, 'Open the menu')?.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('the desktop collapse', () => {
    it('folds the drawer away through Nav, which toasts and the composer also read', async () => {
      const shell = await renderShell();
      await shell.click(labelled(shell, 'Collapse the sidebar') as HTMLElement);

      expect(nav.toggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('offers no way back in while the drawer is open', async () => {
      const shell = await renderShell();
      expect(labelled(shell, 'Expand the sidebar')).toBeUndefined();
    });

    it('offers a way back in once the drawer is folded away', async () => {
      const shell = await renderShell();
      nav.collapsed.set(true);
      await shell.settle();

      expect(labelled(shell, 'Expand the sidebar')).toBeDefined();
    });
  });

  describe('the offline queue banner', () => {
    it('stays out of the way when there is nothing waiting', async () => {
      const shell = await renderShell();
      expect(shell.el.textContent).not.toContain('waiting to sync');
    });

    it('counts one change in the singular', async () => {
      const shell = await renderShell();
      pending.set(1);
      await shell.settle();

      expect(shell.el.textContent).toContain('1 change waiting to sync');
    });

    it('counts several in the plural', async () => {
      const shell = await renderShell();
      pending.set(3);
      await shell.settle();

      expect(shell.el.textContent).toContain('3 changes waiting to sync');
    });

    it('announces itself politely rather than interrupting', async () => {
      const shell = await renderShell();
      pending.set(1);
      await shell.settle();

      expect(shell.query('[aria-live="polite"]')?.textContent).toContain('waiting to sync');
    });
  });

  it('signs out through the session store', async () => {
    const shell = await renderShell();
    await shell.click(shell.byText('button', 'Sign out') as HTMLElement);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('gives every icon-only control a name', async () => {
    const shell = await renderShell();
    const unnamed = shell
      .queryAll('button, a')
      .filter((el) => (el.textContent ?? '').trim() === '' && !el.getAttribute('aria-label'));

    expect(unnamed).toEqual([]);
  });

  it('hides the destination icons, since the link beside them is already the name', async () => {
    const shell = await renderShell();
    const exposed = destinations(shell)
      .flatMap((a) => [...a.querySelectorAll('svg')])
      .filter((svg) => svg.getAttribute('aria-hidden') !== 'true');

    expect(exposed).toEqual([]);
  });
});
