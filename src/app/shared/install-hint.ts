import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Install } from '../core/install';

/**
 * How to add Daybook to the iOS home screen.
 *
 * iOS is the only platform that offers no install affordance at all — no
 * `beforeinstallprompt`, no address-bar button, nothing but an entry partway
 * down the Share sheet. Noel could not find it on 22 Aug and it had to be
 * talked through; this is that conversation, in the app.
 *
 * The Share glyph is drawn inline in the sentence rather than named, because
 * "tap Share" is exactly the instruction that already failed — the control is
 * an icon with no label, and the icon is the part you have to recognise.
 *
 * It sits in the flow at the top of the page instead of floating, so it can
 * never land on top of the composer or the toasts, both of which are pinned to
 * the bottom of the viewport.
 */
@Component({
  selector: 'app-install-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './install-hint.html',
})
export class InstallHint {
  protected readonly install = inject(Install);
}
