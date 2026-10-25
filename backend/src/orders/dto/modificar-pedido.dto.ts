import { Type } from 'class-transformer';
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
import { CANTIDAD_MAXIMA } from './create-pedido.dto';

export class ModificarDetallePedidoDto {
  @IsInt({ message: 'El id del producto debe ser un número entero' })
  @Min(1, { message: 'El id del producto es obligatorio' })
  id_item: number;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  @Max(CANTIDAD_MAXIMA, { message: `La cantidad máxima por producto es ${CANTIDAD_MAXIMA}` })
  cantidad: number;

  @IsOptional()
  @IsString({ message: 'Las notas especiales deben ser texto' })
  @MaxLength(255, { message: 'Las notas especiales admiten máximo 255 caracteres' })
  notas_especiales?: string;

  @IsOptional()
  @IsString({ message: 'La promoción debe ser texto' })
  @MaxLength(100, { message: 'La promoción admite máximo 100 caracteres' })
  promocion_aplicada?: string;
}

export class ModificarPedidoDto {
  @IsArray({ message: 'Los productos del pedido deben enviarse como una lista' })
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ArrayMaxSize(50, { message: 'El pedido admite máximo 50 productos distintos' })
  @ValidateNested({ each: true })
  @Type(() => ModificarDetallePedidoDto)
  detalles: ModificarDetallePedidoDto[];
}
