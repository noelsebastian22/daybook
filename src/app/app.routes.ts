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
    path: 'today',
    canActivate: [authGuard],
    loadComponent: () => import('./features/today/today').then((m) => m.Today),
  },
  { path: '**', redirectTo: 'today' },
];
