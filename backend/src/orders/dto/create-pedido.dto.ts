/**
 * DTO: CreatePedidoDto
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-148 Implementar registro de pedido
 *        · SCRUM-149 Validar stock, cantidad inválida y pedido vacío
 *
 * Datos que envía el frontend para registrar un pedido:
 *   { "numero_mesa": 4, "detalles": [ { "id_item": 1, "cantidad": 2 }, ... ] }
 *
 * numero_mesa es opcional: sin mesa = pedido para llevar / tomado en caja.
 *
 * El mesero (id_usuario) NO va aquí: se toma del token JWT.
 * El precio y el total NO van aquí: los calcula el backend con el
 * precio de venta guardado en la BD (el cliente no puede alterarlos).
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TOTAL_MESAS } from '../mesas';

/** Cantidad máxima de un mismo producto en una línea del pedido */
export const CANTIDAD_MAXIMA = 99;

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
