import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Daybook mark: yesterday's page behind today's, and a tick.
 *
 * Inlined rather than an `<img src="icon.svg">` so it costs no request and
 * inherits nothing it should not — the artwork is fixed-colour on purpose,
 * because the tick is the reserved completion green and must not drift.
 * `public/icon.svg` is the same drawing at 512 and is what the PNGs and the
 * favicon are built from; if one changes, change both.
 */
@Component({
  selector: 'app-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mark.html',
})
export class Mark {
  readonly size = input(32);

  /**
   * Two marks on one page would otherwise declare the same gradient id twice
   * and the second would win for both.
   */
  protected readonly gradientId = `mark-${Math.random().toString(36).slice(2, 9)}`;
}
