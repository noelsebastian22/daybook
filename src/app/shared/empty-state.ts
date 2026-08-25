import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
  template: `
    <div class="rounded-panel border-2 border-dashed border-ink-200 px-6 py-10 text-center">
      <svg
        viewBox="0 0 168 128"
        class="mx-auto h-28 w-auto"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <!-- the ground every scene sits on, so they share a horizon -->
        <ellipse cx="84" cy="116" rx="46" ry="5" fill="#eceef6" />

        @switch (scene()) {
          @case ('clear') {
            <!-- a finished page: every row struck through and ticked -->
            <g>
              <rect
                x="46"
                y="14"
                width="76"
                height="96"
                rx="10"
                fill="#fff"
                stroke="#d6dae9"
                stroke-width="2"
              />
              <path d="M58 30h30" stroke="#d6dae9" stroke-width="3" />
              @for (row of rows; track row) {
                <path [attr.d]="'M74 ' + row + 'h34'" stroke="#eceef6" stroke-width="4" />
                <path
                  [attr.d]="'M58 ' + row + 'l3.5 3.5L68 ' + (row - 5)"
                  stroke="#10b981"
                  stroke-width="3"
                />
              }
            </g>
          }

          @case ('blank') {
            <!-- an unwritten page, with the caret waiting on the first line -->
            <g>
              <rect
                x="46"
                y="14"
                width="76"
                height="96"
                rx="10"
                fill="#fff"
                stroke="#d6dae9"
                stroke-width="2"
              />
              <path d="M58 30h30" stroke="#d6dae9" stroke-width="3" />
              <!-- the caret sits on the first ruled line, not above it -->
              <path d="M60 52v14" stroke="#6366f1" stroke-width="3" />
              <path d="M70 59h38M58 78h52M58 94h34" stroke="#eceef6" stroke-width="4" />
            </g>
          }

          @case ('filtered') {
            <!--
              Two full pages behind an empty one. The tasks did not go
              anywhere; the page in front is just the wrong page to be
              looking at.
            -->
            <g>
              <rect
                x="16"
                y="26"
                width="62"
                height="80"
                rx="9"
                fill="#f6f7fb"
                stroke="#d6dae9"
                stroke-width="2"
                transform="rotate(-14 47 66)"
              />
              <path
                d="M27 54h30M27 68h22M27 82h26"
                stroke="#d6dae9"
                stroke-width="3.5"
                transform="rotate(-14 47 66)"
              />
              <rect
                x="90"
                y="26"
                width="62"
                height="80"
                rx="9"
                fill="#f6f7fb"
                stroke="#d6dae9"
                stroke-width="2"
                transform="rotate(14 121 66)"
              />
              <path
                d="M101 54h30M101 68h22M101 82h26"
                stroke="#d6dae9"
                stroke-width="3.5"
                transform="rotate(14 121 66)"
              />
              <rect
                x="53"
                y="18"
                width="62"
                height="88"
                rx="10"
                fill="#fff"
                stroke="#6366f1"
                stroke-width="2"
              />
              <path d="M64 32h26" stroke="#e0e7ff" stroke-width="3" />
            </g>
          }

          @case ('quiet') {
            <!--
              A page that was never written on. Dashed, the same way the
              calendar draws a day with no snapshot as a hairline rather than
              a zero — an absence of a record, not a record of nothing.
            -->
            <g>
              <rect
                x="46"
                y="14"
                width="76"
                height="96"
                rx="10"
                fill="#fff"
                stroke="#d6dae9"
                stroke-width="2"
                stroke-dasharray="7 6"
              />
              <path d="M58 30h30" stroke="#eceef6" stroke-width="3" />
            </g>
          }
        }
      </svg>

      <p class="mt-4 font-medium text-ink-600">{{ title() }}</p>

      <div class="mt-3 empty:hidden">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly scene = input.required<EmptyScene>();
  readonly title = input.required<string>();

  /** Baselines for the three ticked rows in the `clear` scene. */
  protected readonly rows = [52, 72, 92];
}
