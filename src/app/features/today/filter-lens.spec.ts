import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '../../core/models';
import { makeCategory, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { FilterLens } from './filter-lens';

/**
 * The lens is the whole filter UI for Today, and its first job is to cost
 * nothing when nobody is filtering. Everything here is presentation: it holds
 * no filter state, it reports choices upward, and `TaskStore` stays the only
 * place a filter actually lives.
 *
 * The assertions deliberately never name a category by its position. A lens
 * that lists six categories and one that lists seven are two different
 * controls — the second one can be typed into — and the specs that tell them
 * apart use literal counts rather than importing the threshold, so moving it
 * has to break a test and be thought about.
 */

function categories(...names: string[]): Category[] {
  return names.map((name, i) =>
    makeCategory({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), sort_order: i }),
  );
}

const TWO = categories('Work', 'Home');

/** Six is the most the panel lays out flat. Seven is the first typeable one. */
const SIX = categories('Work', 'Home', 'Health', 'Admin', 'Errands', 'Reading');
const SEVEN = categories('Work', 'Home', 'Health', 'Admin', 'Errands', 'Reading', 'Workshop');

interface LensInputs {
  energy?: string;
  categoryId?: string | null;
  categories?: Category[];
}

async function renderLens({
  energy = 'all',
  categoryId = null,
  categories: cats = TWO,
}: LensInputs = {}): Promise<Rendered<FilterLens>> {
  return render(FilterLens, { inputs: { energy, categoryId, categories: cats } });
}

/** The only element carrying `aria-expanded`, so this needs no class name. */
function trigger(page: Rendered<FilterLens>): HTMLElement {
  const found = page.query('[aria-expanded]');
  if (!found) throw new Error('the lens has no trigger');
  return found;
}

async function open(page: Rendered<FilterLens>): Promise<HTMLElement> {
  await page.click(trigger(page));
  const panel = page.query('[role="dialog"]');
  if (!panel) throw new Error('the panel did not open');
  return panel;
}

/**
 * Matched exactly, not by `includes`: "Work" and "Workshop" are both in the
 * seven-category fixture precisely so a sloppy lookup here would pick the
 * wrong one and the search test would pass for the wrong reason.
 */
function option(panel: HTMLElement, label: string): HTMLElement {
  const found = Array.from(panel.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim().toLowerCase() === label.toLowerCase(),
  );
  if (!found) throw new Error(`no option named ${label}`);
  return found;
}

function optionNames(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
}

async function type(page: Rendered<FilterLens>, panel: HTMLElement, text: string): Promise<void> {
  const field = panel.querySelector('input');
  if (!field) throw new Error('the panel has no search field');
  field.value = text;
  field.dispatchEvent(new Event('input'));
  await page.settle();
}

describe('FilterLens', () => {
  beforeEach(() => resetIds());

  describe('at rest', () => {
    it('shows one closed control and no panel', async () => {
      const page = await renderLens();

      expect(page.query('[role="dialog"]')).toBeNull();
      expect(trigger(page).getAttribute('aria-expanded')).toBe('false');
    });

    it('says what it is, rather than relying on an icon alone', async () => {
      const page = await renderLens();

      expect(trigger(page).textContent?.trim()).toContain('Filter');
    });

    it('offers nothing to clear when nothing is filtering', async () => {
      const page = await renderLens();

      expect(page.query('[aria-label="Clear filters"]')).toBeNull();
    });
  });

  describe('the panel', () => {
    it('opens on the trigger', async () => {
      const page = await renderLens();

      await open(page);

      expect(trigger(page).getAttribute('aria-expanded')).toBe('true');
    });

    it('offers all three energies with the resting state first', async () => {
      const page = await renderLens();

      const panel = await open(page);

      expect(optionNames(panel).slice(0, 3)).toEqual(['All', 'Quick', 'Deep']);
    });

    it('offers every category it was given', async () => {
      const page = await renderLens({ categories: TWO });

      const panel = await open(page);

      expect(option(panel, 'Work')).toBeDefined();
      expect(option(panel, 'Home')).toBeDefined();
    });

    it('reports which energy is filtering', async () => {
      const page = await renderLens({ energy: 'quick' });

      const panel = await open(page);

      expect(option(panel, 'Quick').getAttribute('aria-pressed')).toBe('true');
      expect(option(panel, 'All').getAttribute('aria-pressed')).toBe('false');
    });

    it('reports which category is filtering', async () => {
      const page = await renderLens({ categories: TWO, categoryId: TWO[0].id });

      const panel = await open(page);

      expect(option(panel, 'Work').getAttribute('aria-pressed')).toBe('true');
      expect(option(panel, 'Home').getAttribute('aria-pressed')).toBe('false');
    });

    it('closes when the trigger is pressed again', async () => {
      const page = await renderLens();
      await open(page);

      await page.click(trigger(page));

      expect(page.query('[role="dialog"]')).toBeNull();
    });
  });

  describe('choosing', () => {
    it('reports the energy chosen', async () => {
      const page = await renderLens();
      const chosen = vi.fn();
      page.component.energyChange.subscribe(chosen);

      const panel = await open(page);
      await page.click(option(panel, 'Deep'));

      expect(chosen).toHaveBeenCalledWith('deep');
    });

    it('reports the category chosen', async () => {
      const page = await renderLens({ categories: TWO });
      const chosen = vi.fn();
      page.component.categoryChange.subscribe(chosen);

      const panel = await open(page);
      await page.click(option(panel, 'Home'));

      expect(chosen).toHaveBeenCalledWith(TWO[1].id);
    });

    it('clears the category already filtering, so no separate "All" is needed', async () => {
      const page = await renderLens({ categories: TWO, categoryId: TWO[0].id });
      const chosen = vi.fn();
      page.component.categoryChange.subscribe(chosen);

      const panel = await open(page);
      await page.click(option(panel, 'Work'));

      expect(chosen).toHaveBeenCalledWith(null);
    });

    /**
     * Energy and category are independent axes that AND together, so a panel
     * that closed on the first pick would make combining them a two-visit
     * job. It stays open; the backdrop, Escape and the trigger all dismiss it.
     */
    it('stays open so both axes can be set in one visit', async () => {
      const page = await renderLens();

      const panel = await open(page);
      await page.click(option(panel, 'Quick'));

      expect(page.query('[role="dialog"]')).not.toBeNull();
    });
  });

  describe('the summary', () => {
    it('names the energy filtering', async () => {
      const page = await renderLens({ energy: 'quick' });

      expect(trigger(page).textContent).toContain('Quick');
    });

    it('names the category filtering', async () => {
      const page = await renderLens({ categories: TWO, categoryId: TWO[0].id });

      expect(trigger(page).textContent).toContain('Work');
    });

    it('names both when both are filtering', async () => {
      const page = await renderLens({
        energy: 'deep',
        categories: TWO,
        categoryId: TWO[1].id,
      });

      expect(trigger(page).textContent).toContain('Deep');
      expect(trigger(page).textContent).toContain('Home');
    });

    it('stops saying "Filter" once it has something to report', async () => {
      const page = await renderLens({ energy: 'quick' });

      expect(trigger(page).textContent).not.toContain('Filter');
    });

    /**
     * The visible summary is the state, not the job. "Deep Work" announced on
     * its own is a button whose purpose has to be guessed, so while it is
     * filtering the trigger carries a label naming both — and the label keeps
     * the visible words inside it, which is what WCAG 2.5.3 asks for.
     */
    it('names its job as well as its state while filtering', async () => {
      const page = await renderLens({ energy: 'deep', categories: TWO, categoryId: TWO[0].id });

      expect(trigger(page).getAttribute('aria-label')).toBe('Filtering by Deep, Work');
    });

    it('names the one axis that is filtering, not both', async () => {
      const page = await renderLens({ energy: 'quick' });

      expect(trigger(page).getAttribute('aria-label')).toBe('Filtering by Quick');
    });

    it('needs no label of its own at rest, where the visible word is the name', async () => {
      const page = await renderLens();

      expect(trigger(page).getAttribute('aria-label')).toBeNull();
    });

    it('clears everything at once', async () => {
      const page = await renderLens({ energy: 'quick', categories: TWO, categoryId: TWO[0].id });
      const cleared = vi.fn();
      page.component.cleared.subscribe(cleared);

      await page.click(page.query('[aria-label="Clear filters"]') as HTMLElement);

      expect(cleared).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The arithmetic behind the threshold is in `today.constants.ts`. What
   * matters here is that the control changes shape rather than growing a
   * scrollbar or a third row of chips.
   */
  describe('at scale', () => {
    it('lays six categories out flat', async () => {
      const page = await renderLens({ categories: SIX });

      const panel = await open(page);

      expect(panel.querySelector('input')).toBeNull();
    });

    it('grows a search field at seven', async () => {
      const page = await renderLens({ categories: SEVEN });

      const panel = await open(page);

      expect(panel.querySelector('input')).not.toBeNull();
    });

    it('narrows the categories to what was typed', async () => {
      const page = await renderLens({ categories: SEVEN });
      const panel = await open(page);

      await type(page, panel, 'wo');

      expect(optionNames(panel)).toContain('Work');
      expect(optionNames(panel)).toContain('Workshop');
      expect(optionNames(panel)).not.toContain('Health');
    });

    it('keeps the energies reachable while the categories are narrowed', async () => {
      const page = await renderLens({ categories: SEVEN });
      const panel = await open(page);

      await type(page, panel, 'wo');

      expect(option(panel, 'Quick')).toBeDefined();
    });

    it('says so when nothing matches, rather than showing an empty panel', async () => {
      const page = await renderLens({ categories: SEVEN });
      const panel = await open(page);

      await type(page, panel, 'zzz');

      expect(panel.textContent).toContain('No categories match');
    });

    it('starts each visit with the search cleared', async () => {
      const page = await renderLens({ categories: SEVEN });
      const first = await open(page);
      await type(page, first, 'wo');
      await page.click(trigger(page));

      const second = await open(page);

      expect(optionNames(second)).toContain('Health');
    });
  });
});
