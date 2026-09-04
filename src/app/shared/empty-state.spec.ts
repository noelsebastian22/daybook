import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { render, type Rendered } from '../../testing/render';
import { EmptyState, type EmptyScene } from './empty-state';

/**
 * Four emptinesses that do not mean the same thing, so each gets its own
 * drawing. The sentence beneath carries the argument as real text, which is
 * why the drawing itself is decoration.
 */

const SCENES: EmptyScene[] = ['clear', 'blank', 'filtered', 'quiet'];

async function renderScene(scene: EmptyScene, title = 'All clear for today.') {
  return render(EmptyState, { inputs: { scene, title } });
}

@Component({
  selector: 'app-empty-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <app-empty-state [scene]="scene()" [title]="title()">
      <button type="button">Clear filters</button>
    </app-empty-state>
  `,
})
class EmptyHost {
  readonly scene = input<EmptyScene>('filtered');
  readonly title = input('Nothing matches that filter today.');
}

describe('EmptyState', () => {
  it('says what the emptiness means', async () => {
    const state = await renderScene('clear', 'All clear for today.');
    expect(state.el.textContent).toContain('All clear for today.');
  });

  it('hides the drawing, because the sentence beside it already makes the argument', async () => {
    for (const scene of SCENES) {
      const state = await renderScene(scene);
      expect(state.query('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('labels no individual shape, only the whole', async () => {
    const state = await renderScene('filtered');
    const labelled = state.queryAll('svg *').filter((el) => el.getAttribute('aria-label'));
    expect(labelled).toEqual([]);
  });

  it('draws a different picture for every kind of emptiness', async () => {
    const drawings = new Map<EmptyScene, string>();
    for (const scene of SCENES) {
      const state = await renderScene(scene);
      const drawn = state.query('svg g');
      expect(drawn).not.toBeNull();
      drawings.set(scene, drawn?.innerHTML ?? '');
    }

    expect(new Set(drawings.values()).size).toBe(SCENES.length);
  });

  it('draws exactly one scene at a time', async () => {
    const state = await renderScene('blank');
    expect(state.queryAll('svg g')).toHaveLength(1);
  });

  it('projects the way out the page offers', async () => {
    const host: Rendered<EmptyHost> = await render(EmptyHost);
    expect(host.byText('button', 'Clear filters')).not.toBeNull();
  });
});
