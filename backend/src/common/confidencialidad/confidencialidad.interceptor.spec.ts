/**
 * Pruebas unitarias: confidencialidad del costo de fabricación
 * ------------------------------------------------------------------
 * HU-2.2 · SCRUM-196 Pruebas de visibilidad por rol
 *
 * Valida:
 *   1. quitarCampos() elimina el campo a cualquier profundidad (objetos,
 *      arrays, entidades TypeORM, copias planas) sin mutar el original.
 *   2. Lista blanca: solo el Administrador ve el costo; un rol futuro
 *      ("Cocinero"), un usuario sin rol o una petición anónima NO lo ven.
 *   3. @OcultarANoAdmin agrega campos propios del endpoint.
 *
 * Ejecutar:  cd backend  ->  npm test
 */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ConfidencialidadInterceptor } from './confidencialidad.interceptor';
import { puedeVerCostos, quitarCampos } from './campos-confidenciales';
import { CAMPOS_OCULTOS_KEY } from './ocultar-a-no-admin.decorator';
import { ItemInventario, TipoItem } from '../../products/entities/item-inventario.entity';
import { RolUsuario } from '../../users/entities/user.entity';

/** Ítem como lo devuelve TypeORM (instancia de la entidad, no objeto plano) */
const nuevoItem = (): ItemInventario =>
  Object.assign(new ItemInventario(), {
    id_item: 1,
    id_categoria: 1,
    nombre: 'Choripán Pampero',
    tipo_item: TipoItem.PRODUCTO,
    cantidad_stock: 20,
    stock_minimo: 5,
    costo_fabricacion: 5500,
    precio_venta: 16000,
    estado_activo: true,
  });

describe('quitarCampos', () => {
  const COSTO = new Set(['costo_fabricacion']);

  it('quita el campo de una entidad y conserva el resto', () => {
    const limpio = quitarCampos(nuevoItem(), COSTO);
    expect(limpio).not.toHaveProperty('costo_fabricacion');
    expect(limpio).toMatchObject({ id_item: 1, nombre: 'Choripán Pampero', precio_venta: 16000 });
  });

  it('quita el campo en arrays y en objetos anidados (pedido -> detalles -> item)', () => {
    const pedido = {
      id_pedido: 7,
      detalles: [{ id_detalle: 1, item: nuevoItem() }, { id_detalle: 2, item: { ...nuevoItem() } }],
    };
    const limpio = quitarCampos({ pedido, extra: [[nuevoItem()]] }, COSTO);

    for (const d of limpio.pedido.detalles) {
      expect(d.item).not.toHaveProperty('costo_fabricacion');
      expect(d.item.nombre).toBe('Choripán Pampero');
    }
    expect(limpio.extra[0][0]).not.toHaveProperty('costo_fabricacion');
  });

  it('no muta el objeto original', () => {
    const item = nuevoItem();
    quitarCampos(item, COSTO);
    expect(item.costo_fabricacion).toBe(5500);
  });

  it('conserva fechas, null y primitivos como los serializaría JSON', () => {
    const fecha = new Date('2026-11-15T10:00:00.000Z');
    const limpio = quitarCampos({ fecha, nada: null, n: 3, s: 'x', b: false }, COSTO);
    expect(JSON.parse(JSON.stringify(limpio))).toEqual({
      fecha: '2026-11-15T10:00:00.000Z',
      nada: null,
      n: 3,
      s: 'x',
      b: false,
    });
  });

  it('tolera referencias circulares sin desbordar la pila', () => {
    const a: Record<string, unknown> = { costo_fabricacion: 1, nombre: 'a' };
    a.yo = a;
    const limpio = quitarCampos(a, COSTO) as Record<string, unknown>;
    expect(limpio).not.toHaveProperty('costo_fabricacion');
    expect(limpio.yo).toBe(limpio);
  });
});

describe('puedeVerCostos (lista blanca)', () => {
  it('solo el Administrador ve costos', () => {
    expect(puedeVerCostos({ rol: RolUsuario.ADMINISTRADOR })).toBe(true);
    expect(puedeVerCostos({ rol: RolUsuario.CAJERO })).toBe(false);
    expect(puedeVerCostos({ rol: RolUsuario.MESERO })).toBe(false);
  });

  it('un rol futuro, un rol vacío o la ausencia de usuario NO ven costos', () => {
    expect(puedeVerCostos({ rol: 'Cocinero' })).toBe(false);
    expect(puedeVerCostos({ rol: 'administrador' })).toBe(false); // sin coincidencia exacta no hay acceso
    expect(puedeVerCostos({ rol: '' })).toBe(false);
    expect(puedeVerCostos({})).toBe(false);
    expect(puedeVerCostos(null)).toBe(false);
    expect(puedeVerCostos(undefined)).toBe(false);
  });
});

describe('ConfidencialidadInterceptor', () => {
  const reflector = new Reflector();
  const interceptor = new ConfidencialidadInterceptor(reflector);

  const handler = () => undefined;
  class ControladorFalso {}

  const contexto = (user?: unknown): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => ControladorFalso,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const responder = (data: unknown): CallHandler => ({ handle: () => of(data) });
  const ejecutar = (user: unknown, data: unknown) =>
    lastValueFrom(interceptor.intercept(contexto(user), responder(data)));

  afterEach(() => Reflect.deleteMetadata(CAMPOS_OCULTOS_KEY, handler));

  it('Administrador: la respuesta sale intacta (mismo objeto, con costo)', async () => {
    const data = [nuevoItem()];
    const res = await ejecutar({ rol: RolUsuario.ADMINISTRADOR }, data);
    expect(res).toBe(data);
    expect((res as ItemInventario[])[0]).toHaveProperty('costo_fabricacion', 5500);
  });

  it.each([
    ['Cajero', { rol: RolUsuario.CAJERO }],
    ['Mesero', { rol: RolUsuario.MESERO }],
    ['rol futuro "Cocinero"', { rol: 'Cocinero' }],
    ['sin usuario (endpoint público)', undefined],
  ])('%s: no recibe costo_fabricacion', async (_nombre, user) => {
    const res = (await ejecutar(user, [nuevoItem()])) as object[];
    expect(res[0]).not.toHaveProperty('costo_fabricacion');
    expect(res[0]).toHaveProperty('nombre', 'Choripán Pampero');
  });

  it('@OcultarANoAdmin: quita también los campos propios del endpoint para no-admin', async () => {
    Reflect.defineMetadata(CAMPOS_OCULTOS_KEY, ['costo_unitario', 'total'], handler);
    const mov = { id_movimiento: 1, cantidad: 2, costo_unitario: 5500, total: 11000 };

    const cajero = await ejecutar({ rol: RolUsuario.CAJERO }, mov);
    expect(cajero).not.toHaveProperty('costo_unitario');
    expect(cajero).not.toHaveProperty('total');
    expect(cajero).toHaveProperty('cantidad', 2);

    const admin = await ejecutar({ rol: RolUsuario.ADMINISTRADOR }, mov);
    expect(admin).toEqual(mov);
  });

  it('no actúa fuera de HTTP', async () => {
    const ctx = { ...contexto(undefined), getType: () => 'rpc' } as unknown as ExecutionContext;
    const data = nuevoItem();
    expect(await lastValueFrom(interceptor.intercept(ctx, responder(data)))).toBe(data);
  });
});
