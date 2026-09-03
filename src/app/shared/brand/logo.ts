import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The Daybook logo.
 *
 * Direction 01, "carry forward": three task lines and a sweep that carries the
 * unfinished one out of the frame. Source art and the rejected directions are
 * in `docs/reference/brand/`; `public/icon.svg` is the same drawing at 512 and
 * is what the PNGs and the favicon are built from. If the geometry here
 * changes, change that file too — nothing regenerates it automatically.
 *
 * The colours are literals rather than theme classes on purpose. A logo that
 * inherits is a logo that drifts, and these three values ARE `brand-700`,
 * `brand-500` and `ink-50` — see `src/styles.css`. `tone="mono"` is the one
 * escape hatch, and it inherits deliberately.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logo.html',
  // The gap scales with `size`, so it is a binding rather than a class. No
  // component stylesheet: this app is utility-first and one declaration does
  // not earn a .css file.
  host: { class: 'inline-flex items-center', '[style.gap]': 'gap()' },
})
export class Logo {
  /** 'mark' is the square glyph; 'lockup' is glyph + "Daybook" wordmark. */
  readonly variant = input<'mark' | 'lockup'>('mark');
  /** 'primary' = indigo on its own tile. 'light'/'dark'/'mono' are flat. */
  readonly tone = input<'primary' | 'light' | 'dark' | 'mono'>('primary');
  /** Rendered height in px. Width follows the aspect ratio. */
  readonly size = input<number>(32);

  /**
   * `primary` keeps the full 512 tile, padding and all, because that padding
   * is the app-icon safe zone and cropping it would break the one place the
   * artwork is allowed to be an icon. The flat tones have no tile to pad, so
   * they crop to the artwork's own bounds — x 132..369, y 119..389, squared
   * off about its centre. Without that crop a flat mark at 20px would draw
   * ten pixels of glyph inside twenty pixels of nothing.
   */
  protected readonly box = computed(() =>
    this.tone() === 'primary' ? '0 0 512 512' : '115.5 119 270 270',
  );

  /** What the three lines and the sweep are painted in. */
  protected readonly ink = computed(() => {
    switch (this.tone()) {
      case 'primary':
      case 'light':
        return '#f6f7fb';
      case 'dark':
        return '#171a2b';
      default:
        return 'currentColor';
    }
  });

  /** The wordmark follows the mark, except under `primary`, where the tile
   * carries the brand and the word is free to take the surface's text colour. */
  protected readonly wordColor = computed(() =>
    this.tone() === 'primary' ? 'currentColor' : this.ink(),
  );

  /**
   * Wordmark size, derived rather than picked, so the lockup holds its
   * proportions at every `size` and under every tone.
   *
   * In the reference lockup the wordmark's cap height is 0.754x the height of
   * the drawn artwork. Under `primary` that artwork is only 270/512 of the
   * tile, which is why the multiplier halves there. 0.72 is the cap height of
   * the system stack as a fraction of its font size.
   */
  protected readonly wordPx = computed(() => {
    const art = this.tone() === 'primary' ? this.size() * (270 / 512) : this.size();
    return Math.round(art * (0.754 / 0.72) * 10) / 10;
  });

  /**
   * Clear space between mark and word, 0.28 of the mark box — the gap the
   * reference lockup uses. It is artwork geometry, not layout spacing, so it
   * is exempt from the 1/2/3/4/6/8 scale the way the chart bar caps are
   * exempt from the radius scale.
   */
  protected readonly gap = computed(() => `${Math.round(this.size() * 0.28)}px`);

  /**
   * Two logos on one page would otherwise declare the same gradient id twice
   * and the second would win for both.
   */
  protected readonly gradientId = `logo-${Math.random().toString(36).slice(2, 9)}`;
}
