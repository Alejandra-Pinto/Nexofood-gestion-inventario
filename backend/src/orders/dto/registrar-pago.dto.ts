/**
 * DTO: RegistrarPagoDto
 * ------------------------------------------------------------------
 * HU-3.5 · SCRUM-168 Implementar selección y registro del método de pago
 *
 *   { "medio_pago": "EFECTIVO", "monto_recibido": 50000 }
 *
 * El monto a cobrar NO va aquí: es el total del pedido guardado en la BD.
 * `monto_recibido` solo aplica en EFECTIVO para calcular el cambio.
 */
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MedioPago } from '../../finance/entities/movimiento-financiero.entity';

export class RegistrarPagoDto {
  @IsEnum(MedioPago, {
    message: 'El medio de pago debe ser EFECTIVO, TRANSFERENCIA, NEQUI, DAVIPLATA o TARJETA',
  })
  medio_pago: MedioPago;

  @IsOptional()
  @IsInt({ message: 'El monto recibido debe ser un número entero' })
  @Min(1, { message: 'El monto recibido debe ser mayor a 0' })
  @Max(2_147_483_647, { message: 'El monto recibido supera el máximo permitido' })
  monto_recibido?: number;
}
