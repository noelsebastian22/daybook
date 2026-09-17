import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, type Rendered } from '../../../testing/render';
import { TryPage } from './try-page';

/**
 * The welcome hero's live page.
 *
 * Unlike `welcome.spec.ts`, which stays away from copy on purpose, this file
 * does assert on the message strings — they are not decoration, they are the
 * component's entire output for three of its branches, and a demo that
 * silently stops explaining itself is the failure worth catching.
 *
 * The clock is pinned in every test. `TryPage` reads `today()` once at
 * construction, and "page N of 365", the date line and every "is this task
 * for another day" decision hang off it.
 *
 * `toFake: ['Date']` rather than the full timer set: the app is zoneless, so
 * `render()` waits on `fixture.whenStable()`, and faking the timers it waits
 * on hangs the spec instead of failing it.
 */

const REF = new Date(2026, 8, 17, 9, 0, 0); // Thursday 17 September 2026

async function renderPage(): Promise<Rendered<TryPage>> {
  return render(TryPage);
}

/** Type into the demo's input and submit the form, as a person would. */
async function type(page: Rendered<TryPage>, text: string): Promise<void> {
  const input = page.query('input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await page.settle();
  (page.query('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  await page.settle();
}

const rowText = (page: Rendered<TryPage>) =>
  page.queryAll('li').map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');

describe('TryPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REF);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on a real page, dated today, with something already carried', async () => {
    const page = await renderPage();

    expect(page.el.textContent).toContain('Thursday 17 September');
    // 17 September 2026 is the 260th day of a non-leap year.
    expect(page.el.textContent).toContain('page 260 of 365');
    expect(page.el.textContent).toContain('carried ×2');
  });

  it('adds a task typed in the app’s own syntax', async () => {
    const page = await renderPage();
    await type(page, 'water the plants #home !quick');

    expect(rowText(page).some((r) => r.includes('water the plants'))).toBe(true);

    // The tokens are lifted out of the text into real fields rather than
    // left sitting in it — the whole claim the hero makes. Asserted on the
    // model, not on the row's text: once the chips render as siblings the
    // row reads "water the plants #home !quick" either way, so the DOM
    // cannot tell a parsed task from an unparsed one.
    const added = page.component.tasks().at(-1);
    expect(added?.text).toBe('water the plants');
    expect(added?.category).toBe('home');
    expect(added?.energy).toBe('quick');
  });

  it('refuses an empty box, and a box with only tokens in it', async () => {
    const page = await renderPage();

    await type(page, '   ');
    expect(page.query('[aria-live="polite"]')?.textContent).toContain('Type a task first.');

    await type(page, '#home !quick');
    expect(page.query('[aria-live="polite"]')?.textContent).toContain('Give it a name as well.');
  });

  it('sends a task dated for another day to that day, and does not show it here', async () => {
    const page = await renderPage();
    await type(page, 'call the dentist monday');

    // Monday is not today, so the task is real but it went elsewhere —
    // exactly what the app does. Saying so is the honest demo.
    expect(page.query('[aria-live="polite"]')?.textContent).toContain("Monday's page");
    expect(rowText(page).some((r) => r.includes('call the dentist'))).toBe(false);
  });

  it('ticks and unticks, and says which it is doing', async () => {
    const page = await renderPage();
    const tick = page.queryAll('button[aria-pressed]')[0];

    expect(tick.getAttribute('aria-pressed')).toBe('false');
    expect(tick.getAttribute('aria-label')).toContain('Tick off');

    await page.click(tick);
    expect(page.queryAll('button[aria-pressed]')[0].getAttribute('aria-pressed')).toBe('true');
    expect(page.queryAll('button[aria-pressed]')[0].getAttribute('aria-label')).toContain('Untick');

    await page.click(page.queryAll('button[aria-pressed]')[0]);
    expect(page.queryAll('button[aria-pressed]')[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('carries the unticked forward and leaves the ticked behind', async () => {
    const page = await renderPage();

    // Tick "call physio", which is the one seeded as already carried twice.
    const physio = page.queryAll('li').findIndex((li) => li.textContent?.includes('call physio'));
    await page.click(page.queryAll('button[aria-pressed]')[physio]);

    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);

    const rows = rowText(page);
    expect(rows.some((r) => r.includes('call physio'))).toBe(false);
    expect(rows.some((r) => r.includes('book flights') && r.includes('carried ×1'))).toBe(true);
    expect(page.el.textContent).toContain('Friday 18 September');
  });

  it('increments a count that was already running', async () => {
    const page = await renderPage();
    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);

    // call physio arrives on 2, so it lands on 3 — which is what the
    // handwritten "third day running" beside it is counting.
    expect(rowText(page).some((r) => r.includes('call physio') && r.includes('carried ×3'))).toBe(
      true,
    );
  });

  it('goes back to today with the page as it was', async () => {
    const page = await renderPage();
    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);
    await page.click(page.byText('button', 'Back to today') as HTMLElement);

    expect(page.el.textContent).toContain('Thursday 17 September');
    expect(rowText(page).some((r) => r.includes('call physio') && r.includes('carried ×2'))).toBe(
      true,
    );
  });

  it('says the page is empty rather than showing nothing at all', async () => {
    const page = await renderPage();

    for (const tick of page.queryAll('button[aria-pressed]')) await page.click(tick);
    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);

    expect(page.el.textContent).toContain('Clean page. Nothing came with you.');
    expect(page.queryAll('li')).toHaveLength(0);
  });

  it('stops at six rows and says why', async () => {
    const page = await renderPage();

    // Three are seeded, so three more fill it and the seventh is refused.
    for (const text of ['one', 'two', 'three']) await type(page, text);
    expect(page.queryAll('li')).toHaveLength(6);

    await type(page, 'seven');
    expect(page.queryAll('li')).toHaveLength(6);
    expect(page.query('[aria-live="polite"]')?.textContent).toContain('That page is full.');
  });

  it('hints at the mechanic before you have used it, and stops once you have', async () => {
    const page = await renderPage();
    expect(page.query('[aria-live="polite"]')?.textContent).toContain(
      'Leave one unticked, then turn the page.',
    );

    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);
    expect(page.query('[aria-live="polite"]')?.textContent).not.toContain('Leave one unticked');
  });
});
