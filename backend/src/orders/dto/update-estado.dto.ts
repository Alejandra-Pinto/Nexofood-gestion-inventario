import { IsEnum, IsNotEmpty } from 'class-validator';
import { EstadoPedido } from '../entities/pedido.entity';

export class UpdateEstadoDto {
  @IsEnum(EstadoPedido, { message: 'El estado enviado no es válido' })
  @IsNotEmpty({ message: 'El estado es obligatorio' })
  estado_pedido: EstadoPedido;
}