/**
 * HU-2.2 · @OcultarANoAdmin(...campos)  (SCRUM-193)
 * ------------------------------------------------------------------
 * Agrega campos confidenciales PROPIOS de un endpoint, además de
 * `costo_fabricacion` (que se oculta siempre). Los aplica el
 * ConfidencialidadInterceptor solo cuando quien llama no es Administrador.
 *
 * Ejemplo: en POST /inventory/ingresos el `costo_unitario` y el `total`
 * pueden ser el costo de fabricación copiado (producción sin costo), así que
 * se ocultan al Cajero:
 *
 *   @OcultarANoAdmin('costo_unitario', 'total')
 */
import { SetMetadata } from '@nestjs/common';

export const CAMPOS_OCULTOS_KEY = 'campos_ocultos_no_admin';

export const OcultarANoAdmin = (...campos: string[]) => SetMetadata(CAMPOS_OCULTOS_KEY, campos);
