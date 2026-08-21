import type { ApplicationRef } from '@angular/core';

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Runs a state change inside a View Transition, so rows that move animate to
 * their new positions instead of jumping.
 *
 * This is what makes completion choreography free: every `app-task-row`
 * already carries `view-transition-name: task-{id}` for the task-as-object
 * morph, and the browser will FLIP anything it can match by name across the
 * two snapshots. Completing a task re-sorts it to the bottom of the list, and
 * the gap it left closes on its own.
 *
 * The explicit `tick()` is load-bearing. The app is zoneless, so a signal
 * write does not touch the DOM until change detection runs, and the browser
 * snapshots the "after" state the moment this callback returns. Without the
 * tick both snapshots are identical and nothing animates.
 *
 * Falls back to a plain call where the API is missing (Firefox at the time of
 * writing) or motion is unwelcome. The mutation always happens either way.
 */
export function withViewTransition(appRef: ApplicationRef, mutate: () => void): void {
  // The DOM lib types this as always present; Firefox disagrees, so the
  // optional call is a runtime guard rather than a type one.
  const start = document.startViewTransition?.bind(document);
  if (!start || prefersReducedMotion()) {
    mutate();
    return;
  }
  start(() => {
    mutate();
    appRef.tick();
  });
}
