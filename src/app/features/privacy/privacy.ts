import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/brand/logo';

/** Where every privacy question goes. Also the address deletion requests come from. */
export const PRIVACY_CONTACT = 'noel@noel-sebastian.com';

/**
 * Bump when the policy text changes in substance, not for a typo. Printed at
 * the top of the page.
 */
export const PRIVACY_UPDATED = '20 October 2026';

/**
 * What Daybook keeps, where it goes, and how to get it removed.
 *
 * Exists for people first and for Google brand verification second: the
 * OAuth consent screen needs a privacy URL on the app's own domain before
 * Google will show "Daybook" instead of the Supabase host. BUILD-PLAN §9.
 *
 * Every claim on the page is something the code or the infrastructure
 * actually does, checked 20 Oct. **A change that adds a processor, a tracker,
 * or a new kind of stored data has to change this page in the same commit.**
 */
@Component({
  selector: 'app-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Logo],
  templateUrl: './privacy.html',
})
export class Privacy {
  protected readonly contact = PRIVACY_CONTACT;
  protected readonly updated = PRIVACY_UPDATED;
}
