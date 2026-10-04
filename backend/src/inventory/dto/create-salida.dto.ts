/**
 * DTO: CreateSalidaDto
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-132 Registrar salidas manuales de inventario
 *        · SCRUM-133 Validar cantidad superior al stock disponible
 *
 * Cubre los dos motivos de salida permitidos:
 *   - MERMA              → descarte por daño, caducidad, etc.
 *   - CONSUMO_INTERNO    → uso del producto/insumo dentro del negocio
 *
 * El campo `id_usuario` NO va en este DTO: se obtiene del token JWT
 * mediante @CurrentUser() para garantizar trazabilidad real.
 */
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Motivos permitidos específicamente en este endpoint (solo salidas) */
export enum MotivoSalida {
  MERMA = 'MERMA',
  CONSUMO_INTERNO = 'CONSUMO_INTERNO',
}

export class CreateSalidaDto {
  /** Id del ítem (producto o insumo) que se va a descontar */
  @IsInt({ message: 'El id del ítem debe ser un número entero' })
  @Min(1, { message: 'El id del ítem es obligatorio' })
  id_item: number;

  /** Solo se acepta MERMA o CONSUMO_INTERNO */
  @IsEnum(MotivoSalida, {
    message: 'El motivo debe ser MERMA o CONSUMO_INTERNO',
  })
  motivo: MotivoSalida;

  /** Cantidad a descontar (unidades enteras, > 0) */
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  /** Nota opcional (ej: "Lote #458", "Se dañó en cocina") */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Las observaciones deben ser texto' })
  @MaxLength(255, { message: 'Las observaciones admiten máximo 255 caracteres' })
  observaciones?: string;
}