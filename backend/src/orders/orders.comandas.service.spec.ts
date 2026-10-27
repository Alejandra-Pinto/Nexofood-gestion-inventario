/**
 * Pruebas unitarias: OrdersService · HU-4.3 Actualizar comanda ante modificaciones
 * ------------------------------------------------------------------
 * SCRUM-184 · Criterios de aceptación:
 *   1. Producto adicional / cambio de cantidad -> comanda version N + 1 en PENDIENTE.
 *   2. Cambio de nota -> se actualiza la nota y se incrementa la versión.
 *   3. Pedido finalizado -> la modificación se rechaza (422) sin tocar la BD.
 *   4. Identificación de cambios -> la versión guarda qué cambió.
 *
 * Se mockean el DataSource y el EntityManager: no se usa la BD real.
 */
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OrdersService } from './orders.service';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { Comanda, EstadoImpresionComanda } from '../kitchen/entities/comanda.entity';
import { Adicional } from './entities/adicional.entity';
import { Promocion } from './entities/promocion.entity';
import { ItemInventario, TipoItem } from '../products/entities/item-inventario.entity';
import { ModificarPedidoDto } from './dto/modificar-pedido.dto';
import { RolUsuario } from '../users/entities/user.entity';

type Fila = Record<string, unknown>;

describe('OrdersService · HU-4.3 versionado de comandas', () => {
  let service: OrdersService;

  const items: Partial<ItemInventario>[] = [
    { id_item: 1, nombre: 'Choripán Pampero', tipo_item: TipoItem.PRODUCTO, cantidad_stock: 30, precio_venta: 16000, estado_activo: true },
    { id_item: 9, nombre: 'Cerveza', tipo_item: TipoItem.PRODUCTO, cantidad_stock: 30, precio_venta: 5000, estado_activo: true },
    { id_item: 12, nombre: 'Gaseosa', tipo_item: TipoItem.PRODUCTO, cantidad_stock: 30, precio_venta: 4000, estado_activo: true },
  ];

  /** Insumos que consumen los adicionales y el combo (stock reiniciado en cada prueba) */
  let insumos: Partial<ItemInventario>[];
  const adicionalesCatalogo = [
    { id_adicional: 3, nombre: 'Orégano', id_insumo: 100, cantidad_insumo: '1.000' },
  ];
  const promocionesCatalogo = [
    { id_promocion: 1, nombre: 'Combo con papa', id_insumo: 102, cantidad_insumo: 1 },
  ];

  let pedido: Fila;
  let detalles: Fila[];
  let ultimaComanda: Fila | null;
  let guardados: Fila[];

  const fila = (id_detalle: number, id_item: number, cantidad: number, precio: number, nota: string | null = null): Fila => ({
    id_detalle, id_pedido: 24, id_item, cantidad: String(cantidad), precio_unitario: precio,
    notas_especiales: nota, promocion_aplicada: null, id_comanda: 1, adicionales: [],
    item: items.find((i) => i.id_item === id_item),
  });

  const managerMock = {
    findOne: jest.fn((entidad: unknown) =>
      Promise.resolve(entidad === Pedido ? pedido : entidad === Comanda ? ultimaComanda : null),
    ),
    find: jest.fn((entidad: unknown) =>
      Promise.resolve(
        entidad === DetallePedido ? detalles
        : entidad === ItemInventario ? [...items, ...insumos]
        : entidad === Adicional ? adicionalesCatalogo
        : entidad === Promocion ? promocionesCatalogo
        : [],
      ),
    ),
    create: jest.fn((entidad: unknown, datos: Fila) => ({ __entidad: entidad, ...datos })),
    save: jest.fn((datos: Fila) => {
      if (datos.__entidad === Comanda) datos.id_comanda = 50;
      guardados.push(datos);
      return Promise.resolve(datos);
    }),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
  };

  const dataSourceMock = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(managerMock as unknown as EntityManager)),
    manager: managerMock,
  };

  const comandaGuardada = () => guardados.find((g) => g.__entidad === Comanda);
  const detallesNuevos = () => guardados.filter((g) => g.__entidad === DetallePedido);

  const modificar = (dto: ModificarPedidoDto) => service.modificar(24, dto, 3, RolUsuario.MESERO);

  beforeEach(async () => {
    jest.clearAllMocks();
    guardados = [];
    insumos = [
      { id_item: 100, nombre: 'Pan de orégano', tipo_item: TipoItem.INSUMO, cantidad_stock: 40, estado_activo: true },
      { id_item: 102, nombre: 'Papa a la francesa (porción)', tipo_item: TipoItem.INSUMO, cantidad_stock: 50, estado_activo: true },
    ];
    pedido = { id_pedido: 24, estado_pedido: EstadoPedido.EN_PREPARACION, total_calculado: 37000 };
    detalles = [fila(1, 1, 2, 16000), fila(2, 9, 1, 5000)];
    ultimaComanda = { id_comanda: 1, id_pedido: 24, version: 1, estado_impresion: EstadoImpresionComanda.IMPRESA };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Pedido), useValue: { findOne: jest.fn(() => Promise.resolve(pedido)) } },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 1 · producto adicional o cambio de cantidad (SCRUM-181)', () => {
    it('agregar 1x Cerveza genera la comanda v2 PENDIENTE con el cambio', async () => {
      await modificar({ detalles: [{ id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 2 }] });

      expect(comandaGuardada()).toMatchObject({
        id_pedido: 24,
        version: 2,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        cambios: [expect.objectContaining({ tipo: 'CANTIDAD_AUMENTADA', producto: 'Cerveza', cantidad: 1, texto: 'Se agregó 1x Cerveza (ahora 2)' })],
      });

      // La unidad nueva queda ligada a la nueva versión de la comanda
      expect(detallesNuevos()).toEqual([
        expect.objectContaining({ id_item: 9, cantidad: 1, precio_unitario: 5000, id_comanda: 50 }),
      ]);
      expect(pedido.total_calculado).toBe(2 * 16000 + 2 * 5000);
    });

    it('producto nuevo: "Se agregó 1x Gaseosa"', async () => {
      await modificar({ detalles: [{ id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 1 }, { id_item: 12, cantidad: 1 }] });
      expect(comandaGuardada()!.cambios).toEqual([expect.objectContaining({ tipo: 'AGREGADO', texto: 'Se agregó 1x Gaseosa' })]);
    });

    it('la versión anterior que seguía PENDIENTE queda REEMPLAZADA', async () => {
      await modificar({ detalles: [{ id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 2 }] });
      expect(managerMock.update).toHaveBeenCalledWith(
        Comanda,
        { id_pedido: 24, estado_impresion: EstadoImpresionComanda.PENDIENTE },
        { estado_impresion: EstadoImpresionComanda.REEMPLAZADA },
      );
    });

    it('si ya hay v2, la siguiente modificación genera la v3', async () => {
      ultimaComanda = { id_comanda: 7, id_pedido: 24, version: 2, estado_impresion: EstadoImpresionComanda.IMPRESA };
      await modificar({ detalles: [{ id_item: 1, cantidad: 3 }, { id_item: 9, cantidad: 1 }] });
      expect(comandaGuardada()).toMatchObject({ version: 3, estado_impresion: EstadoImpresionComanda.PENDIENTE });
    });

    it('en PENDIENTE se puede reducir o quitar productos y queda registrado', async () => {
      pedido.estado_pedido = EstadoPedido.PENDIENTE;
      await modificar({ detalles: [{ id_item: 1, cantidad: 1 }] });

      expect(managerMock.delete).toHaveBeenCalled(); // se quitó la cerveza
      expect(comandaGuardada()!.cambios).toEqual([
        expect.objectContaining({ tipo: 'CANTIDAD_REDUCIDA', texto: 'Se quitó 1x Choripán Pampero (ahora 1)' }),
        expect.objectContaining({ tipo: 'QUITADO', texto: 'Se quitó 1x Cerveza' }),
      ]);
      expect(pedido.total_calculado).toBe(16000);
    });

    it('en preparación no se puede reducir lo ya enviado a cocina', async () => {
      await expect(modificar({ detalles: [{ id_item: 1, cantidad: 1 }, { id_item: 9, cantidad: 1 }] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('si nada cambió no se genera una nueva versión ni se escribe nada', async () => {
      await modificar({ detalles: [{ id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 1 }] });
      expect(managerMock.save).not.toHaveBeenCalled();
      expect(managerMock.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 2 · cambio de nota (SCRUM-181/182)', () => {
    it('actualiza la nota del producto y genera la comanda v2', async () => {
      await modificar({
        detalles: [{ id_item: 1, cantidad: 2, notas_especiales: '  sin   cebolla ' }, { id_item: 9, cantidad: 1 }],
      });

      expect(comandaGuardada()).toMatchObject({
        version: 2,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        cambios: [expect.objectContaining({ tipo: 'NOTA', producto: 'Choripán Pampero', despues: 'sin cebolla', texto: 'Se agregó la nota "sin cebolla" en Choripán Pampero' })],
      });
      expect(detalles[0].notas_especiales).toBe('sin cebolla');
      expect(guardados).toContainEqual(expect.objectContaining({ id_detalle: 1, notas_especiales: 'sin cebolla' }));
    });

    it('la nota aplica a todas las unidades del producto (también a las nuevas)', async () => {
      detalles = [fila(1, 9, 1, 5000, 'sin hielo'), fila(2, 1, 2, 16000)];
      await modificar({ detalles: [{ id_item: 9, cantidad: 2, notas_especiales: 'con limón' }, { id_item: 1, cantidad: 2 }] });

      expect(detalles[0].notas_especiales).toBe('con limón');
      expect(detallesNuevos()).toContainEqual(expect.objectContaining({ id_item: 9, cantidad: 1, notas_especiales: 'con limón', id_comanda: 50 }));
      expect((comandaGuardada()!.cambios as { texto: string }[]).map((c) => c.texto)).toEqual([
        'Se agregó 1x Cerveza (ahora 2)',
        'Se modificó la nota de Cerveza: "con limón"',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 3 · pedido finalizado bloqueado (SCRUM-183)', () => {
    it.each([
      [EstadoPedido.LISTO, 'Listo para entrega'],
      [EstadoPedido.ENTREGADO, 'Entregado'],
      [EstadoPedido.PAGADO, 'Pagado'],
      [EstadoPedido.ANULADO, 'Anulado'],
    ])('estado %s: responde 422 PEDIDO_NO_MODIFICABLE sin tocar la BD', async (estado, etiqueta) => {
      pedido.estado_pedido = estado;
      const error = await modificar({ detalles: [{ id_item: 9, cantidad: 5 }] }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        codigo: 'PEDIDO_NO_MODIFICABLE',
        estado_pedido: estado,
        message: `El pedido #24 está ${etiqueta} y ya no admite modificaciones.`,
      });
      expect(managerMock.find).not.toHaveBeenCalled();
      expect(managerMock.save).not.toHaveBeenCalled();
      expect(managerMock.update).not.toHaveBeenCalled();
    });
  });

  it('no acepta promociones escritas a mano al modificar', async () => {
    await expect(
      modificar({ detalles: [{ id_item: 9, cantidad: 2, promocion_aplicada: '2x1 inventado' }, { id_item: 1, cantidad: 2 }] }),
    ).rejects.toThrow('se aplican desde "Nuevo choripán"');
    expect(managerMock.save).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  describe('Líneas con adicionales o combo (HU-3.2) editables por id_detalle', () => {
    /** "choripan clasico (+ Orégano, + Combo con papa)": $20.500 c/u (precio congelado) */
    const configurada = (cantidad = 1, nota: string | null = null): Fila => ({
      ...fila(5, 1, cantidad, 20500, nota),
      promocion_aplicada: 'Combo con papa',
      adicionales: [{ id_pedido_item_adicional: 70, id_detalle: 5, id_adicional: 3, cantidad: 1, precio_unitario: 1500, nombre_adicional: 'Orégano' }],
    });

    beforeEach(() => {
      detalles = [configurada(), fila(2, 9, 1, 5000)];
    });

    it('aumentar la cantidad actualiza ESA línea (sus adicionales siguen ligados) y genera la v2', async () => {
      await modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 1 }] });

      expect(managerMock.update).toHaveBeenCalledWith(DetallePedido, { id_detalle: 5 }, { cantidad: 2, notas_especiales: null });
      expect(managerMock.delete).not.toHaveBeenCalled(); // pedido_item_adicional intacto
      expect(detallesNuevos()).toEqual([]); // no se crea otra fila sin adicionales
      // Subtotal = (precio base/combo + Σ adicionales) × nueva cantidad
      expect(pedido.total_calculado).toBe(2 * 20500 + 5000);
      expect(comandaGuardada()).toMatchObject({
        version: 2,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        cambios: [expect.objectContaining({
          tipo: 'CANTIDAD_AUMENTADA',
          id_detalle: 5,
          texto: 'Se incrementó 1x Choripán Pampero (+ Orégano, + Combo con papa) (ahora 2)',
        })],
      });
    });

    it('cambiar la nota de la línea con adicionales queda en la comanda', async () => {
      await modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: 'sin cebolla' }, { id_item: 9, cantidad: 1 }] });

      expect(managerMock.update).toHaveBeenCalledWith(DetallePedido, { id_detalle: 5 }, { cantidad: 1, notas_especiales: 'sin cebolla' });
      expect((comandaGuardada()!.cambios as { texto: string }[]).map((c) => c.texto)).toEqual([
        'Se agregó la nota "sin cebolla" en Choripán Pampero (+ Orégano, + Combo con papa)',
      ]);
      expect(pedido.total_calculado).toBe(20500 + 5000);
    });

    it('la misma línea sin cambios no genera versión', async () => {
      await modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 1 }, { id_item: 9, cantidad: 1 }] });
      expect(managerMock.update).not.toHaveBeenCalled();
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('en preparación no se puede reducir ni quitar la línea con adicionales', async () => {
      detalles = [configurada(2), fila(2, 9, 1, 5000)];
      await expect(
        modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 1 }, { id_item: 9, cantidad: 1 }] }),
      ).rejects.toThrow('No se pueden eliminar ni reducir');
      await expect(modificar({ detalles: [{ id_item: 9, cantidad: 1 }] })).rejects.toThrow('No se pueden eliminar ni reducir');
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('en PENDIENTE quitarla la borra (sus adicionales se borran en cascada)', async () => {
      pedido.estado_pedido = EstadoPedido.PENDIENTE;
      await modificar({ detalles: [{ id_item: 9, cantidad: 1 }] });

      expect(managerMock.delete).toHaveBeenCalled();
      expect(comandaGuardada()!.cambios).toEqual([
        expect.objectContaining({ tipo: 'QUITADO', id_detalle: 5, texto: 'Se quitó 1x Choripán Pampero (+ Orégano, + Combo con papa)' }),
      ]);
      expect(pedido.total_calculado).toBe(5000);
    });

    it('valida el stock del insumo de sus adicionales al aumentar', async () => {
      insumos[0].cantidad_stock = 1; // Pan de orégano: queda 1
      const error = await modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 2 }, { id_item: 9, cantidad: 1 }] }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'STOCK_INSUFICIENTE',
        insumo: 'Pan de orégano',
        disponible: 1,
        requerido: 2,
      });
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('valida el stock del insumo del combo al aumentar', async () => {
      insumos[1].cantidad_stock = 2; // papas
      await expect(
        modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 3 }, { id_item: 9, cantidad: 1 }] }),
      ).rejects.toThrow('Papa a la francesa (porción) sin existencias suficientes. Quedan 2 unidades y el pedido requiere 3');
    });

    it('cambiar solo la nota no se bloquea aunque el insumo esté en 0', async () => {
      insumos[0].cantidad_stock = 0;
      await modificar({ detalles: [{ id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: 'bien cocido' }, { id_item: 9, cantidad: 1 }] });
      expect(comandaGuardada()).toBeTruthy();
    });

    it('una línea que no es del pedido se rechaza', async () => {
      await expect(
        modificar({ detalles: [{ id_detalle: 999, id_item: 1, cantidad: 1 }, { id_item: 9, cantidad: 1 }] }),
      ).rejects.toThrow('La línea #999 no pertenece al pedido #24');
    });
  });
});
