import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Mark } from '../../shared/mark';

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
 * No webfont. Inter is already the app's face and a marketing page that
 * blocks on a font request is a marketing page nobody waits for; the type
 * personality comes from the scale instead — a very tight display size
 * against very wide-tracked micro labels.
 */
@Component({
  selector: 'app-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Mark],
  template: `
    <div class="min-h-dvh bg-ink-900 text-white">
      <!-- ---------------------------------------------------------------- -->
      <header class="safe-top mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div class="flex items-center gap-2.5">
          <app-mark [size]="28" />
          <span class="text-[15px] font-semibold tracking-tight">Daybook</span>
        </div>
        <a
          routerLink="/login"
          class="rounded-card px-3.5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          Sign in
        </a>
      </header>

      <main>
        <!-- hero ------------------------------------------------------------ -->
        <section class="mx-auto max-w-5xl px-5 pb-20 pt-10 lg:pt-20">
          <div class="grid items-center gap-14 lg:grid-cols-[1fr_340px] lg:gap-20">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-100/60">
                One page per day
              </p>

              <h1
                class="mt-5 text-balance text-[2.75rem] font-semibold leading-[1.03] tracking-[-0.03em] sm:text-6xl"
              >
                Whatever you don't finish
                <span class="text-brand-100">comes with you.</span>
              </h1>

              <p class="mt-6 max-w-md text-pretty text-lg leading-relaxed text-white/70">
                Unfinished tasks roll to tomorrow on their own. Daybook keeps count of how many
                times, so the thing you have been avoiding since Tuesday cannot hide in a list any
                more.
              </p>

              <div class="mt-9 flex flex-wrap items-center gap-3">
                <a
                  routerLink="/login"
                  class="rounded-card bg-white px-5 py-3 font-medium text-ink-900 transition hover:bg-brand-50"
                >
                  Start today
                </a>
                <span class="text-sm text-white/60">Free. Google sign-in or an emailed link.</span>
              </div>
            </div>

            <!--
            The signature. Fixed geometry, because the row's travel distance is
            the difference between two hard-coded slot positions — see the
            carry keyframes. role="img" with a label, because the animation
            is the argument and a screen reader should get the argument, not
            eight scattered words of card furniture.
          -->
            <div
              class="stack mx-auto w-full max-w-[320px]"
              role="img"
              aria-label="A task called call physio moves from Tuesday's page to Wednesday's, and its carried count goes from one to two."
            >
              <div class="card" aria-hidden="true">
                <p class="card-date">Tue 19</p>
                <div class="row row--done">
                  <span class="tickbox"
                    ><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 12.5 10 16.5 18 8"
                      /></svg
                  ></span>
                  <span class="row-text">pay rent</span>
                </div>
                <div class="row-gap"></div>
              </div>

              <div class="card card--today" aria-hidden="true">
                <p class="card-date">Wed 20</p>
                <div class="slot"></div>
                <div class="row">
                  <span class="checkbox"></span>
                  <span class="row-text">book flights</span>
                </div>
              </div>

              <!-- the one that travels -->
              <div class="flyer row" aria-hidden="true">
                <span class="checkbox"></span>
                <span class="row-text">call physio</span>
                <span class="badge">
                  <span class="badge-one">carried &times;1</span>
                  <span class="badge-two">carried &times;2</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- mechanics -------------------------------------------------------- -->
        <section class="bg-ink-50 py-20 text-ink-900">
          <div class="mx-auto max-w-5xl space-y-16 px-5">
            <div class="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-16">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  Capture
                </p>
                <h2 class="mt-3 text-balance text-2xl font-semibold tracking-tight">
                  Type it the way you'd say it
                </h2>
                <p class="mt-3 text-ink-600">
                  One line sets the day, the time, the tag and how much focus it needs. The parts
                  light up as you type, so you can see what Daybook understood before you commit.
                </p>
              </div>
              <div class="self-center rounded-panel bg-white p-5 shadow-sm ring-1 ring-ink-200/60">
                <p class="text-sm text-ink-400">Add task</p>
                <p class="mt-2 text-lg leading-loose">
                  call physio
                  <span class="rounded-control bg-brand-50 px-1.5 py-1 text-brand-700"
                    >thursday 2pm</span
                  >
                  <span class="rounded-control bg-ink-100 px-1.5 py-1 text-ink-600">#health</span>
                  <span class="rounded-control bg-quick-100 px-1.5 py-1 text-quick-700">!quick</span>
                </p>
                <p class="mt-3 text-sm text-ink-400">
                  Thursday 22 August, 2:00 PM · Health · Quick
                </p>
              </div>
            </div>

            <div class="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-16">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  Two kinds of late
                </p>
                <h2 class="mt-3 text-balance text-2xl font-semibold tracking-tight">
                  What slipped, and what you moved
                </h2>
                <p class="mt-3 text-ink-600">
                  A task the app carried for you and a task you pushed by hand mean different
                  things, so Daybook counts them separately. One is drift. The other is a decision
                  you made four times.
                </p>
              </div>
              <div class="grid gap-3 self-center sm:grid-cols-2">
                <div class="rounded-panel bg-white p-5 shadow-sm ring-1 ring-ink-200/60">
                  <p class="text-sm font-medium">Carried over most</p>
                  <p class="mt-0.5 text-xs text-ink-400">The app moved these. You did not.</p>
                  <div class="mt-4 flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 truncate text-sm">book the dentist</span>
                    <span
                      class="shrink-0 rounded-full bg-late-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-late-700"
                      >&times;4</span
                    >
                  </div>
                  <div class="mt-2 flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 truncate text-sm">call physio</span>
                    <span
                      class="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-ink-600"
                      >&times;2</span
                    >
                  </div>
                </div>
                <div class="rounded-panel bg-white p-5 shadow-sm ring-1 ring-ink-200/60">
                  <p class="text-sm font-medium">Pushed most</p>
                  <p class="mt-0.5 text-xs text-ink-400">These you moved by hand.</p>
                  <div class="mt-4 flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 truncate text-sm">rewrite the invoice</span>
                    <span
                      class="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-ink-600"
                      >&times;3</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <div class="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-16">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  Mornings
                </p>
                <h2 class="mt-3 text-balance text-2xl font-semibold tracking-tight">
                  It writes to you first
                </h2>
                <p class="mt-3 text-ink-600">
                  A digest lands at the hour you pick, in your own timezone: what you finished
                  yesterday, what came with you, and what today already holds. Set a time on a task
                  and it will remind you too.
                </p>
              </div>
              <div
                class="self-center overflow-hidden rounded-panel bg-white shadow-sm ring-1 ring-ink-200/60"
              >
                <div class="border-b border-ink-100 px-5 py-3">
                  <p class="text-sm font-medium">Daybook — 3 on today</p>
                  <p class="text-xs text-ink-400">to you · 7:00 AM</p>
                </div>
                <div class="space-y-3 px-5 py-4 text-sm">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Yesterday you finished
                    </p>
                    <p class="mt-1 text-done-700">pay rent · 9:14 AM</p>
                  </div>
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Came with you
                    </p>
                    <p class="mt-1">call physio <span class="text-ink-400">· carried ×2</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- close ------------------------------------------------------------ -->
        <section class="mx-auto max-w-5xl px-5 py-24 text-center">
          <h2 class="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with one page.
          </h2>
          <p class="mx-auto mt-4 max-w-sm text-white/60">
            Tomorrow's page writes itself out of whatever today's still has on it.
          </p>
          <a
            routerLink="/login"
            class="mt-8 inline-block rounded-card bg-white px-5 py-3 font-medium text-ink-900 transition hover:bg-brand-50"
          >
            Start today
          </a>
        </section>
      </main>

      <footer class="safe-bottom border-t border-white/10 py-8 text-center text-xs text-white/50">
        Daybook
      </footer>
    </div>
  `,
  styles: `
    /* --------------------------------------------------------------------
       The carry animation.

       The row is absolutely positioned in the stack rather than sitting in
       either card's flow, because it has to be over both of them at once
       mid-flight and a card that clipped it would cut it in half. That makes
       the travel distance a hard-coded number: 116px, the gap between the
       slot it leaves at y=88 and the slot it lands in at y=204. Change any
       card padding or row height below and that number changes with it.
       -------------------------------------------------------------------- */
    .stack {
      position: relative;
      height: 300px;
    }

    .card {
      position: absolute;
      left: 0;
      right: 0;
      height: 140px;
      padding: 16px;
      border-radius: 20px;
      background: #fff;
      color: #171a2b;
      box-shadow: 0 24px 48px -24px rgb(0 0 0 / 0.55);
    }

    .card--today {
      top: 160px;
    }

    .card-date {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #676d8b;
      line-height: 18px;
      margin-bottom: 10px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 36px;
      padding: 0 10px;
      border-radius: 12px;
      font-size: 14px;
    }

    /* the space the traveller occupies while it is still on Tue 19 */
    .row-gap {
      height: 36px;
      margin-top: 8px;
    }

    .row--done .row-text {
      color: #676d8b;
      text-decoration: line-through;
    }

    .row-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .checkbox {
      width: 18px;
      height: 18px;
      flex: none;
      border-radius: 6px;
      border: 1.8px solid #d6dae9;
    }

    .tickbox {
      width: 18px;
      height: 18px;
      flex: none;
      border-radius: 6px;
      background: #10b981;
      display: grid;
      place-items: center;
    }

    .tickbox svg {
      width: 13px;
      height: 13px;
    }

    /* where the traveller is going to land */
    .slot {
      height: 36px;
      border-radius: 12px;
      border: 1.5px dashed #d6dae9;
      margin-bottom: 8px;
      animation: slot-clear 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .flyer {
      position: absolute;
      left: 16px;
      right: 16px;
      top: 88px;
      background: #fff;
      color: #171a2b;
      animation: carry 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .badge {
      position: relative;
      flex: none;
      display: grid;
      font-size: 11px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    /* Stacked in one grid cell so the swap cannot nudge the row's width. */
    .badge-one,
    .badge-two {
      grid-area: 1 / 1;
      border-radius: 999px;
      background: #eceef6;
      color: #4a5070;
      padding: 2px 8px;
      white-space: nowrap;
    }

    .badge-one {
      animation: was-one 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .badge-two {
      opacity: 0;
      animation: now-two 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    @keyframes carry {
      0%,
      14% {
        transform: translateY(0) scale(1);
        box-shadow: 0 0 0 0 rgb(23 26 43 / 0);
      }
      26%,
      48% {
        transform: translateY(-8px) scale(1.04);
        box-shadow: 0 18px 30px -12px rgb(23 26 43 / 0.45);
      }
      62% {
        transform: translateY(116px) scale(1.04);
        box-shadow: 0 18px 30px -12px rgb(23 26 43 / 0.45);
      }
      72%,
      100% {
        transform: translateY(116px) scale(1);
        box-shadow: 0 0 0 0 rgb(23 26 43 / 0);
      }
    }

    @keyframes was-one {
      0%,
      58% {
        opacity: 1;
      }
      66%,
      100% {
        opacity: 0;
      }
    }

    @keyframes now-two {
      0%,
      58% {
        opacity: 0;
        transform: scale(0.8);
      }
      70% {
        opacity: 1;
        transform: scale(1.18);
      }
      78%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes slot-clear {
      0%,
      48% {
        opacity: 1;
      }
      62%,
      100% {
        opacity: 0;
      }
    }

    /*
      styles.css already flattens every duration globally under reduced
      motion, but a 0.01ms infinite loop is a spinning compositor rather
      than a still frame. Stop these outright and hold the finished state —
      the row landed, counted twice — which is the frame that carries the
      idea anyway.
    */
    @media (prefers-reduced-motion: reduce) {
      .flyer {
        animation: none;
        transform: translateY(116px);
      }
      .slot {
        animation: none;
        opacity: 0;
      }
      .badge-one {
        animation: none;
        opacity: 0;
      }
      .badge-two {
        animation: none;
        opacity: 1;
      }
    }
  `,
})
export class Welcome {}
