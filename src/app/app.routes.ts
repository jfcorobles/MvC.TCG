import { Routes } from '@angular/router';

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
    title: 'Constructor de Mazo | Máscaras vs Cabelleras TCG'
  },
  {
    path: 'acerca',
    loadComponent: () => import('./features/about/about.component').then(m => m.AboutComponent),
    title: 'Historia del Proyecto | Máscaras vs Cabelleras TCG'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
