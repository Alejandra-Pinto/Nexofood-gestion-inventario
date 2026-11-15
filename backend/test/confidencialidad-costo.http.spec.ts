/**
 * Pruebas HTTP (supertest): visibilidad del costo de fabricación por rol
 * ------------------------------------------------------------------
 * HU-2.2 · SCRUM-196 Pruebas de visibilidad por rol
 *
 * Levanta los controladores REALES (Auth, Products, Orders, Kitchen, Inventory)
 * con sus guards (JwtAuthGuard + RolesGuard), el ValidationPipe de main.ts y el
 * ConfidencialidadInterceptor global. Cada usuario hace LOGIN REAL contra
 * POST /auth/login (bcrypt + JWT); solo se reemplaza la base de datos por mocks.
 *
 * InventoryService es el servicio real: así la fuga por derivación (producción
 * sin costo -> costo_unitario = costo_fabricacion) se prueba de verdad.
 *
 * Ejecutar:  cd backend  ->  npm test
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, EntityManager } from 'typeorm';

import { ConfidencialidadInterceptor } from '../src/common/confidencialidad/confidencialidad.interceptor';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { UsersService } from '../src/users/users.service';
import { RolUsuario, User } from '../src/users/entities/user.entity';
import { ProductsController } from '../src/products/products.controller';
import { ProductsService } from '../src/products/products.service';
import { ItemInventario, TipoItem } from '../src/products/entities/item-inventario.entity';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { Pedido, EstadoPedido } from '../src/orders/entities/pedido.entity';
import { DetallePedido } from '../src/orders/entities/detalle-pedido.entity';
import { KitchenController } from '../src/kitchen/kitchen.controller';
import { KitchenService } from '../src/kitchen/kitchen.service';
import { Comanda } from '../src/kitchen/entities/comanda.entity';
import { InventoryController } from '../src/inventory/inventory.controller';
import { InventoryService } from '../src/inventory/inventory.service';
import { MovimientoInventario } from '../src/inventory/entities/movimiento-inventario.entity';
import { Proveedor } from '../src/inventory/entities/proveedor.entity';

// ---------------------------------------------------------------------------
// Datos simulados (como los devolvería TypeORM: instancias de las entidades)
// ---------------------------------------------------------------------------
const COSTO = 5500;

const nuevoItem = (): ItemInventario =>
  Object.assign(new ItemInventario(), {
    id_item: 1,
    id_categoria: 1,
    nombre: 'Choripán Pampero',
    tipo_item: TipoItem.PRODUCTO,
    cantidad_stock: 20,
    stock_minimo: 5,
    costo_fabricacion: COSTO,
    precio_venta: 16000,
    estado_activo: true,
  });

const nuevoPedido = (): Pedido =>
  Object.assign(new Pedido(), {
    id_pedido: 10,
    numero_mesa: 3,
    estado_pedido: EstadoPedido.PENDIENTE,
    total_calculado: 32000,
    detalles: [
      Object.assign(new DetallePedido(), {
        id_detalle: 1,
        id_pedido: 10,
        id_item: 1,
        cantidad: 2,
        item: nuevoItem(),
        adicionales: [],
      }),
    ],
  });

const nuevaComanda = (): Comanda =>
  Object.assign(new Comanda(), { id_comanda: 5, id_pedido: 10, version: 1, pedido: nuevoPedido() });

const CLAVE = 'Clave123*';
const HASH = bcrypt.hashSync(CLAVE, 4);
const usuarios: Record<string, Partial<User>> = {
  'admin@chori.co': { id_usuario: 1, nombre_completo: 'Admin', rol: RolUsuario.ADMINISTRADOR },
  'cajero@chori.co': { id_usuario: 2, nombre_completo: 'Caja', rol: RolUsuario.CAJERO },
  'mesero@chori.co': { id_usuario: 3, nombre_completo: 'Mesa', rol: RolUsuario.MESERO },
};

// ---------------------------------------------------------------------------
// Mocks de servicios / BD
// ---------------------------------------------------------------------------
const productsMock = {
  findAll: jest.fn(async () => [nuevoItem(), { ...nuevoItem(), id_item: 2 }]),
  findOne: jest.fn(async () => nuevoItem()),
  alertasStock: jest.fn(async () => [nuevoItem()]),
  findCategorias: jest.fn(async () => []),
  create: jest.fn(async () => nuevoItem()),
};

const ordersMock = {
  listar: jest.fn(async () => [nuevoPedido(), nuevoPedido()]),
  buscarPorId: jest.fn(async () => nuevoPedido()),
  crear: jest.fn(async () => nuevoPedido()),
  cambiarEstado: jest.fn(async () => nuevoPedido()),
  registrarPago: jest.fn(async () => ({ pedido: nuevoPedido(), movimiento: { id_movimiento: 1 }, cambio: 0 })),
};

const kitchenMock = {
  listarPendientes: jest.fn(async () => [nuevaComanda()]),
  obtenerPorIdPedido: jest.fn(async () => nuevaComanda()),
};

/** EntityManager de la transacción de InventoryService.registrarIngreso */
const managerMock = {
  findOne: jest.fn(async (entidad: unknown) =>
    entidad === Proveedor ? { id_proveedor: 1, nombre: 'Proveedor', estado_activo: true } : nuevoItem(),
  ),
  update: jest.fn(async () => ({ affected: 1 })),
  create: jest.fn((_e: unknown, datos: object) => Object.assign(new MovimientoInventario(), datos)),
  save: jest.fn(async (datos: object) => Object.assign(datos, { id_movimiento: 99 })),
};
const dataSourceMock = {
  transaction: jest.fn((cb: (m: EntityManager) => unknown) => cb(managerMock as unknown as EntityManager)),
};

// ---------------------------------------------------------------------------

describe('HU-2.2 · Costo de fabricación por rol (HTTP + login real)', () => {
  let app: INestApplication<App>;
  const tokens: Record<'admin' | 'cajero' | 'mesero', string> = { admin: '', cajero: '', mesero: '' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        // Mismo secret que AuthModule / JwtStrategy
        JwtModule.register({ global: true, secret: 'super-_secret_key_nexofood', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController, ProductsController, OrdersController, KitchenController, InventoryController],
      providers: [
        AuthService,
        JwtStrategy,
        {
          provide: UsersService,
          useValue: {
            findByCredencial: jest.fn(async (c: string) =>
              usuarios[c] ? { ...usuarios[c], credencial: c, password_hash: HASH, estado_activo: true, permisos: null } : null,
            ),
          },
        },
        { provide: ProductsService, useValue: productsMock },
        { provide: OrdersService, useValue: ordersMock },
        { provide: KitchenService, useValue: kitchenMock },
        InventoryService,
        { provide: getRepositoryToken(MovimientoInventario), useValue: {} },
        { provide: getRepositoryToken(ItemInventario), useValue: {} },
        { provide: getRepositoryToken(Proveedor), useValue: { find: jest.fn(async () => []) } },
        { provide: DataSource, useValue: dataSourceMock },
        // Igual que AppModule
        { provide: APP_INTERCEPTOR, useClass: ConfidencialidadInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Igual que main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // Login real con cada rol
    for (const [clave, credencial] of [
      ['admin', 'admin@chori.co'],
      ['cajero', 'cajero@chori.co'],
      ['mesero', 'mesero@chori.co'],
    ] as const) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ credencial, password: CLAVE })
        .expect(200);
      tokens[clave] = res.body.access_token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /** Recorre la respuesta y devuelve cada objeto que represente un ítem de inventario */
  const itemsDe = (body: unknown): Record<string, unknown>[] => {
    const encontrados: Record<string, unknown>[] = [];
    const visitar = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(visitar);
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if ('id_item' in o && 'nombre' in o && 'tipo_item' in o) encontrados.push(o);
        Object.values(o).forEach(visitar);
      }
    };
    visitar(body);
    return encontrados;
  };

  type Rol = keyof typeof tokens;
  interface Caso {
    nombre: string;
    metodo: 'get' | 'post' | 'patch';
    url: string;
    body?: object;
    roles: Rol[];
  }

  // Tabla de exposición del Paso 0 (endpoints que devuelven ItemInventario)
  const casos: Caso[] = [
    { nombre: 'GET /products', metodo: 'get', url: '/products', roles: ['admin', 'cajero', 'mesero'] },
    { nombre: 'GET /products/:id', metodo: 'get', url: '/products/1', roles: ['admin', 'cajero', 'mesero'] },
    { nombre: 'GET /alerts', metodo: 'get', url: '/alerts', roles: ['admin', 'cajero', 'mesero'] },
    { nombre: 'GET /orders', metodo: 'get', url: '/orders', roles: ['admin', 'cajero', 'mesero'] },
    { nombre: 'GET /orders/:id', metodo: 'get', url: '/orders/10', roles: ['admin', 'cajero', 'mesero'] },
    {
      nombre: 'POST /orders',
      metodo: 'post',
      url: '/orders',
      body: { numero_mesa: 3, detalles: [{ id_item: 1, cantidad: 2 }] },
      roles: ['admin', 'cajero', 'mesero'],
    },
    {
      nombre: 'PATCH /orders/:id/estado',
      metodo: 'patch',
      url: '/orders/10/estado',
      body: { estado_pedido: EstadoPedido.EN_PREPARACION },
      roles: ['admin', 'cajero', 'mesero'],
    },
    {
      nombre: 'POST /orders/:id/pago',
      metodo: 'post',
      url: '/orders/10/pago',
      body: { medio_pago: 'EFECTIVO', monto_recibido: 32000 },
      roles: ['admin', 'cajero'],
    },
    {
      nombre: 'GET /kitchen/comandas/pendientes',
      metodo: 'get',
      url: '/kitchen/comandas/pendientes',
      roles: ['admin', 'cajero', 'mesero'],
    },
    {
      nombre: 'GET /kitchen/pedidos/:id/comanda',
      metodo: 'get',
      url: '/kitchen/pedidos/10/comanda',
      roles: ['admin', 'cajero', 'mesero'],
    },
  ];

  const llamar = (c: Caso, rol: Rol) => {
    const req = request(app.getHttpServer())[c.metodo](c.url).set('Authorization', `Bearer ${tokens[rol]}`);
    return c.body ? req.send(c.body) : req;
  };

  describe.each(casos)('$nombre', (c) => {
    it('ADMINISTRADOR: el costo de fabricación ESTÁ en cada ítem', async () => {
      const res = await llamar(c, 'admin');
      expect(res.status).toBeLessThan(300);
      const items = itemsDe(res.body);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(i).toHaveProperty('costo_fabricacion', COSTO);
    });

    it.each(c.roles.filter((r) => r !== 'admin'))('%s: el costo de fabricación NO existe en ningún ítem', async (rol) => {
      const res = await llamar(c, rol);
      expect(res.status).toBeLessThan(300);
      const items = itemsDe(res.body);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(i).not.toHaveProperty('costo_fabricacion');
      // Ni siquiera como texto en el body crudo
      expect(res.text).not.toContain('costo_fabricacion');
    });
  });

  it('MESERO · GET /orders/:id: respuesta anidada pedido -> detalles -> item sin costo, resto intacto', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders/10')
      .set('Authorization', `Bearer ${tokens.mesero}`)
      .expect(200);

    const detalle = res.body.detalles[0];
    expect(detalle.item).not.toHaveProperty('costo_fabricacion');
    expect(detalle.item).toMatchObject({ id_item: 1, nombre: 'Choripán Pampero', precio_venta: 16000 });
    expect(detalle.cantidad).toBe(2);
    expect(res.body.total_calculado).toBe(32000);
  });

  describe('POST /inventory/ingresos · fuga por derivación', () => {
    const produccionSinCosto = { id_item: 1, motivo: 'PRODUCCION', cantidad: 3 };

    it('CAJERO: producción sin costo no devuelve costo_unitario ni total (ni el costo copiado)', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/ingresos')
        .set('Authorization', `Bearer ${tokens.cajero}`)
        .send(produccionSinCosto)
        .expect(201);

      expect(res.body).not.toHaveProperty('costo_unitario');
      expect(res.body).not.toHaveProperty('total');
      expect(res.body).not.toHaveProperty('costo_fabricacion');
      expect(res.body).toMatchObject({ stock_anterior: 20, stock_nuevo: 23, cantidad: 3 });
      expect(res.text).not.toContain(String(COSTO));
      expect(res.text).not.toContain(String(COSTO * 3));

      // El servidor sí guardó el costo real: solo se oculta en la respuesta
      expect(managerMock.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ costo_unitario: COSTO, total: COSTO * 3 }),
      );
    });

    it('ADMINISTRADOR: misma petición devuelve costo_unitario y total (contrato sin cambios)', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/ingresos')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send(produccionSinCosto)
        .expect(201);

      expect(res.body).toHaveProperty('costo_unitario', COSTO);
      expect(res.body).toHaveProperty('total', COSTO * 3);
    });

    it('MESERO: no puede registrar ingresos (403)', async () => {
      await request(app.getHttpServer())
        .post('/inventory/ingresos')
        .set('Authorization', `Bearer ${tokens.mesero}`)
        .send(produccionSinCosto)
        .expect(403);
    });
  });

  describe('Escritura: un no-admin no puede enviar costo_fabricacion', () => {
    const nuevo = { id_categoria: 1, nombre: 'Nuevo', tipo_item: 'PRODUCTO', cantidad_stock: 1, stock_minimo: 0, costo_fabricacion: 100, precio_venta: 200 };

    it.each(['cajero', 'mesero'] as const)('%s: POST /products responde 403', async (rol) => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${tokens[rol]}`)
        .send(nuevo)
        .expect(403);
      expect(productsMock.create).not.toHaveBeenCalled();
    });

    it('cajero: costo_fabricacion en el body de un ingreso responde 400 (campo no permitido)', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/ingresos')
        .set('Authorization', `Bearer ${tokens.cajero}`)
        .send({ id_item: 1, motivo: 'PRODUCCION', cantidad: 1, costo_fabricacion: 1 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('costo_fabricacion');
    });
  });

  it('sin token: 401 y nada de datos', async () => {
    const res = await request(app.getHttpServer()).get('/products/1').expect(401);
    expect(res.text).not.toContain('costo_fabricacion');
  });
});
