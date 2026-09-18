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

/**
 * Every endpoint an SVG path visits, absolute, in user units.
 *
 * Test-only, and it exists because the settings gear was drawn 1.6 units above
 * its own hub for months and no assertion in the app could see it — the eye
 * called it "skewed" and nothing else could. Handles the relative commands too
 * so it can measure a hand-written path as well as a generated one.
 */
function pathPoints(d: string): Array<[number, number]> {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  const points: Array<[number, number]> = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const n = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        x = rel ? x + n() : n();
        y = rel ? y + n() : n();
        break;
      case 'H':
        x = rel ? x + n() : n();
        break;
      case 'V':
        y = rel ? y + n() : n();
        break;
      case 'A':
        (n(), n(), n(), n(), n());
        x = rel ? x + n() : n();
        y = rel ? y + n() : n();
        break;
      case 'Z':
        continue;
      default:
        throw new Error(`pathPoints: unhandled command ${cmd}`);
    }
    points.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }

  return points;
}

/** Midpoint of a path's bounding box, which for a gear is where it looks centred. */
function bboxCentre(points: Array<[number, number]>): [number, number] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const mid = (v: number[]) => Math.round(((Math.min(...v) + Math.max(...v)) / 2) * 100) / 100;
  return [mid(xs), mid(ys)];
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

  /**
   * The lockup component already exists and welcome and login both use it.
   * The drawer and the mobile bar hand-rolled the word instead, which put a
   * second wordmark in the app set in a different face.
   */
  it('renders the wordmark only through the brand lockup', async () => {
    const shell = await renderShell();
    const looseWordmarks = shell
      .queryAll('*')
      .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() === 'Daybook')
      .filter((el) => !el.closest('app-logo'));

    expect(looseWordmarks).toEqual([]);
  });

  it('keeps Settings and Sign out out of the destinations', async () => {
    const shell = await renderShell();
    const labels = destinations(shell).map((a) => (a.textContent ?? '').trim());
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Sign out');
    expect(shell.byText('a', 'Settings')).not.toBeNull();
    expect(shell.byText('button', 'Sign out')).not.toBeNull();
  });

  describe('the settings gear', () => {
    function gear(shell: Rendered<Shell>): SVGElement {
      const svg = shell.byText('a', 'Settings')?.querySelector('svg');
      if (!svg) throw new Error('no settings icon');
      return svg;
    }

    /**
     * The gear body and the hole through it have to share a centre. They did
     * not: the body sat at y 10.4 with the hub at y 12, and the whole icon read
     * as leaning.
     */
    it('centres the gear body on its own hub', async () => {
      const shell = await renderShell();
      const svg = gear(shell);
      const body = svg.querySelector('path')?.getAttribute('d') ?? '';
      const hub = svg.querySelector('circle');

      expect(bboxCentre(pathPoints(body))).toEqual([
        Number(hub?.getAttribute('cx')),
        Number(hub?.getAttribute('cy')),
      ]);
    });

    /**
     * A gear is mirror-symmetric through its own axes whatever its tooth count,
     * so this is the general statement of "drawn correctly" and does not pin the
     * teeth at six. It is not the same claim as equal width and height: a gear
     * with a tooth pointing straight up is legitimately taller than it is wide.
     */
    it('is symmetric about both axes through the hub', async () => {
      const shell = await renderShell();
      const points = pathPoints(gear(shell).querySelector('path')?.getAttribute('d') ?? '');
      const visits = (x: number, y: number) =>
        points.some((p) => Math.abs(p[0] - x) < 0.02 && Math.abs(p[1] - y) < 0.02);

      expect(points.filter((p) => !visits(24 - p[0], p[1]))).toEqual([]);
      expect(points.filter((p) => !visits(p[0], 24 - p[1]))).toEqual([]);
    });

    /**
     * A subpath that ends somewhere other than where it began leaves `Z` to
     * draw a straight chord home, which eats whatever shape was in the gap.
     * The old path ended at 10.1,5.6 having started at 10.3,4.3, and lost a
     * lobe to it.
     */
    it('returns to where it started, so Z closes nothing visible', async () => {
      const shell = await renderShell();
      const points = pathPoints(gear(shell).querySelector('path')?.getAttribute('d') ?? '');

      expect(points.at(-1)).toEqual(points[0]);
    });
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

    /**
     * The drawer's copy is not reachable on a phone without opening the sheet
     * first, and the sheet is shut on every cold load. Finishing the day's last
     * task then left the app's primary action two taps away behind a menu.
     */
    it('offers an add outside the drawer, which on a phone is shut by default', async () => {
      const shell = await renderShell();
      const outside = shell
        .queryAll('button')
        .filter((b) => !b.closest('nav') && b.getAttribute('aria-label') === 'Add task');

      expect(outside).toHaveLength(1);

      await shell.click(outside[0]);
      expect(nav.openComposer).toHaveBeenCalledTimes(1);
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

    /**
     * Folding the drawer away also folds away the Add task inside it, so the
     * rail that carries the way back in carries the add as well. Asserted as a
     * sibling of the expand control rather than by count, because the mobile
     * bar's add is in the DOM at every width too.
     */
    it('puts an add on the rail beside the way back in', async () => {
      const shell = await renderShell();
      nav.collapsed.set(true);
      await shell.settle();

      const rail = labelled(shell, 'Expand the sidebar')?.parentElement;
      const add = [...(rail?.children ?? [])].find(
        (el) => el.getAttribute('aria-label') === 'Add task',
      );

      expect(add).toBeDefined();

      (add as HTMLElement).click();
      await shell.settle();
      expect(nav.openComposer).toHaveBeenCalledTimes(1);
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
