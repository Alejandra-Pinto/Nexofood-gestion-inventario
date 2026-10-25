import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AnularPedidoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo de anulación debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo de anulación es obligatorio' })
  @MinLength(5, { message: 'El motivo de anulación debe tener al menos 5 caracteres' })
  @MaxLength(500, { message: 'El motivo de anulación admite máximo 500 caracteres' })
  motivo: string;
}
