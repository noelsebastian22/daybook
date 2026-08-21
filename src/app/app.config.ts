import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PageTitle } from './core/page-title';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withViewTransitions drives the task-as-object morph between the row and
    // the /today/:id card. withComponentInputBinding hands that card its `id`
    // as a signal input instead of an ActivatedRoute subscription.
    provideRouter(routes, withViewTransitions(), withComponentInputBinding()),
    // Names each page in the tab title and speaks it into the live region in
    // `App`, neither of which a router navigation does on its own.
    { provide: TitleStrategy, useExisting: PageTitle },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
