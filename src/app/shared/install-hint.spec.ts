import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Install } from '../core/install';
import { render, type Rendered } from '../../testing/render';
import { InstallHint } from './install-hint';

/**
 * The hint exists because "tap Share" is the instruction that already failed —
 * the control is an unlabelled icon, so the glyph is drawn in the sentence.
 */

let shouldHint: WritableSignal<boolean>;
let dismiss: ReturnType<typeof vi.fn>;

async function renderHint(): Promise<Rendered<InstallHint>> {
  return render(InstallHint);
}

describe('InstallHint', () => {
  beforeEach(() => {
    shouldHint = signal(false);
    dismiss = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: Install, useValue: { shouldHint: () => shouldHint(), dismiss } }],
    });
  });

  it('says nothing on a browser that cannot act on it', async () => {
    const hint = await renderHint();
    expect(hint.query('aside')).toBeNull();
  });

  it('appears once it is worth showing', async () => {
    const hint = await renderHint();
    shouldHint.set(true);
    await hint.settle();

    expect(hint.el.textContent).toContain('Add Daybook to your Home Screen');
  });

  it('names its own region by its heading', async () => {
    shouldHint.set(true);
    const hint = await renderHint();
    const aside = hint.query('aside');

    expect(aside?.getAttribute('aria-labelledby')).toBe('install-hint-title');
    expect(hint.query('#install-hint-title')?.textContent).toContain('Add Daybook');
  });

  it('draws the Share glyph but still says the word, so the sentence reads aloud', async () => {
    shouldHint.set(true);
    const hint = await renderHint();

    expect(hint.query('aside svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(hint.el.textContent).toContain('Share');
    expect(hint.el.textContent).toContain('Add to Home Screen');
  });

  it('gives the reason rather than a feature list', async () => {
    shouldHint.set(true);
    const hint = await renderHint();

    expect(hint.el.textContent).toContain('Reminders only work from the installed app');
  });

  it('can be dismissed, through a control that says so', async () => {
    shouldHint.set(true);
    const hint = await renderHint();
    const close = hint
      .queryAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Dismiss the install hint');

    expect(close).toBeDefined();
    await hint.click(close as HTMLElement);

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
