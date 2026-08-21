import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    // Everything signed-in hangs off one shell route, so the drawer mounts
    // once and only the outlet swaps. Login sits outside it deliberately —
    // there is nothing to navigate to until there is a session.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/shell').then((m) => m.Shell),
    children: [
      {
        path: 'today',
        loadComponent: () => import('./features/today/today').then((m) => m.Today),
      },
      {
        // Task as object. A sibling of the list, not a child, so the list
        // unmounts — `view-transition-name: task-{id}` must be unique in the
        // live DOM or the morph silently does nothing.
        path: 'today/:id',
        loadComponent: () => import('./features/today/task-detail').then((m) => m.TaskDetail),
      },
      {
        path: 'upcoming',
        loadComponent: () => import('./features/upcoming/upcoming').then((m) => m.Upcoming),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
      },
      {
        path: 'calendar/:date',
        loadComponent: () => import('./features/calendar/day-detail').then((m) => m.DayDetail),
      },
      {
        path: 'reporting',
        loadComponent: () => import('./features/reporting/reporting').then((m) => m.Reporting),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: 'today' },
];
