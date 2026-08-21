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
  template: `
    <svg
      viewBox="0 0 512 512"
      [attr.width]="size()"
      [attr.height]="size()"
      role="img"
      aria-label="Daybook"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4338ca" />
          <stop offset="1" stop-color="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" [attr.fill]="'url(#' + gradientId + ')'" />
      <rect x="126" y="118" width="196" height="244" rx="32" fill="#ffffff" opacity="0.36" />
      <rect x="190" y="150" width="196" height="244" rx="32" fill="#ffffff" />
      <path
        d="M236 274 L272 310 L342 226"
        fill="none"
        stroke="#10b981"
        stroke-width="30"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
})
export class Mark {
  readonly size = input(32);

  /**
   * Two marks on one page would otherwise declare the same gradient id twice
   * and the second would win for both.
   */
  protected readonly gradientId = `mark-${Math.random().toString(36).slice(2, 9)}`;
}
