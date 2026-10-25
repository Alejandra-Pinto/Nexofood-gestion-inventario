import { IsEnum, IsNotEmpty } from 'class-validator';
import { EstadoImpresionComanda } from '../entities/comanda.entity';

export class UpdateEstadoComandaDto {
  @IsNotEmpty({ message: 'El estado de impresión es obligatorio' })
  @IsEnum(EstadoImpresionComanda, {
    message: 'El estado de impresión debe ser PENDIENTE, IMPRESA o ERROR',
  })
  estado_impresion: EstadoImpresionComanda;
}

