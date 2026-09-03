import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/brand/logo';

/**
 * The marketing view (BUILD-PLAN §5.4, Phase 6).
 *
 * The hero does not describe the carry-over, it performs it: a task row lifts
 * off yesterday's page, lands on today's, and its badge ticks from ×1 to ×2.
 * That mechanic is the only thing about Daybook no other list app does, so it
 * is the one thing worth spending the page's attention on. Everything else
 * here is deliberately quiet.
 *
 * The palette is the app's own — `ink`, `brand`, and green and red kept
 * reserved (AGENTS.md). This is the one screen where both reserved colours
 * appear together, because it is explaining what they mean: green is a thing
 * finished, red is a thing avoided four times.
 *
 * No webfont. The app renders in the system stack (`--font-sans`), and a
 * marketing page that blocks on a font request is a marketing page nobody
 * waits for; the type personality comes from the scale instead — a very
 * tight display size against very wide-tracked micro labels.
 *
 * **This page is exempt from the UI type scale**, and it is the only one.
 * Everything that does a UI job here is on the tokens — body, caption,
 * display. Three sites are not, and are deliberate:
 *
 *   - the hero h1, 44px rising to 60px
 *   - the closing h2, 30px rising to 36px
 *   - the hero subhead at 18px
 *
 * A landing page needs a register the app itself never uses, and the
 * alternative was four more `@theme` steps used once each on one screen.
 * The scale governs the app; this is a poster. Do not copy the pattern
 * into a signed-in surface — see `src/styles.css` and AGENTS.md.
 */
@Component({
  selector: 'app-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Logo],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class Welcome {}
