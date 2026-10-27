/**
 * DTO: CotizarPedidoDto
 * ------------------------------------------------------------------
 * HU-3.2 · SCRUM-152 / SCRUM-155
 * POST /orders/cotizar recibe las mismas líneas que POST /orders y devuelve
 * el precio de cada una SIN guardar nada. El frontend lo llama al pulsar
 * "Agregar al pedido" para confirmar precio, stock y vigencia de la promoción
 * antes de sumar el producto al borrador.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { DetallePedidoDto } from './create-pedido.dto';

export class CotizarPedidoDto {
  @IsArray({ message: 'Los productos deben enviarse como una lista' })
  @ArrayMinSize(1, { message: 'Debe enviar al menos un producto para cotizar' })
  @ArrayMaxSize(50, {
    message: 'El pedido admite máximo 50 productos distintos',
  })
  @ValidateNested({ each: true })
  @Type(() => DetallePedidoDto)
  detalles: DetallePedidoDto[];
}
