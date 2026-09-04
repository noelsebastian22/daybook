import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Popover } from './popover';
import { Theme, type ThemeChoice } from '../core/theme';
import { THEME_OPTIONS } from './theme-toggle.data';

/**
 * Light / dark / system, in the top right corner.
 *
 * A popover with three options rather than a button that cycles. A cycling
 * button cannot show what "system" means — it has one icon for three states,
 * so the only way to find out what the next press does is to press it, and
 * the only way back is to go round again. Three visible options say what the
 * choices are and which one is current.
 *
 * `aria-pressed` is wrong here for the same reason: it is a two-state
 * attribute and this is a three-state choice. The options are radios in a
 * radiogroup, and the trigger carries the current state in its own label
 * because it is icon-only.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover],
  templateUrl: './theme-toggle.html',
})
export class ThemeToggle {
  protected readonly theme = inject(Theme);
  protected readonly open = signal(false);
  protected readonly options = THEME_OPTIONS;

  /** Which of the three options the trigger icon is showing. */
  protected readonly activeIndex = computed(() =>
    this.options.findIndex((o) => o.value === this.theme.choice()),
  );

  /**
   * "System" alone does not tell anyone what they are looking at, so the
   * label says what it resolved to as well.
   */
  protected readonly triggerLabel = computed(() => {
    const choice = this.theme.choice();
    if (choice === 'system') return `Theme: system, currently ${this.theme.resolved()}`;
    return `Theme: ${choice}`;
  });

  protected choose(choice: ThemeChoice): void {
    this.theme.set(choice);
    this.open.set(false);
  }
}
