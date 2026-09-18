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

/**
 * Type into the demo's box and stop there, which is where the highlight and
 * the readout live. Everything they do has to happen before a submit or it is
 * not the feature.
 */
async function typeOnly(page: Rendered<TryPage>, text: string): Promise<void> {
  const box = page.query('textarea') as HTMLTextAreaElement;
  box.value = text;
  box.dispatchEvent(new Event('input'));
  await page.settle();
}

/** Type into the demo's box and submit the form, as a person would. */
async function type(page: Rendered<TryPage>, text: string): Promise<void> {
  await typeOnly(page, text);
  (page.query('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  await page.settle();
}

/**
 * Every run the mirror split the text into, in order.
 *
 * Asserted as text runs rather than by colour: the wash is a Tailwind class
 * and AGENTS.md rules those out, but the *splitting* is the behaviour — a
 * mirror that rendered the sentence as one run would be highlighting nothing
 * no matter what colour it painted.
 */
const mirrorRuns = (page: Rendered<TryPage>) =>
  page.queryAll('form [aria-hidden="true"] > span').map((s) => s.textContent ?? '');

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

  it('shows the time it understood, because the placeholder asked for one', async () => {
    const page = await renderPage();
    await type(page, 'water the plants 5pm');

    // The placeholder is literally "water the plants 5pm #home". Parsing the
    // time and then rendering nothing would under-sell the hero's one claim.
    expect(page.component.tasks().at(-1)?.text).toBe('water the plants');
    expect(rowText(page).at(-1)).toContain('5:00');
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

  it('empties the box once a task has gone somewhere', async () => {
    const page = await renderPage();

    // Caught in the browser, not here: under `[(ngModel)]` the signal
    // cleared and the input did not, so the page said "Saved to Monday's
    // page" with the sentence still sitting in the box, and the next Enter
    // filed it again. Asserting on the element's own value rather than on
    // the signal is the point — the signal was never the broken half.
    //
    // It happened a second time, in the browser again, when the box became a
    // mirror + textarea: `[value]="draft()"` does not put a textarea back
    // once a person has typed into it, so `add()` now clears the element as
    // well as the signal. **This assertion did not catch that and cannot.**
    // Setting `.value` and dispatching `input`, which is all a spec can do,
    // leaves Angular's binding able to write; only real keystrokes reproduce
    // it. Kept because the shape is right, not because it is load-bearing.
    await type(page, 'call the dentist monday');
    expect((page.query('textarea') as HTMLTextAreaElement).value).toBe('');

    await type(page, 'water the plants');
    expect((page.query('textarea') as HTMLTextAreaElement).value).toBe('');
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

  it('splits a date, a category and an energy out of the text as it is typed', async () => {
    const page = await renderPage();
    await typeOnly(page, 'water the plants 5pm #home !quick');

    // Each token is its own run, so each one can carry its own wash. The
    // plain text between them stays plain.
    const runs = mirrorRuns(page);
    expect(runs).toContain('water the plants ');
    expect(runs).toContain('5pm');
    expect(runs).toContain('#home');
    expect(runs).toContain('!quick');
  });

  it('shows the box empty-handed before anything is typed', async () => {
    const page = await renderPage();

    // The placeholder belongs to the mirror, not the textarea — the textarea's
    // text is transparent, so a native placeholder would be invisible.
    expect(mirrorRuns(page).join('')).toContain('water the plants 5pm #home');
  });

  it('says which day and time it understood, while you are still typing', async () => {
    const page = await renderPage();
    await typeOnly(page, 'call the dentist monday 5pm');

    // Recognition is the claim the hero makes. Highlighting says "something
    // was understood"; this says what.
    //
    // Asserted without the meridiem, as the seeded-time test above already
    // is. `toLocaleTimeString` renders it "pm" under this ICU build and "PM"
    // under others, and the case of two letters is not what is under test.
    expect(page.el.textContent).toContain('Monday, 5:00');
  });

  it('names the day it is already showing as today, not by its weekday', async () => {
    const page = await renderPage();
    await typeOnly(page, 'water the plants today 5pm');

    expect(page.el.textContent).toContain('today, 5:00');
    expect(page.el.textContent).not.toContain('Thursday, 5:00');
  });

  it('gives a day with no time, and a time with no day, separately', async () => {
    const page = await renderPage();

    await typeOnly(page, 'call the dentist monday');
    expect(page.el.textContent).toContain('Monday');
    expect(page.el.textContent).not.toContain('Monday,');

    await typeOnly(page, 'water the plants 5pm');
    expect(page.el.textContent).toContain('today, 5:00');
  });

  it('claims no day at all when no day was typed', async () => {
    const page = await renderPage();
    await typeOnly(page, 'water the plants');

    // The parser defaults `scheduled_date` to today whether or not a date was
    // typed, so a readout driven off that value alone would assert "today"
    // over every keystroke of every task. It is driven off the date *token*.
    expect(page.el.textContent).not.toContain('→');
    expect(page.query('[aria-live="polite"]')?.textContent).toContain('Leave one unticked');
  });

  it('keeps the running readout out of the live region', async () => {
    const page = await renderPage();
    await typeOnly(page, 'call the dentist monday 5pm');

    // A polite region that re-announces on every keystroke is unusable. The
    // outcome is announced there on submit instead, which is the moment that
    // actually carries news.
    expect(page.query('[aria-live="polite"]')?.textContent).not.toContain('Monday');
    expect(page.el.textContent).toContain('Monday, 5:00');
  });

  it('stands the readout down once the task has gone somewhere', async () => {
    const page = await renderPage();
    await type(page, 'call the dentist monday 5pm');

    expect(page.query('[aria-live="polite"]')?.textContent).toContain("Monday's page");
    expect(page.el.textContent).not.toContain('→');
  });

  it('turns the whole card, and does not name its rows', async () => {
    const page = await renderPage();

    // The card is one `view-transition-name`, so the browser has two
    // snapshots of it to rotate. A row carrying its own name would be lifted
    // out of the card's snapshot by spec and animate separately — visibly,
    // as rows floating over a turning card.
    expect(page.query('.try-card')).not.toBeNull();
    expect(page.queryAll('li').every((li) => li.getAttribute('style') === null)).toBe(true);

    // What the turn direction is selected on. Forward and back have to differ
    // or a back button that turns the same way as forward reads as broken.
    expect(page.query('.try-card')?.classList.contains('is-flipped')).toBe(false);

    await page.click(page.byText('button', 'Flip to tomorrow') as HTMLElement);
    expect(page.query('.try-card')?.classList.contains('is-flipped')).toBe(true);

    await page.click(page.byText('button', 'Back to today') as HTMLElement);
    expect(page.query('.try-card')?.classList.contains('is-flipped')).toBe(false);
  });
});
