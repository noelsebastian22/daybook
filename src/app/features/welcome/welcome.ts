import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/brand/logo';
import { TryPage } from './try-page';

/**
 * The marketing view (BUILD-PLAN §5.4, Phase 6; retheme Phase 5).
 *
 * The hero does not describe the carry-over, it hands it to you: the page on
 * the right is a real Daybook page running the real parser, and turning it
 * carries your own unticked rows forward. That mechanic is the only thing
 * about Daybook no other list app does, so it is the one thing worth
 * spending the page's attention on. See `try-page.ts`.
 *
 * It used to be a looping CSS animation of a row moving between two cards —
 * the same argument, on rails. `welcome.css` held that animation and is gone
 * with it, which leaves the app with no component stylesheets at all.
 *
 * The palette is the app's own, with green and red kept reserved
 * (AGENTS.md). This is the one screen where both reserved colours appear
 * together, because it is explaining what they mean: green is a thing
 * finished, red is a thing avoided four times.
 *
 * The display face is Fraunces, self-hosted and subset (Phase 4). It is on
 * the headlines here and nowhere in the body — see `src/styles.css`. Under
 * `font-display: swap` the page renders in the system serif first, and it is
 * designed to be read that way too: nothing here depends on the face having
 * arrived.
 *
 * **This page is exempt from the UI type scale**, and it is still the only
 * one. Everything that does a UI job here is on the tokens — body, caption,
 * display, header. Three sites are not, and are deliberate:
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
  imports: [RouterLink, Logo, TryPage],
  templateUrl: './welcome.html',
})
export class Welcome {}
