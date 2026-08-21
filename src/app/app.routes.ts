import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    // The marketing view. Sits outside the shell for the same reason login
    // does — there is no session to navigate with yet. `authGuard` sends
    // signed-out visitors here rather than straight to the form, so the first
    // thing a stranger sees is what the app is for; `guestGuard` bounces
    // anyone already signed in back to /today.
    path: 'welcome',
    title: 'What Daybook is',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/welcome/welcome').then((m) => m.Welcome),
  },
  {
    path: 'login',
    title: 'Sign in',
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
        title: 'Today',
        loadComponent: () => import('./features/today/today').then((m) => m.Today),
      },
      {
        // Task as object. A sibling of the list, not a child, so the list
        // unmounts — `view-transition-name: task-{id}` must be unique in the
        // live DOM or the morph silently does nothing.
        path: 'today/:id',
        title: 'Task',
        loadComponent: () => import('./features/today/task-detail').then((m) => m.TaskDetail),
      },
      {
        path: 'upcoming',
        title: 'Upcoming',
        loadComponent: () => import('./features/upcoming/upcoming').then((m) => m.Upcoming),
      },
      {
        path: 'calendar',
        title: 'Calendar',
        loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
      },
      {
        path: 'calendar/:date',
        title: 'Day',
        loadComponent: () => import('./features/calendar/day-detail').then((m) => m.DayDetail),
      },
      {
        path: 'reporting',
        title: 'Reporting',
        loadComponent: () => import('./features/reporting/reporting').then((m) => m.Reporting),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: 'today' },
];
