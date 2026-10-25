import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermisoUsuario, RolUsuario } from '../models/usuario.model';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaAutenticado()) {
    return true;
  }
  return router.parseUrl('/login');
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaAutenticado()) {
    return router.parseUrl(auth.obtenerRutaInicial());
  }
  return true;
};

/** Solo Administrador puede acceder (ej. /register, /usuarios) */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.estaAutenticado()) {
    return router.parseUrl('/login');
  }

  const u = auth.usuarioActual();
  if (u?.rol === 'Administrador') {
    return true;
  }

  return router.parseUrl(auth.obtenerRutaInicial());
};

/** Valida que el usuario tenga un permiso específico o sea Administrador */
export const permisoGuard = (permiso: PermisoUsuario): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.estaAutenticado()) {
      return router.parseUrl('/login');
    }

    const u = auth.usuarioActual();
    if (!u) {
      return router.parseUrl('/login');
    }

    if (u.rol === 'Administrador' || u.permisos?.includes(permiso)) {
      return true;
    }

    return router.parseUrl(auth.obtenerRutaInicial());
  };
};

/** Valida que el usuario pertenezca a alguno de los roles permitidos */
export const rolGuard = (roles: RolUsuario[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.estaAutenticado()) {
      return router.parseUrl('/login');
    }

    const u = auth.usuarioActual();
    if (!u) {
      return router.parseUrl('/login');
    }

    if (roles.includes(u.rol)) {
      return true;
    }

    return router.parseUrl(auth.obtenerRutaInicial());
  };
};

