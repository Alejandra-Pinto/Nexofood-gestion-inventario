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
import { MotivoMovimiento } from '../entities/movimiento-inventario.entity';

/** Motivos permitidos para una salida manual (excluye los de entrada) */
export const MOTIVOS_SALIDA = [
  MotivoMovimiento.MERMA,
  MotivoMovimiento.CONSUMO_INTERNO,
] as const;

export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

export class CreateSalidaDto {
  /** Id del ítem (producto o insumo) que se va a descontar */
  @IsInt({ message: 'El id del ítem debe ser un número entero' })
  @Min(1, { message: 'El id del ítem es obligatorio' })
  id_item: number;

  /** Solo se acepta MERMA o CONSUMO_INTERNO en este endpoint */
  @IsEnum(MotivoMovimiento, {
    message: 'El motivo debe ser MERMA o CONSUMO_INTERNO',
  })
  motivo: MotivoMovimiento;

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