/** Pruebas unitarias: CreateIngresoFinancieroDto - Validar monto inválido · Pruebas de ingresos */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateIngresoFinancieroDto } from './create-ingreso-financiero.dto';

const valido = {
  concepto: 'Aporte de socios',
  categoria: 'APORTE_SOCIOS',
  monto: 150000,
  medio_pago: 'TRANSFERENCIA',
  fecha: '2026-11-05',
};

async function errores(datos: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateIngresoFinancieroDto, datos);
  const lista = await validate(dto);
  return lista.map((e) => e.property);
}

describe('CreateIngresoFinancieroDto', () => {
  it('acepta un ingreso completo', async () => {
    expect(await errores(valido)).toEqual([]);
  });

  it.each([0, -1, 10.5, '5000', null, 100_000_001])('rechaza el monto inválido %p', async (monto) => {
    expect(await errores({ ...valido, monto })).toContain('monto');
  });

  it('rechaza concepto vacío, categoría o medio de pago desconocidos y fecha mal escrita', async () => {
    const e = await errores({ ...valido, concepto: '  ', categoria: 'VENTAS', medio_pago: 'BITCOIN', fecha: '06/11/2026' });
    expect(e).toEqual(expect.arrayContaining(['concepto', 'categoria', 'medio_pago', 'fecha']));
  });
});
