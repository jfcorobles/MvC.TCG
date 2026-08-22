import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent),
    title: 'Máscaras vs Cabelleras TCG | Inicio'
  },
  {
    path: 'cartas',
    loadComponent: () => import('./features/card-browser/card-browser.component').then(m => m.CardBrowserComponent),
    title: 'Catálogo & Buscador de Cartas | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'reglas',
    loadComponent: () => import('./features/rules/rules.component').then(m => m.RulesComponent),
    title: 'Reglas del Juego | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'mazo',
    loadComponent: () => import('./features/deck-builder/deck-builder.component').then(m => m.DeckBuilderComponent),
    canActivate: [authGuard],
    title: 'Constructor de Mazo | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'eventos',
    loadComponent: () => import('./features/events/events.component').then(m => m.EventsComponent),
    title: 'Torneos & Eventos | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'comunidad',
    loadComponent: () => import('./features/community/community.component').then(m => m.CommunityComponent),
    title: 'El Ring de la Comunidad & Rulings | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'acerca',
    loadComponent: () => import('./features/about/about.component').then(m => m.AboutComponent),
    title: 'Historia del Proyecto | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'Iniciar Sesión | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'auth/registro',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard],
    title: 'Crear Cuenta | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'reportes',
    loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [authGuard],
    title: 'Módulo de Reportes & Erratas | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'perfil',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard],
    title: 'Mi Perfil de Luchador | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [adminGuard],
    title: 'Panel de Administración | Máscaras vs Cabelleras TCG'
  },
  {
    path: '**',
    redirectTo: ''
  }
];

