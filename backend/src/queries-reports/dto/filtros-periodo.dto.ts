/** DTO: FiltrosPeriodoDto - Query params de los reportes por período */
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, Matches, Min } from 'class-validator';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class FiltrosPeriodoDto {
  @IsNotEmpty({ message: 'Indique la fecha inicial' })
  @Matches(FORMATO_FECHA, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD' })
  desde: string;

  @IsNotEmpty({ message: 'Indique la fecha final' })
  @Matches(FORMATO_FECHA, { message: 'La fecha final debe tener el formato AAAA-MM-DD' })
  hasta: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El producto debe ser un número entero' })
  @Min(1, { message: 'El producto no es válido' })
  id_item?: number;
}
