import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Theme, type ResolvedTheme, type ThemeChoice } from '../core/theme';
import { render, type Rendered } from '../../testing/render';
import { THEME_OPTIONS } from './theme-toggle.data';
import { ThemeToggle } from './theme-toggle';

/**
 * Three states, one of which is "ask someone else".
 *
 * That is the whole reason this is a popover of radios rather than a button
 * that cycles, and the reason it carries `aria-checked` rather than
 * `aria-pressed` — pressed is a two-state attribute and there is no honest way
 * to say "system, and system currently means dark" with it. The trigger is
 * icon-only, so its own label has to say the same thing in words.
 */

let choice: WritableSignal<ThemeChoice>;
let resolved: WritableSignal<ResolvedTheme>;
let set: ReturnType<typeof vi.fn>;

async function renderToggle(): Promise<Rendered<ThemeToggle>> {
  return render(ThemeToggle);
}

/** The trigger, which is always the first button on the page. */
function trigger(page: Rendered<ThemeToggle>): HTMLElement {
  const button = page.query('button');
  if (!button) throw new Error('no trigger');
  return button;
}

function radios(page: Rendered<ThemeToggle>): HTMLElement[] {
  return page.queryAll('[role="radio"]');
}

function radioNamed(page: Rendered<ThemeToggle>, label: string): HTMLElement {
  const found = radios(page).find((r) => (r.textContent ?? '').trim().startsWith(label));
  if (!found) throw new Error(`no option named ${label}`);
  return found;
}

async function open(page: Rendered<ThemeToggle>): Promise<void> {
  await page.click(trigger(page));
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    choice = signal<ThemeChoice>('light');
    resolved = signal<ResolvedTheme>('light');
    set = vi.fn((next: ThemeChoice) => choice.set(next));

    TestBed.configureTestingModule({
      providers: [{ provide: Theme, useValue: { choice, resolved, set } }],
    });
  });

  describe('the trigger', () => {
    it('says which theme is on, because there is no visible label to read', async () => {
      const page = await renderToggle();
      expect(trigger(page).getAttribute('aria-label')).toBe('Theme: light. Change the theme');
    });

    it('says what system currently resolves to, which the word alone does not', async () => {
      choice.set('system');
      resolved.set('dark');

      const page = await renderToggle();

      expect(trigger(page).getAttribute('aria-label')).toBe(
        'Theme: system, currently dark. Change the theme',
      );
    });

    it('follows the OS in its label while the choice is system', async () => {
      choice.set('system');
      resolved.set('light');
      const page = await renderToggle();

      resolved.set('dark');
      await page.settle();

      expect(trigger(page).getAttribute('aria-label')).toBe(
        'Theme: system, currently dark. Change the theme',
      );
    });

    it('shows the icon of whichever option is current', async () => {
      choice.set('dark');
      const page = await renderToggle();

      const dark = THEME_OPTIONS.find((o) => o.value === 'dark');
      expect(page.query('svg path')?.getAttribute('d')).toBe(dark?.icon);
    });

    it('reports whether the menu is open', async () => {
      const page = await renderToggle();
      expect(trigger(page).getAttribute('aria-expanded')).toBe('false');

      await open(page);

      expect(trigger(page).getAttribute('aria-expanded')).toBe('true');
    });

    it('opens a dialog, and says so before it is opened', async () => {
      const page = await renderToggle();
      expect(trigger(page).getAttribute('aria-haspopup')).toBe('dialog');
      expect(page.query('[role="dialog"]')).toBeNull();

      await open(page);

      expect(page.query('[role="dialog"]')).not.toBeNull();
    });
  });

  describe('the options', () => {
    it('is a radiogroup of three, not a row of toggles', async () => {
      const page = await renderToggle();
      await open(page);

      expect(page.query('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
      expect(radios(page)).toHaveLength(3);
    });

    it('lists light, then dark, then the deferral', async () => {
      const page = await renderToggle();
      await open(page);

      expect(radios(page).map((r) => r.querySelector('span')?.textContent?.trim())).toEqual([
        'Light',
        'Dark',
        'System',
      ]);
    });

    it('checks exactly one, and it is the current choice', async () => {
      choice.set('dark');
      const page = await renderToggle();
      await open(page);

      expect(radios(page).map((r) => r.getAttribute('aria-checked'))).toEqual([
        'false',
        'true',
        'false',
      ]);
    });

    it('never says aria-pressed, which cannot express a three-way choice', async () => {
      const page = await renderToggle();
      await open(page);

      expect(page.queryAll('[aria-pressed]')).toHaveLength(0);
    });

    it('says what system resolves to beside it, since the word does not', async () => {
      choice.set('system');
      resolved.set('dark');
      const page = await renderToggle();
      await open(page);

      expect(radioNamed(page, 'System').textContent).toContain('dark');
      expect(radioNamed(page, 'Light').textContent?.trim()).toBe('Light');
    });

    it('hands the choice to the service', async () => {
      const page = await renderToggle();
      await open(page);

      await page.click(radioNamed(page, 'Dark'));

      expect(set).toHaveBeenCalledWith('dark');
    });

    it('closes once a choice is made, because the question is answered', async () => {
      const page = await renderToggle();
      await open(page);

      await page.click(radioNamed(page, 'System'));

      expect(page.query('[role="radiogroup"]')).toBeNull();
      expect(trigger(page).getAttribute('aria-expanded')).toBe('false');
    });

    it('moves the check to the option that was just picked', async () => {
      const page = await renderToggle();
      await open(page);
      await page.click(radioNamed(page, 'Dark'));
      await open(page);

      expect(radioNamed(page, 'Dark').getAttribute('aria-checked')).toBe('true');
      expect(radioNamed(page, 'Light').getAttribute('aria-checked')).toBe('false');
    });

    it('closes on the backdrop without changing anything', async () => {
      const page = await renderToggle();
      await open(page);

      const backdrop = page
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Close the theme menu');
      await page.click(backdrop as HTMLElement);

      expect(page.query('[role="radiogroup"]')).toBeNull();
      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('the keyboard contract a radiogroup promises', () => {
    /**
     * `role="radiogroup"` is a promise about the keyboard, not just a label
     * for a screen reader. The group is ONE tab stop and the arrows move
     * within it. Three plain buttons are three tab stops, which is what this
     * was before — the roles and aria-checked were already correct, so it
     * announced "radio, 1 of 3" and then did not behave like one. Claiming
     * the role and not honouring it is worse than not claiming it.
     */
    it('is one tab stop: only the checked option is tabbable', async () => {
      choice.set('dark');
      const page = await renderToggle();
      await open(page);

      const stops = radios(page).map((r) => r.getAttribute('tabindex'));
      expect(stops).toEqual(['-1', '0', '-1']);
      expect(stops.filter((t) => t === '0')).toHaveLength(1);
    });

    it('moves the tab stop with the selection', async () => {
      choice.set('light');
      const page = await renderToggle();
      await open(page);

      expect(radioNamed(page, 'Light').getAttribute('tabindex')).toBe('0');
      expect(radioNamed(page, 'Dark').getAttribute('tabindex')).toBe('-1');
    });

    it('selects the next option on ArrowRight', async () => {
      choice.set('light');
      const page = await renderToggle();
      await open(page);

      page
        .query('[role="radiogroup"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await page.settle();

      expect(set).toHaveBeenCalledWith('dark');
    });

    it('wraps from the last option back to the first', async () => {
      // THEME_OPTIONS is [light, dark, system]; system is the last.
      choice.set(THEME_OPTIONS[THEME_OPTIONS.length - 1].value);
      const page = await renderToggle();
      await open(page);

      page
        .query('[role="radiogroup"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await page.settle();

      expect(set).toHaveBeenCalledWith(THEME_OPTIONS[0].value);
    });

    it('goes backwards on ArrowLeft, wrapping the other way', async () => {
      choice.set(THEME_OPTIONS[0].value);
      const page = await renderToggle();
      await open(page);

      page
        .query('[role="radiogroup"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await page.settle();

      expect(set).toHaveBeenCalledWith(THEME_OPTIONS[THEME_OPTIONS.length - 1].value);
    });

    it('jumps to the ends with Home and End', async () => {
      choice.set('dark');
      const page = await renderToggle();
      await open(page);
      const group = page.query('[role="radiogroup"]')!;

      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await page.settle();
      expect(set).toHaveBeenLastCalledWith(THEME_OPTIONS[0].value);

      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await page.settle();
      expect(set).toHaveBeenLastCalledWith(THEME_OPTIONS[THEME_OPTIONS.length - 1].value);
    });

    it('ignores keys that are not part of the pattern', async () => {
      const page = await renderToggle();
      await open(page);

      page
        .query('[role="radiogroup"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      await page.settle();

      expect(set).not.toHaveBeenCalled();
    });
  });
});
