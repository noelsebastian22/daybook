import {
  provideZonelessChangeDetection,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { Supabase } from '../app/core/supabase';
import { FakeSupabase } from './fake-supabase';

/**
 * Providers installed into every spec, wired through `providersFile` in
 * `angular.json`. `@angular/build:unit-test` initialises the TestBed itself,
 * so this file supplies only what the app needs on top of it.
 *
 * Two things, and both are load-bearing:
 *
 * **Zoneless change detection.** The app dropped `zone.js` (AGENTS.md), so
 * there is no polyfill to fall back on. Without this provider `fixture`
 * creation throws, and the error names `NgZone` rather than the missing
 * provider, which sends you looking in the wrong place.
 *
 * **A fake Supabase.** The real `Supabase` service builds a client at
 * construction with `detectSessionInUrl: true`, which reads `location` and
 * starts a token exchange. Any spec that touches a store transitively injects
 * it. Overriding it here means no spec can accidentally reach the network,
 * rather than every spec having to remember to stub it.
 */
const testProviders: (Provider | EnvironmentProviders)[] = [
  provideZonelessChangeDetection(),
  { provide: Supabase, useClass: FakeSupabase },
];

export default testProviders;
