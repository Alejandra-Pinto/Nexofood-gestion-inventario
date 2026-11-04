/**
 * DTO: FiltrosHistorialDto
 * ------------------------------------------------------------------
 * HU-5.2 · Historial con filtros (fecha, rango, producto)
 * Query params de GET /queries-reports/historial. Todos son opcionales:
 *   ?fecha=2026-11-04                    -> un día (criterio #1)
 *   ?desde=2026-11-01&hasta=2026-11-04   -> rango de fechas (criterio #2)
 *   ?id_item=5                           -> pedidos con ese producto (criterio #3)
 *   Se pueden combinar producto + fecha o producto + rango (criterio #4).
 *
 * Las fechas van en formato AAAA-MM-DD y se interpretan en la hora de Colombia.
 */
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAJE_FECHA = 'debe tener el formato AAAA-MM-DD';

export class FiltrosHistorialDto {
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: `La fecha ${MENSAJE_FECHA}` })
  fecha?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: `La fecha inicial ${MENSAJE_FECHA}` })
  desde?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: `La fecha final ${MENSAJE_FECHA}` })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El producto debe ser un número entero' })
  @Min(1, { message: 'El producto no es válido' })
  id_item?: number;
}
