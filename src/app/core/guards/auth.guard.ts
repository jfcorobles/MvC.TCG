import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/**
 * Protege rutas privadas requiriendo una sesión activa en Supabase.
 */
export const authGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot, 
  state: RouterStateSnapshot
) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const isAuthenticated = await supabase.waitForAuthInit();

  if (isAuthenticated) {
    return true;
  }

  // Redirigir al login guardando la URL a la que intentaba acceder
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url }
  });
};

/**
 * Evita que usuarios ya autenticados entren a Login o Registro.
 */
export const guestGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const isAuthenticated = await supabase.waitForAuthInit();

  if (isAuthenticated) {
    return router.createUrlTree(['/reportes']);
  }

  return true;
};
