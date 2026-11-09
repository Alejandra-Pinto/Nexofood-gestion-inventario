/** DTO: CreateIngresoFinancieroDto - Registrar ingreso sin afectar estadísticas de ventas */
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MedioPago } from '../entities/movimiento-financiero.entity';
import { CATEGORIAS_INGRESO, MONTO_MAXIMO } from '../ingresos';
import type { CategoriaIngreso } from '../ingresos';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateIngresoFinancieroDto {
  @Transform(recortar)
  @IsString({ message: 'El concepto es obligatorio' })
  @IsNotEmpty({ message: 'El concepto es obligatorio' })
  @MinLength(3, { message: 'El concepto debe tener al menos 3 caracteres' })
  @MaxLength(120, { message: 'El concepto admite máximo 120 caracteres' })
  concepto: string;

  @IsIn(Object.keys(CATEGORIAS_INGRESO), { message: 'Seleccione una categoría válida' })
  categoria: CategoriaIngreso;

  // Monto inválido (vacío, texto, decimal, cero, negativo o exagerado)
  @IsInt({ message: 'El monto debe ser un valor entero en pesos (sin decimales)' })
  @Min(1, { message: 'El monto debe ser mayor a cero' })
  @Max(MONTO_MAXIMO, { message: 'El monto supera el máximo permitido ($100.000.000)' })
  monto: number;

  @IsEnum(MedioPago, { message: 'El medio de pago debe ser EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA o TARJETA' })
  medio_pago: MedioPago;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD' })
  fecha?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'Las observaciones deben ser texto' })
  @MaxLength(255, { message: 'Las observaciones admiten máximo 255 caracteres' })
  observaciones?: string;
}
