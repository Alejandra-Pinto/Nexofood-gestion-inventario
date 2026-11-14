import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MedioPago } from '../entities/movimiento-financiero.entity';

export class CreateEgresoFinancieroDto {
  @IsString()
  @IsNotEmpty({ message: 'El concepto es obligatorio' })
  @MaxLength(120)
  concepto: string;

  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  monto: number;

  @IsEnum(MedioPago, { message: 'El medio de pago no es válido' })
  @IsNotEmpty()
  medio_pago: MedioPago;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  categoria?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  observaciones?: string;
}