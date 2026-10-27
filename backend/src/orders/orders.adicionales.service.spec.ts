/**
 * Pruebas unitarias: OrdersService · HU-3.2 Adicionales, promociones, combos y notas
 * ------------------------------------------------------------------
 * Criterios de aceptación:
 *   1. Adicional agregado: se vincula al producto y actualiza el subtotal.
 *   2. Combo aplicado: calcula automáticamente su precio.
 *   3. Promoción no vigente: informa (422) y NO la aplica (no se guarda nada).
 *   4. Nota especial: queda en detalles_pedido.notas_especiales y en la comanda
 *      como "** SIN CEBOLLA **".
 *   5. Adicional sin stock: 400 STOCK_INSUFICIENTE y no se agrega.
 *   + Toda comanda nace con estado_impresion = 'PENDIENTE'.
 *
 * Se mockean el DataSource y el EntityManager: no se usa la BD real.
 */
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOperator } from 'typeorm';
import { OrdersService } from './orders.service';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { Adicional, TipoAdicional } from './entities/adicional.entity';
import { Promocion, TipoPromocion } from './entities/promocion.entity';
import { PedidoItemAdicional } from './entities/pedido-item-adicional.entity';
import {
  Comanda,
  EstadoImpresionComanda,
} from '../kitchen/entities/comanda.entity';
import {
  ItemInventario,
  TipoItem,
} from '../products/entities/item-inventario.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { RolUsuario } from '../users/entities/user.entity';

type Fila = Record<string, unknown>;

/** Lee el valor de un filtro In([...]) o un valor directo */
const valoresDe = (v: unknown): unknown[] =>
  v instanceof FindOperator ? (v.value as unknown[]) : [v];

describe('OrdersService · HU-3.2 adicionales, promociones, combos y notas', () => {
  let service: OrdersService;

  // ---------------- Catálogo simulado (como el seed de la migración 009) ----------------
  const CAT_CHORIPANES = 1;
  const CAT_BEBIDAS = 2;
  const ayer = new Date(Date.now() - 86_400_000);
  const enUnAno = new Date(Date.now() + 365 * 86_400_000);

  let items: Partial<ItemInventario>[];
  let adicionales: Partial<Adicional>[];
  let promociones: Partial<Promocion>[];

  /** Lo que se guardó en la BD simulada, por entidad */
  let guardados: Map<unknown, Fila[]>;
  let sec: number;

  const guardadosDe = (entidad: unknown) => guardados.get(entidad) ?? [];

  const managerMock = {
    findOne: jest.fn((_entidad: unknown, _opts?: unknown) =>
      Promise.resolve(null),
    ),
    find: jest.fn((entidad: unknown, opts?: { where?: Fila }) => {
      const tabla: Fila[] =
        entidad === ItemInventario
          ? (items as Fila[])
          : entidad === Adicional
            ? (adicionales as Fila[])
            : entidad === Promocion
              ? (promociones as Fila[])
              : [];
      const where = opts?.where ?? {};
      return Promise.resolve(
        tabla.filter((fila) =>
          Object.entries(where).every(([campo, v]) =>
            valoresDe(v).includes(fila[campo]),
          ),
        ),
      );
    }),
    create: jest.fn((entidad: unknown, datos: Fila) => ({
      __entidad: entidad,
      ...datos,
    })),
    save: jest.fn((datos: Fila | Fila[]) => {
      const lista = Array.isArray(datos) ? datos : [datos];
      for (const fila of lista) {
        const entidad = fila.__entidad;
        if (entidad === Pedido) fila.id_pedido = 10;
        if (entidad === Comanda) fila.id_comanda = 5;
        if (entidad === DetallePedido) fila.id_detalle = ++sec;
        guardados.set(entidad, [...guardadosDe(entidad), fila]);
      }
      return Promise.resolve(datos);
    }),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
  };

  const dataSourceMock = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(managerMock as unknown as EntityManager),
    ),
    manager: managerMock,
  };

  const pedidosRepoMock = {
    findOne: jest.fn(() => Promise.resolve({ id_pedido: 10, detalles: [] })),
  };

  /** Verifica que NO se escribió nada en la BD */
  const noEscribio = () => {
    expect(managerMock.save).not.toHaveBeenCalled();
  };

  const pedidoGuardado = () => guardadosDe(Pedido)[0];
  const detallesGuardados = () => guardadosDe(DetallePedido);

  beforeEach(async () => {
    jest.clearAllMocks();
    guardados = new Map();
    sec = 0;

    items = [
      {
        id_item: 1,
        id_categoria: CAT_CHORIPANES,
        nombre: 'Choripán Pampero',
        tipo_item: TipoItem.PRODUCTO,
        cantidad_stock: 20,
        precio_venta: 16000,
        estado_activo: true,
      },
      {
        id_item: 9,
        id_categoria: CAT_BEBIDAS,
        nombre: 'Cerveza',
        tipo_item: TipoItem.PRODUCTO,
        cantidad_stock: 50,
        precio_venta: 5000,
        estado_activo: true,
      },
      {
        id_item: 100,
        id_categoria: 5,
        nombre: 'Pan ciabatta',
        tipo_item: TipoItem.INSUMO,
        cantidad_stock: 40,
        precio_venta: 0,
        estado_activo: true,
      },
      {
        id_item: 101,
        id_categoria: 6,
        nombre: 'Chimichurri rojo',
        tipo_item: TipoItem.INSUMO,
        cantidad_stock: 5,
        precio_venta: 0,
        estado_activo: true,
      },
      {
        id_item: 102,
        id_categoria: 3,
        nombre: 'Papa a la francesa (porción)',
        tipo_item: TipoItem.INSUMO,
        cantidad_stock: 50,
        precio_venta: 0,
        estado_activo: true,
      },
    ];

    adicionales = [
      {
        id_adicional: 1,
        nombre: 'Ciabatta',
        tipo: TipoAdicional.PAN,
        id_insumo: 100,
        cantidad_insumo: '1.000' as unknown as number,
        precio_adicional: 0,
        id_categoria: CAT_CHORIPANES,
        estado_activo: true,
      },
      {
        id_adicional: 2,
        nombre: 'Chimi Rojo',
        tipo: TipoAdicional.ADEREZO,
        id_insumo: 101,
        cantidad_insumo: 1,
        precio_adicional: 0,
        id_categoria: CAT_CHORIPANES,
        estado_activo: true,
      },
      {
        id_adicional: 3,
        nombre: 'Aderezo adicional extra',
        tipo: TipoAdicional.EXTRA,
        id_insumo: null,
        cantidad_insumo: 1,
        precio_adicional: 1500,
        id_categoria: CAT_CHORIPANES,
        estado_activo: true,
      },
      {
        id_adicional: 4,
        nombre: 'Orégano',
        tipo: TipoAdicional.PAN,
        id_insumo: 100,
        cantidad_insumo: 1,
        precio_adicional: 0,
        id_categoria: CAT_CHORIPANES,
        estado_activo: true,
      },
      {
        id_adicional: 5,
        nombre: 'Tocineta',
        tipo: TipoAdicional.EXTRA,
        id_insumo: null,
        cantidad_insumo: 1,
        precio_adicional: 3000,
        id_categoria: CAT_CHORIPANES,
        estado_activo: false,
      },
    ];

    promociones = [
      {
        id_promocion: 1,
        nombre: 'Combo con papa',
        tipo: TipoPromocion.COMBO,
        recargo: 3000,
        precio_final: null,
        porcentaje_descuento: 0,
        id_categoria: CAT_CHORIPANES,
        id_insumo: 102,
        cantidad_insumo: 1,
        vigente_desde: ayer,
        vigente_hasta: enUnAno,
        estado_activo: true,
      },
      {
        id_promocion: 2,
        nombre: 'Combo con gaseosa',
        tipo: TipoPromocion.COMBO,
        recargo: 4000,
        precio_final: null,
        porcentaje_descuento: 0,
        id_categoria: CAT_CHORIPANES,
        id_insumo: null,
        cantidad_insumo: 1,
        vigente_desde: ayer,
        vigente_hasta: enUnAno,
        estado_activo: false,
      },
      {
        id_promocion: 3,
        nombre: 'Combo de verano',
        tipo: TipoPromocion.COMBO,
        recargo: 2000,
        precio_final: null,
        porcentaje_descuento: 0,
        id_categoria: null,
        id_insumo: null,
        cantidad_insumo: 1,
        vigente_desde: new Date('2026-01-01'),
        vigente_hasta: new Date('2026-03-31'),
        estado_activo: true,
      },
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Pedido), useValue: pedidosRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  const pedido = (detalles: CreatePedidoDto['detalles']): CreatePedidoDto => ({
    numero_mesa: 4,
    detalles,
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 1 · Adicional agregado (SCRUM-152)', () => {
    it('vincula los adicionales a la línea y suma +$1.500 al precio unitario y al subtotal', async () => {
      await service.crear(
        pedido([
          {
            id_item: 1,
            cantidad: 2,
            adicionales: [
              { id_adicional: 1 },
              { id_adicional: 2 },
              { id_adicional: 3 },
            ],
          },
        ]),
        7,
      );

      const [detalle] = detallesGuardados();
      expect(detalle).toMatchObject({
        id_item: 1,
        cantidad: 2,
        precio_unitario: 17500,
      });
      expect(pedidoGuardado().total_calculado).toBe(35000); // (16.000 + 1.500) × 2

      const vinculados = guardadosDe(PedidoItemAdicional);
      expect(vinculados).toHaveLength(3);
      expect(vinculados).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id_detalle: detalle.id_detalle,
            id_adicional: 3,
            cantidad: 1,
            precio_unitario: 1500,
            nombre_adicional: 'Aderezo adicional extra',
          }),
          expect.objectContaining({
            id_detalle: detalle.id_detalle,
            id_adicional: 2,
            precio_unitario: 0,
            nombre_adicional: 'Chimi Rojo',
          }),
        ]),
      );
    });

    it('cotizar devuelve el subtotal actualizado sin guardar nada', async () => {
      const r = await service.cotizar({
        detalles: [
          { id_item: 1, cantidad: 3, adicionales: [{ id_adicional: 3 }] },
        ],
      });

      expect(r.lineas[0]).toMatchObject({
        precio_base: 16000,
        precio_unitario: 17500,
        subtotal: 52500,
      });
      expect(r.total).toBe(52500);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      noEscribio();
    });

    it('el mismo producto con distintos adicionales queda en líneas separadas', async () => {
      await service.crear(
        pedido([
          { id_item: 1, cantidad: 1, adicionales: [{ id_adicional: 3 }] },
          { id_item: 1, cantidad: 1 },
          { id_item: 1, cantidad: 2, adicionales: [{ id_adicional: 3 }] }, // igual a la primera: se suma
        ]),
        7,
      );

      const detalles = detallesGuardados();
      expect(detalles).toHaveLength(2);
      expect(detalles[0]).toMatchObject({
        cantidad: 3,
        precio_unitario: 17500,
      });
      expect(detalles[1]).toMatchObject({
        cantidad: 1,
        precio_unitario: 16000,
      });
      expect(pedidoGuardado().total_calculado).toBe(3 * 17500 + 16000);
    });

    it('rechaza un adicional inactivo, inexistente o de otra categoría sin guardar', async () => {
      await expect(
        service.crear(
          pedido([
            { id_item: 1, cantidad: 1, adicionales: [{ id_adicional: 5 }] },
          ]),
          7,
        ),
      ).rejects.toThrow('El adicional "Tocineta" no está disponible');
      await expect(
        service.crear(
          pedido([
            { id_item: 1, cantidad: 1, adicionales: [{ id_adicional: 99 }] },
          ]),
          7,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.crear(
          pedido([
            { id_item: 9, cantidad: 1, adicionales: [{ id_adicional: 3 }] },
          ]),
          7,
        ),
      ).rejects.toThrow('no aplica a "Cerveza"');
      noEscribio();
    });

    it('no permite dos tipos de pan en el mismo choripán', async () => {
      await expect(
        service.crear(
          pedido([
            {
              id_item: 1,
              cantidad: 1,
              adicionales: [{ id_adicional: 1 }, { id_adicional: 4 }],
            },
          ]),
          7,
        ),
      ).rejects.toThrow('Solo se puede elegir un tipo de pan');
      noEscribio();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 2 · Combo aplicado (SCRUM-153)', () => {
    it('Combo con papa: $16.000 -> $19.000 y queda en promocion_aplicada', async () => {
      await service.crear(
        pedido([{ id_item: 1, cantidad: 2, id_promocion: 1 }]),
        7,
      );

      expect(detallesGuardados()[0]).toMatchObject({
        precio_unitario: 19000,
        promocion_aplicada: 'Combo con papa',
      });
      expect(pedidoGuardado().total_calculado).toBe(38000);
    });

    it('combo + adicional extra = $20.500 por unidad', async () => {
      const r = await service.cotizar({
        detalles: [
          {
            id_item: 1,
            cantidad: 1,
            id_promocion: 1,
            adicionales: [{ id_adicional: 3 }],
          },
        ],
      });
      expect(r.lineas[0]).toMatchObject({
        precio_base: 19000,
        precio_unitario: 20500,
        promocion_aplicada: 'Combo con papa',
      });
      expect(r.lineas[0].lineas_cocina).toContain('+ Combo con papa');
    });

    it('valida el stock del insumo del combo (papas)', async () => {
      items.find((i) => i.id_item === 102)!.cantidad_stock = 1;
      await expect(
        service.crear(
          pedido([{ id_item: 1, cantidad: 2, id_promocion: 1 }]),
          7,
        ),
      ).rejects.toThrow(
        'Papa a la francesa (porción) sin existencias suficientes. Quedan 1 unidades y el pedido requiere 2',
      );
      noEscribio();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 3 · Promoción no vigente (SCRUM-155)', () => {
    it.each([
      ['inactiva', 2, 'Combo con gaseosa'],
      ['vencida', 3, 'Combo de verano'],
    ])(
      'promoción %s: responde 422 PROMOCION_NO_VIGENTE y no la aplica',
      async (_caso, id, nombre) => {
        const error = await service
          .crear(pedido([{ id_item: 1, cantidad: 1, id_promocion: id }]), 7)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnprocessableEntityException);
        const respuesta = (
          error as UnprocessableEntityException
        ).getResponse() as Fila;
        expect(respuesta).toMatchObject({
          codigo: 'PROMOCION_NO_VIGENTE',
          id_promocion: id,
        });
        expect(respuesta.message).toBe(
          `La promoción "${nombre}" no está vigente y no se aplicó al pedido`,
        );
        noEscribio();
      },
    );

    it('opciones() solo lista las promociones vigentes', async () => {
      promociones.forEach(
        (p) =>
          (p.insumo = items.find(
            (i) => i.id_item === p.id_insumo,
          ) as ItemInventario),
      );
      const r = await service.opciones();
      expect(r.promociones.map((p) => p.nombre)).toEqual(['Combo con papa']);
      expect(r.promociones[0]).toMatchObject({
        recargo: 3000,
        stock_disponible: 50,
        disponible: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 4 · Nota especial registrada (SCRUM-154)', () => {
    it('guarda la nota limpia en notas_especiales', async () => {
      await service.crear(
        pedido([
          { id_item: 1, cantidad: 1, notas_especiales: '  sin   cebolla ' },
        ]),
        7,
      );
      expect(detallesGuardados()[0].notas_especiales).toBe('sin cebolla');
    });

    it('en la comanda la nota sale resaltada: ** SIN CEBOLLA **', async () => {
      const r = await service.cotizar({
        detalles: [
          {
            id_item: 1,
            cantidad: 1,
            adicionales: [{ id_adicional: 2 }],
            notas_especiales: 'sin cebolla',
          },
        ],
      });
      expect(r.lineas[0].lineas_cocina).toEqual([
        '1x CHORIPAN PAMPERO',
        '+ Chimi Rojo',
        '** SIN CEBOLLA **',
      ]);
    });

    it('una nota de más de 255 caracteres se rechaza', async () => {
      await expect(
        service.crear(
          pedido([
            { id_item: 1, cantidad: 1, notas_especiales: 'x'.repeat(256) },
          ]),
          7,
        ),
      ).rejects.toThrow('máximo 255 caracteres');
      noEscribio();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Criterio 5 · Adicional no disponible por stock (SCRUM-155, prototipo 21)', () => {
    it('Chimichurri: "Quedan 5 unidades y el pedido requiere 8" y no se agrega', async () => {
      const error = await service
        .crear(
          pedido([
            { id_item: 1, cantidad: 8, adicionales: [{ id_adicional: 2 }] },
          ]),
          7,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const respuesta = (error as BadRequestException).getResponse() as Fila;
      expect(respuesta).toMatchObject({
        codigo: 'STOCK_INSUFICIENTE',
        insumo: 'Chimichurri rojo',
        adicionales: ['Chimi Rojo'],
        disponible: 5,
        requerido: 8,
      });
      expect(respuesta.message).toContain(
        'Chimichurri rojo sin existencias suficientes. Quedan 5 unidades y el pedido requiere 8',
      );
      noEscribio();
    });

    it('suma lo que piden TODAS las líneas del pedido para el mismo insumo', async () => {
      await expect(
        service.cotizar({
          detalles: [
            { id_item: 1, cantidad: 3, adicionales: [{ id_adicional: 2 }] },
            {
              id_item: 1,
              cantidad: 3,
              adicionales: [{ id_adicional: 2 }],
              notas_especiales: 'sin cebolla',
            },
          ],
        }),
      ).rejects.toThrow('Quedan 5 unidades y el pedido requiere 6');
    });

    it('un insumo inactivo cuenta como sin existencias', async () => {
      items.find((i) => i.id_item === 100)!.estado_activo = false;
      await expect(
        service.cotizar({
          detalles: [
            { id_item: 1, cantidad: 1, adicionales: [{ id_adicional: 1 }] },
          ],
        }),
      ).rejects.toThrow(
        'Pan ciabatta sin existencias suficientes. Quedan 0 unidades',
      );
    });

    it('opciones() marca el adicional como no disponible cuando su insumo está en 0', async () => {
      items.find((i) => i.id_item === 101)!.cantidad_stock = 0;
      adicionales.forEach(
        (a) =>
          (a.insumo = (items.find((i) => i.id_item === a.id_insumo) ??
            null) as ItemInventario | null),
      );

      const r = await service.opciones();
      const chimi = r.adicionales.find((a) => a.nombre === 'Chimi Rojo')!;
      const extra = r.adicionales.find(
        (a) => a.nombre === 'Aderezo adicional extra',
      )!;
      expect(chimi).toMatchObject({
        stock_disponible: 0,
        disponible: false,
        insumo: 'Chimichurri rojo',
      });
      expect(extra).toMatchObject({ stock_disponible: null, disponible: true });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Comanda generada', () => {
    it('nace con estado_impresion = PENDIENTE y todas las líneas apuntan a ella', async () => {
      await service.crear(
        pedido([
          {
            id_item: 1,
            cantidad: 1,
            id_promocion: 1,
            notas_especiales: 'sin cebolla',
          },
          { id_item: 9, cantidad: 2 },
        ]),
        7,
      );

      const [comanda] = guardadosDe(Comanda);
      expect(comanda).toMatchObject({
        id_pedido: 10,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
      expect(detallesGuardados().every((d) => d.id_comanda === 5)).toBe(true);
      expect(pedidoGuardado()).toMatchObject({
        estado_pedido: EstadoPedido.PENDIENTE,
        total_calculado: 19000 + 10000,
      });
    });

    it('un pedido vacío se rechaza antes de abrir la transacción', async () => {
      await expect(service.crear({ detalles: [] }, 7)).rejects.toThrow(
        'al menos un producto',
      );
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Compatibilidad con HU-3.3 (modificar pedido)', () => {
    it('conserva las líneas configuradas y suma su valor al total', async () => {
      const configurada = {
        id_detalle: 1,
        id_pedido: 10,
        id_item: 1,
        cantidad: '1',
        precio_unitario: 20500,
        promocion_aplicada: 'Combo con papa',
        notas_especiales: null,
        adicionales: [{ id_adicional: 3 }],
        item: items[0],
      };
      const simple = {
        id_detalle: 2,
        id_pedido: 10,
        id_item: 9,
        cantidad: '1',
        precio_unitario: 5000,
        promocion_aplicada: null,
        notas_especiales: null,
        adicionales: [],
        item: items[1],
      };
      const pedidoActual = {
        id_pedido: 10,
        estado_pedido: EstadoPedido.PENDIENTE,
        total_calculado: 25500,
      };

      managerMock.findOne.mockResolvedValueOnce(pedidoActual as never);
      managerMock.find.mockImplementationOnce(
        () => Promise.resolve([configurada, simple]) as never,
      );

      await service.modificar(
        10,
        { detalles: [{ id_item: 9, cantidad: 3 }] },
        7,
        RolUsuario.MESERO,
      );

      expect(managerMock.delete).not.toHaveBeenCalled(); // la línea configurada no se borra
      expect(pedidoActual.total_calculado).toBe(20500 + 3 * 5000);
    });
  });
});
