/**
 * HU-2.2 · ConfidencialidadInterceptor  (SCRUM-193)
 * ------------------------------------------------------------------
 * Interceptor GLOBAL (registrado como APP_INTERCEPTOR en AppModule): es el
 * único lugar donde se decide si el costo sale o no en la respuesta.
 *
 *   - Administrador          -> la respuesta pasa intacta (contrato sin cambios).
 *   - Cualquier otro rol,
 *     rol desconocido o
 *     petición sin usuario   -> se elimina `costo_fabricacion` (y los campos
 *                               extra de @OcultarANoAdmin) a cualquier profundidad.
 *
 * Los guards (JwtAuthGuard) corren ANTES que los interceptores, así que
 * `req.user` ya está resuelto cuando se lee aquí.
 *
 * Al ser global, un endpoint nuevo que devuelva un ItemInventario anidado
 * queda protegido sin que su autor tenga que acordarse de nada.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { CAMPOS_COSTO_CONFIDENCIALES, puedeVerCostos, quitarCampos } from './campos-confidenciales';
import { CAMPOS_OCULTOS_KEY } from './ocultar-a-no-admin.decorator';

@Injectable()
export class ConfidencialidadInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const usuario = context.switchToHttp().getRequest<{ user?: { rol?: unknown } }>().user;
    if (puedeVerCostos(usuario)) return next.handle();

    const extra =
      this.reflector.getAllAndMerge<string[]>(CAMPOS_OCULTOS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const campos = new Set<string>([...CAMPOS_COSTO_CONFIDENCIALES, ...extra]);

    return next.handle().pipe(map((data) => quitarCampos(data, campos)));
  }
}
