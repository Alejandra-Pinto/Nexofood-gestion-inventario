/** DTO: FiltrosPeriodoOpcionalDto - Período del reporte financiero (HU-6.4). Sin fechas = mes en curso */
import { IsOptional, Matches } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class FiltrosPeriodoOpcionalDto {
  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FORMATO_FECHA, { message: 'La fecha final debe tener el formato AAAA-MM-DD' })
  hasta?: string;
}
