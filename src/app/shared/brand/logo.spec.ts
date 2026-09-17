import { describe, expect, it } from 'vitest';

import { render } from '../../../testing/render';
import { Logo } from './logo';

/**
 * Standing alone the mark IS the name, so it takes `role="img"` and the label.
 * In the lockup the word "Daybook" is real text beside it, and a screen reader
 * announcing both would say the name twice.
 */

async function renderLogo(inputs: Record<string, unknown> = {}) {
  return render(Logo, { inputs });
}

describe('Logo', () => {
  it('is the name when it stands on its own', async () => {
    const logo = await renderLogo({ variant: 'mark' });
    const svg = logo.query('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Daybook');
  });

  it('steps aside in the lockup, where the word is already there as text', async () => {
    const logo = await renderLogo({ variant: 'lockup' });
    const svg = logo.query('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    expect(logo.el.textContent).toContain('Daybook');
  });

  it('says the name exactly once in the lockup', async () => {
    const logo = await renderLogo({ variant: 'lockup' });
    const labelled = logo.queryAll('[aria-label]');
    expect(labelled).toEqual([]);
  });

  it('draws no wordmark on the bare mark', async () => {
    const logo = await renderLogo({ variant: 'mark' });
    expect(logo.query('span')).toBeNull();
  });

  it('renders at the size it was given', async () => {
    const logo = await renderLogo({ size: 48 });
    expect(logo.query('svg')?.getAttribute('width')).toBe('48');
    expect(logo.query('svg')?.getAttribute('height')).toBe('48');
  });

  // `svg > rect` is the tile and only the tile: the three task lines are rects
  // too, but they live inside the <g> that carries the mark's fill.
  it('wears its tile only in the primary tone', async () => {
    const primary = await renderLogo({ tone: 'primary' });
    expect(primary.query('svg > rect')).not.toBeNull();

    for (const tone of ['light', 'dark', 'mono']) {
      const flat = await renderLogo({ tone });
      expect(flat.query('svg > rect')).toBeNull();
    }
  });

  it('crops to the artwork when there is no tile to pad', async () => {
    const primary = await renderLogo({ tone: 'primary' });
    const flat = await renderLogo({ tone: 'light' });

    expect(flat.query('svg')?.getAttribute('viewBox')).not.toBe(
      primary.query('svg')?.getAttribute('viewBox'),
    );
  });

  it('inherits the surface colour only under mono', async () => {
    const mono = await renderLogo({ tone: 'mono' });
    expect(mono.query('svg g')?.getAttribute('fill')).toBe('currentColor');

    const dark = await renderLogo({ tone: 'dark' });
    expect(dark.query('svg g')?.getAttribute('fill')).not.toBe('currentColor');
  });
});

// Removed with the gradient, 17 Sep 2026: "gives each gradient its own id, or
// the second one wins for both". Two primary logos on one page shared a
// `linearGradient` id and the second definition won for both, so the component
// minted a random id per instance. A flat coral tile has no id to collide, the
// `gradientId` field is gone, and a test for a bug that can no longer be
// written is worse than no test.
