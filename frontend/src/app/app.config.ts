/**
 * Configuración global de la aplicación Angular.
 */
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import localeEsCo from '@angular/common/locales/es-CO';
import { routes } from './app.routes';

// Formato colombiano para números y moneda: $ 12.000
registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),           // rutas de las pantallas
    provideHttpClient(),             // permite llamar al backend (HttpClient)
    { provide: LOCALE_ID, useValue: 'es-CO' },
  ],
};
