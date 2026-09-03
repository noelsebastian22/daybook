import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CLEAR_ROWS } from './empty-state.data';

/**
 * Which scene to draw. Each one is a page from the app's own world rather
 * than generic clipart, because "empty" here always means something specific
 * about a *day*, and a shrugging box would not say which.
 */
export type EmptyScene =
  /** Everything on the page is ticked. */
  | 'clear'
  /** A page nothing has been written on yet. */
  | 'blank'
  /** There are tasks, a filter is hiding them. */
  | 'filtered'
  /** A day with nothing on it — past and unrecorded, or future and unplanned. */
  | 'quiet';

/**
 * The empty state (BUILD-PLAN §5 feature 16).
 *
 * Drawn as inline SVG rather than generated raster art. The plan called for
 * AI-generated illustrations; line drawings in the app's own palette beat a
 * bitmap here on every axis that matters for this app — they scale to any
 * screen, weigh a few hundred bytes inside a bundle the service worker
 * already caches, need no network on a cold offline load, and cannot drift
 * out of step with the palette the way a baked-in PNG would. Recorded in
 * BUILD-PLAN §9.
 *
 * The drawings are strokes on the `ink` scale with one brand accent. Green
 * appears only on a tick, which is the one thing entitled to it (AGENTS.md).
 *
 * Content goes in via projection so the copy lives with the page that knows
 * what it means:
 *
 * ```html
 * <app-empty-state scene="clear" title="All clear for today.">
 *   <button>Add another</button>
 * </app-empty-state>
 * ```
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.html',
})
export class EmptyState {
  readonly scene = input.required<EmptyScene>();
  readonly title = input.required<string>();

  protected readonly rows = CLEAR_ROWS;
}
