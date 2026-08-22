import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/**
 * Protege la ruta del Panel de Administración requiriendo rol 'admin' en Supabase.
 */
export const adminGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot, 
  state: RouterStateSnapshot
) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const isAuthenticated = await supabase.waitForAuthInit();

  if (!isAuthenticated) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  if (supabase.isAdmin()) {
    return true;
  }

  // Si está autenticado pero no es admin, redirigir al inicio o a sus reportes
  return router.createUrlTree(['/']);
};
