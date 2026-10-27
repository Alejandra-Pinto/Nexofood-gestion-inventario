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
import {
  AdicionalSeleccionadoDto,
  CANTIDAD_MAXIMA,
  MAX_ADICIONALES_LINEA,
} from './create-pedido.dto';

export class ModificarDetallePedidoDto {
  /**
   * Línea existente del pedido. Obligatorio para las líneas con adicionales,
   * combo o promoción (HU-3.2): así se edita ESA línea (cantidad y nota) sin
   * perder sus registros en pedido_item_adicional. Las líneas simples pueden
   * omitirlo (se agrupan por producto).
   */
  @IsOptional()
  @IsInt({ message: 'El id de la línea del pedido debe ser un número entero' })
  @Min(1, { message: 'El id de la línea del pedido no es válido' })
  id_detalle?: number;

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

  /**
   * Adicionales de la línea (lista COMPLETA, reemplaza la anterior).
   *   - Con id_detalle: se reconfigura esa línea (se quitan los desmarcados y
   *     se agregan los nuevos en pedido_item_adicional).
   *   - Sin id_detalle: se crea una línea nueva con esos adicionales.
   *   - Si no se envía: la línea conserva sus adicionales.
   */
  @IsOptional()
  @IsArray({ message: 'Los adicionales deben enviarse como una lista' })
  @ArrayMaxSize(MAX_ADICIONALES_LINEA, {
    message: `Un producto admite máximo ${MAX_ADICIONALES_LINEA} adicionales`,
  })
  @ValidateNested({ each: true })
  @Type(() => AdicionalSeleccionadoDto)
  adicionales?: AdicionalSeleccionadoDto[];

  /**
   * Formato de la línea: id de la promoción/combo, o null para "Individual".
   * Si no se envía, la línea conserva su formato actual.
   */
  @IsOptional()
  @IsInt({ message: 'El id de la promoción debe ser un número entero' })
  @Min(1, { message: 'El id de la promoción no es válido' })
  id_promocion?: number | null;

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
