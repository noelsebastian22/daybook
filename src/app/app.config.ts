import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PageTitle } from './core/page-title';
import { WarmDrawerDestinations } from './core/preload';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withViewTransitions drives the task-as-object morph between the row and
    // the /today/:id card. withComponentInputBinding hands that card its `id`
    // as a signal input instead of an ActivatedRoute subscription.
    //
    // `skipInitialTransition` is not cosmetic. Without it the very first
    // navigation is wrapped in `document.startViewTransition`, which makes the
    // browser snapshot the page and hold the frame before it will paint —
    // straight onto the LCP path, to animate a transition from nothing to the
    // first screen that nobody asked for. Every transition that actually
    // matters here is between two rendered states and is unaffected.
    //
    // withPreloading warms the chunks behind the drawer once the browser is
    // idle; which routes, and why not all of them, is in `core/preload.ts`.
    provideRouter(
      routes,
      withViewTransitions({ skipInitialTransition: true }),
      withComponentInputBinding(),
      withPreloading(WarmDrawerDestinations),
    ),
    // Names each page in the tab title and speaks it into the live region in
    // `App`, neither of which a router navigation does on its own.
    { provide: TitleStrategy, useExisting: PageTitle },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
