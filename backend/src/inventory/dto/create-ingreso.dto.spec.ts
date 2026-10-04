/**
 * Pruebas unitarias: CreateIngresoDto
 * ------------------------------------------------------------------
 * HU-2.3 · SCRUM-130 Pruebas de ingresos de stock
 * Valida el contrato del endpoint POST /inventory/ingresos (datos inválidos).
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateIngresoDto } from './create-ingreso.dto';

/** Devuelve los nombres de los campos que fallan la validación */
const validar = async (datos: Record<string, unknown>) => {
  const errores = await validate(plainToInstance(CreateIngresoDto, datos));
  return errores.map((e) => e.property);
};

const compra = {
  id_item: 1,
  motivo: 'COMPRA',
  id_proveedor: 2,
  cantidad: 120,
  costo_unitario: 18000,
  fecha_ingreso: '2026-09-19',
  observaciones: 'Lote #458, factura #123',
};

const produccion = { id_item: 1, motivo: 'PRODUCCION', cantidad: 30 };

describe('CreateIngresoDto', () => {
  // ---------- Casos válidos ----------

  it('acepta una compra válida', async () => {
    expect(await validar(compra)).toEqual([]);
  });

  it('acepta una producción propia sin proveedor ni costo', async () => {
    expect(await validar(produccion)).toEqual([]);
  });

  it('acepta producción con costo unitario opcional', async () => {
    expect(await validar({ ...produccion, costo_unitario: 8400 })).toEqual([]);
  });

  // ---------- Cantidad ----------

  it.each([0, -5, 1.5])('rechaza cantidad inválida (%s)', async (cantidad) => {
    expect(await validar({ ...compra, cantidad })).toContain('cantidad');
  });

  it('rechaza cantidad no numérica', async () => {
    expect(await validar({ ...compra, cantidad: 'abc' })).toContain('cantidad');
  });

  it('exige cantidad', async () => {
    expect(await validar({ ...compra, cantidad: undefined })).toContain('cantidad');
  });

  // ---------- Ítem y tipo de ingreso ----------

  it('exige un id de ítem válido', async () => {
    expect(await validar({ ...compra, id_item: 0 })).toContain('id_item');
    expect(await validar({ ...compra, id_item: undefined })).toContain('id_item');
  });

  it('rechaza un tipo de ingreso desconocido', async () => {
    expect(await validar({ ...compra, motivo: 'MERMA' })).toContain('motivo');
    expect(await validar({ ...compra, motivo: undefined })).toContain('motivo');
  });

  // ---------- Reglas por tipo ----------

  it('COMPRA exige proveedor', async () => {
    expect(await validar({ ...compra, id_proveedor: undefined })).toContain('id_proveedor');
  });

  it('COMPRA exige costo unitario', async () => {
    expect(await validar({ ...compra, costo_unitario: undefined })).toContain('costo_unitario');
  });

  it.each([0, -18000, 10.5])('rechaza costo unitario inválido (%s)', async (costo) => {
    expect(await validar({ ...compra, costo_unitario: costo })).toContain('costo_unitario');
  });

  it('PRODUCCION no exige proveedor ni costo', async () => {
    const errores = await validar(produccion);
    expect(errores).not.toContain('id_proveedor');
    expect(errores).not.toContain('costo_unitario');
  });

  // ---------- Fecha y observaciones ----------

  it('rechaza fechas con formato incorrecto', async () => {
    expect(await validar({ ...compra, fecha_ingreso: '19/09/2026' })).toContain('fecha_ingreso');
  });

  it('rechaza fechas inexistentes', async () => {
    expect(await validar({ ...compra, fecha_ingreso: '2026-02-30' })).toContain('fecha_ingreso');
  });

  it('la fecha es opcional', async () => {
    expect(await validar({ ...compra, fecha_ingreso: undefined })).toEqual([]);
  });

  it('rechaza observaciones de más de 255 caracteres', async () => {
    expect(await validar({ ...compra, observaciones: 'x'.repeat(256) })).toContain('observaciones');
  });

  it('limpia espacios extra de las observaciones', () => {
    const dto = plainToInstance(CreateIngresoDto, { ...compra, observaciones: '  Lote 1  ' });
    expect(dto.observaciones).toBe('Lote 1');
  });
});
