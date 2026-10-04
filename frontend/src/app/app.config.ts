/**
 * Configuración global de la aplicación Angular.
 */
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import localeEsCo from '@angular/common/locales/es-CO';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

// Formato colombiano para números y moneda: $ 12.000
registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])), // autenticación automática
    { provide: LOCALE_ID, useValue: 'es-CO' },
  ],
};