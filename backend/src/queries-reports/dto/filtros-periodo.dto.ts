/**
 * DTO: FiltrosPeriodoDto
 * ------------------------------------------------------------------
 * Query params de los reportes por período:
 *   GET /queries-reports/resumen?desde=2026-11-01&hasta=2026-11-30  (HU-6.7)
 *   GET /queries-reports/ventas?desde=2026-11-01&hasta=2026-11-30   (HU-6.2)
 * Las fechas van en formato AAAA-MM-DD y se cuentan en la hora de Colombia.
 */
import { IsNotEmpty, Matches } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class FiltrosPeriodoDto {
  @IsNotEmpty({ message: 'Indique la fecha inicial' })
  @Matches(FORMATO_FECHA, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD' })
  desde: string;

  @IsNotEmpty({ message: 'Indique la fecha final' })
  @Matches(FORMATO_FECHA, { message: 'La fecha final debe tener el formato AAAA-MM-DD' })
  hasta: string;
}
