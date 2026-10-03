import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './create-item.dto';

// SCRUM-124 / SCRUM-125 · Validación de campos obligatorios
const validar = async (datos: Record<string, unknown>) => {
  const errores = await validate(plainToInstance(CreateItemDto, datos));
  return errores.map((e) => e.property);
};

const base = {
  nombre: 'Gaseosa 400 ml',
  tipo_item: 'PRODUCTO',
  id_categoria: 2,
  cantidad_stock: 24,
  stock_minimo: 6,
  costo_fabricacion: 2200,
  precio_venta: 4000,
};

describe('CreateItemDto', () => {
  it('acepta un producto válido', async () => {
    expect(await validar(base)).toEqual([]);
  });

  it('exige nombre, tipo y categoría', async () => {
    const errores = await validar({ ...base, nombre: '   ', tipo_item: undefined, id_categoria: undefined });
    expect(errores).toEqual(expect.arrayContaining(['nombre', 'tipo_item', 'id_categoria']));
  });

  it('no permite stock ni costos negativos', async () => {
    const errores = await validar({ ...base, cantidad_stock: -1, stock_minimo: -2, costo_fabricacion: -5 });
    expect(errores).toEqual(expect.arrayContaining(['cantidad_stock', 'stock_minimo', 'costo_fabricacion']));
  });

  it('exige precio de venta para productos', async () => {
    expect(await validar({ ...base, precio_venta: 0 })).toContain('precio_venta');
  });

  it('no exige precio de venta para insumos', async () => {
    expect(await validar({ ...base, tipo_item: 'INSUMO', precio_venta: undefined })).toEqual([]);
  });

  it('limpia espacios extra del nombre', async () => {
    const dto = plainToInstance(CreateItemDto, { ...base, nombre: '  Pan   baguette ' });
    expect(dto.nombre).toBe('Pan baguette');
  });
});
