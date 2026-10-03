/**
 * DTO (Data Transfer Object): CreateItemDto
 * ------------------------------------------------------------------
 * Define QUÉ DATOS debe enviar el frontend para registrar un ítem
 * y las REGLAS de cada campo. Si algo no cumple, NestJS responde
 * automáticamente 400 (Bad Request) con el mensaje de error en español.
 *
 * HU-2.1 · SCRUM-124 Validar duplicados y campos obligatorios
 *          (los duplicados se validan en products.service.ts)
 */
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TipoItem } from '../entities/item-inventario.entity';

export class CreateItemDto {
  // Limpia el nombre: quita espacios al inicio/fin y espacios dobles
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(80, { message: 'El nombre admite máximo 80 caracteres' })
  nombre: string;

  // Solo se acepta PRODUCTO o INSUMO
  @IsEnum(TipoItem, { message: 'El tipo debe ser PRODUCTO o INSUMO' })
  tipo_item: TipoItem;

  // Id de una categoría existente (se verifica en el servicio)
  @IsInt({ message: 'La categoría es obligatoria' })
  @Min(1, { message: 'La categoría es obligatoria' })
  id_categoria: number;

  /** Stock inicial con el que se registra el ítem */
  @IsInt({ message: 'El stock inicial debe ser un número entero' })
  @Min(0, { message: 'El stock inicial no puede ser negativo' })
  cantidad_stock: number;

  // Valor desde el cual se genera alerta de stock bajo
  @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  stock_minimo: number;

  // Costo de producción o de compra en COP (sin decimales)
  @IsInt({ message: 'El costo debe ser un número entero (COP)' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  costo_fabricacion: number;

  /** Obligatorio y > 0 solo para PRODUCTO. Para INSUMO se guarda en 0 */
  @ValidateIf((o: CreateItemDto) => o.tipo_item === TipoItem.PRODUCTO)
  @IsInt({ message: 'El precio de venta debe ser un número entero (COP)' })
  @Min(1, { message: 'El precio de venta es obligatorio para productos' })
  precio_venta?: number;

  // Opcional: si no se envía, el ítem queda activo
  @IsOptional()
  @IsBoolean()
  estado_activo?: boolean;
}
