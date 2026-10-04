/**
 * Interceptor HTTP: AuthInterceptor
 * ------------------------------------------------------------------
 * Agrega automáticamente el header `Authorization: Bearer <token>` a
 * cada petición que salga hacia el backend, tomando el token guardado
 * por el LoginComponent en localStorage.
 *
 * Si no hay token, deja la petición pasar sin modificar (los endpoints
 * públicos — como /auth/login — seguirán funcionando).
 *
 * Si el backend responde 401 (token expirado o inválido), limpia la
 * sesión y redirige al login para que el usuario vuelva a autenticarse.
 */
import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('access_token');

  // Si hay token, clona la petición y agrega el header Authorization.
  // (Las peticiones HTTP en Angular son inmutables, por eso se clona.)
  const peticionConToken = token
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      })
    : req;

  return next(peticionConToken).pipe(
    catchError((error: HttpErrorResponse) => {
      // Token inválido o expirado -> limpiar sesión y volver al login
      if (error.status === 401) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('usuario');
        router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};