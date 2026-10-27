/**
 * DTO: CreatePedidoDto
 * ------------------------------------------------------------------
 * Datos que envía el frontend para registrar un pedido:
 *   {
 *     "numero_mesa": 4,
 *     "detalles": [
 *       { "id_item": 1, "cantidad": 2,
 *         "adicionales": [ { "id_adicional": 3 }, { "id_adicional": 8 } ],
 *         "id_promocion": 1,
 *         "notas_especiales": "sin cebolla" },
 *       { "id_item": 9, "cantidad": 2 }
 *     ]
 *   }
 *
 * numero_mesa es opcional: sin mesa = pedido para llevar / tomado en caja.
 *
 * El mesero (id_usuario) NO va aquí: se toma del token JWT.
 * El precio y el total NO van aquí: los calcula el backend con los precios
 * guardados en la BD (producto, adicionales y promoción). El cliente no
 * puede alterarlos.
 *
 * HU-3.2: adicionales, promoción/combo y notas especiales por línea.
 */
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TOTAL_MESAS } from '../mesas';

/** Cantidad máxima de un mismo producto en una línea del pedido */
export const CANTIDAD_MAXIMA = 99;

/** HU-3.2: máximo de adicionales distintos en una línea y unidades de cada uno */
export const MAX_ADICIONALES_LINEA = 10;
export const MAX_CANTIDAD_ADICIONAL = 5;

/** HU-3.2 · SCRUM-154: largo máximo de la nota de cocina */
export const MAX_NOTA = 255;

/** Quita espacios sobrantes; '' se convierte en undefined */
const limpiarTexto = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const limpio = value.replace(/\s+/g, ' ').trim();
  return limpio === '' ? undefined : limpio;
};

/** HU-3.2 · SCRUM-152: un adicional elegido para la línea */
export class AdicionalSeleccionadoDto {
  @IsInt({ message: 'El id del adicional debe ser un número entero' })
  @Min(1, { message: 'El id del adicional es obligatorio' })
  id_adicional: number;

  @IsOptional()
  @IsInt({ message: 'La cantidad del adicional debe ser un número entero' })
  @Min(1, { message: 'La cantidad del adicional debe ser mayor a 0' })
  @Max(MAX_CANTIDAD_ADICIONAL, {
    message: `La cantidad máxima de un adicional es ${MAX_CANTIDAD_ADICIONAL}`,
  })
  cantidad?: number;
}

/** Un producto del pedido */
export class DetallePedidoDto {
  @IsInt({ message: 'El id del producto debe ser un número entero' })
  @Min(1, { message: 'El id del producto es obligatorio' })
  id_item: number;

  // SCRUM-149: cantidad inválida (0, negativa, decimal o exagerada)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  @Max(CANTIDAD_MAXIMA, { message: `La cantidad máxima por producto es ${CANTIDAD_MAXIMA}` })
  cantidad: number;

  // HU-3.2 · SCRUM-152: adicionales (pan, aderezo, extras)
  @IsOptional()
  @IsArray({ message: 'Los adicionales deben enviarse como una lista' })
  @ArrayMaxSize(MAX_ADICIONALES_LINEA, {
    message: `Un producto admite máximo ${MAX_ADICIONALES_LINEA} adicionales`,
  })
  @ValidateNested({ each: true })
  @Type(() => AdicionalSeleccionadoDto)
  adicionales?: AdicionalSeleccionadoDto[];

  // HU-3.2 · SCRUM-153: promoción o combo elegido (ej. "Combo con papa")
  @IsOptional()
  @IsInt({ message: 'El id de la promoción debe ser un número entero' })
  @Min(1, { message: 'El id de la promoción no es válido' })
  id_promocion?: number;

  // HU-3.2 · SCRUM-154: nota de cocina ("sin cebolla")
  @IsOptional()
  @Transform(limpiarTexto)
  @IsString({ message: 'Las notas especiales deben ser texto' })
  @MaxLength(MAX_NOTA, { message: `Las notas especiales admiten máximo ${MAX_NOTA} caracteres` })
  notas_especiales?: string;
}

export class CreatePedidoDto {
  // Mesa del pedido (prototipo "Mis mesas")
  @IsOptional()
  @IsInt({ message: 'La mesa debe ser un número entero' })
  @Min(1, { message: `La mesa debe estar entre 1 y ${TOTAL_MESAS}` })
  @Max(TOTAL_MESAS, { message: `La mesa debe estar entre 1 y ${TOTAL_MESAS}` })
  numero_mesa?: number;

  // SCRUM-149: pedido vacío
  @IsArray({ message: 'Los productos del pedido deben enviarse como una lista' })
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ArrayMaxSize(50, { message: 'El pedido admite máximo 50 productos distintos' })
  @ValidateNested({ each: true })
  @Type(() => DetallePedidoDto)
  detalles: DetallePedidoDto[];
}
