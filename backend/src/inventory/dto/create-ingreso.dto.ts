/**
 * DTO: CreateIngresoDto
 * ------------------------------------------------------------------
 * HU-2.3 · SCRUM-128 Sumar cantidad ingresada al stock
 *        · SCRUM-129 Registrar fecha y tipo de movimiento
 *
 * Cubre los dos tipos de ingreso del prototipo "13. Registrar ingreso":
 *   - COMPRA       -> "Compra a proveedor": exige proveedor y costo unitario
 *   - PRODUCCION   -> "Producción propia": sin proveedor; el costo unitario
 *                     es opcional (si no llega se usa el costo_fabricacion
 *                     del ítem)
 *
 * `id_usuario` NO va aquí: se toma del JWT con @CurrentUser().
 * `total` NO va aquí: lo calcula el servidor (cantidad x costo_unitario).
 */
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Motivos permitidos específicamente en este endpoint (solo ingresos) */
export enum MotivoIngreso {
  COMPRA = 'COMPRA',
  PRODUCCION = 'PRODUCCION',
}

/** true si el valor llegó informado (no es undefined ni null) */
const informado = (valor: unknown): boolean =>
  valor !== undefined && valor !== null;

export class CreateIngresoDto {
  /** Id del ítem (producto o insumo) al que se le suma stock */
  @IsInt({ message: 'El id del ítem debe ser un número entero' })
  @Min(1, { message: 'El id del ítem es obligatorio' })
  id_item: number;

  /** COMPRA o PRODUCCION */
  @IsEnum(MotivoIngreso, {
    message: 'El tipo de ingreso debe ser COMPRA o PRODUCCION',
  })
  motivo: MotivoIngreso;

  /** Obligatorio en COMPRA. En PRODUCCION no debe enviarse. */
  @ValidateIf(
    (o: CreateIngresoDto) =>
      o.motivo === MotivoIngreso.COMPRA || informado(o.id_proveedor),
  )
  @IsInt({ message: 'Debe indicar el proveedor' })
  @Min(1, { message: 'Debe indicar el proveedor' })
  id_proveedor?: number;

  /** Unidades que ingresan (entero > 0) */
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  /** Costo por unidad en COP. Obligatorio en COMPRA. */
  @ValidateIf(
    (o: CreateIngresoDto) =>
      o.motivo === MotivoIngreso.COMPRA || informado(o.costo_unitario),
  )
  @IsInt({ message: 'El costo unitario debe ser un número entero' })
  @Min(1, { message: 'El costo unitario debe ser mayor a 0' })
  costo_unitario?: number;

  /**
   * Fecha del ingreso (YYYY-MM-DD). Opcional: si no llega se usa la fecha y
   * hora actuales. No puede ser futura (se valida en el service).
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de ingreso debe tener el formato AAAA-MM-DD',
  })
  @IsISO8601(
    { strict: true },
    { message: 'La fecha de ingreso no es una fecha válida' },
  )
  fecha_ingreso?: string;

  /** Nota opcional (ej: "Lote #458, factura #123") */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Las observaciones deben ser texto' })
  @MaxLength(255, { message: 'Las observaciones admiten máximo 255 caracteres' })
  observaciones?: string;
}
