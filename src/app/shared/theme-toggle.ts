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

  /**
   * Opens onto the **checked** option, not the first one.
   *
   * `Popover` focuses the first button it finds, which is the right default
   * for a menu but wrong for a radiogroup: focus would land on "Light" while
   * "Dark" was the checked tab stop, and the first arrow press would then move
   * the selection from Dark rather than from the option under focus. Focus and
   * selection have to start on the same option or the group behaves oddly
   * exactly once, on first open, which is the hardest kind of bug to report.
   */
  protected toggle(): void {
    const opening = !this.open();
    this.open.set(opening);
    if (opening) this.focusOption(this.activeIndex());
  }

  /**
   * A radiogroup is **one** tab stop, not three.
   *
   * Declaring `role="radiogroup"` promises the roving-tabindex contract:
   * Tab moves past the whole group, and Left/Right (or Up/Down) move the
   * selection inside it. Three plain buttons are three tab stops, which is
   * what the markup did before this — the roles and `aria-checked` were
   * right, so a screen reader announced "radio, 1 of 3" and then the keyboard
   * did not behave like one, which is worse than not claiming the role.
   *
   * Only the checked option is tabbable; the rest are `-1` and reached with
   * the arrows. See `tabIndexFor`.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const jump = { Home: 0, End: this.options.length - 1 }[event.key];

    let next: number;
    if (step !== undefined) {
      // Wraps, which is what the pattern specifies for a radiogroup.
      next = (this.activeIndex() + step + this.options.length) % this.options.length;
    } else if (jump !== undefined) {
      next = jump;
    } else {
      return;
    }

    event.preventDefault();
    // Selection follows focus, so arrowing previews each theme as you go —
    // the choice is instantly visible and instantly reversible, which is the
    // case the pattern intends it for.
    this.theme.set(this.options[next].value);
    this.focusOption(next);
  }

  /** Roving tabindex: the checked option is the group's single tab stop. */
  protected tabIndexFor(choice: ThemeChoice): number {
    return choice === this.theme.choice() ? 0 : -1;
  }

  private focusOption(index: number): void {
    // The list is re-rendered by the signal write above, so focus has to wait
    // for that; a microtask is enough because the app is zoneless and the
    // render is synchronous with the effect flush.
    queueMicrotask(() => {
      const group = document.querySelector('[role="radiogroup"][aria-label="Theme"]');
      group?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
    });
  }
}
