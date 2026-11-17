/**
 * Pruebas E2E / Sistema: Flujo Completo de Pedidos, Cocina y Cobro
 * ------------------------------------------------------------------
 * Cubre:
 * - HU-3.1 Registrar un nuevo pedido
 * - HU-3.2 Agregar adicionales y promociones
 * - HU-4.1 Generar comanda de cocina automáticamente
 * - HU-3.4 Transición de estados (PENDIENTE -> EN_PREPARACION -> LISTO)
 * - HU-3.5 Registrar método de pago y cobro
 * - HU-7.3 Registro de movimiento financiero
 */
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { KitchenController } from '../src/kitchen/kitchen.controller';
import { KitchenService } from '../src/kitchen/kitchen.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolUsuario } from '../src/users/entities/user.entity';
import { EstadoPedido, Pedido } from '../src/orders/entities/pedido.entity';
import { Comanda, EstadoImpresionComanda } from '../src/kitchen/entities/comanda.entity';

class JwtAuthSimulado implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.includes('token-mesero')) {
      req.user = { id_usuario: 3, rol: RolUsuario.MESERO, nombre_completo: 'Juan Mesero' };
    } else if (authHeader.includes('token-cajero')) {
      req.user = { id_usuario: 2, rol: RolUsuario.CAJERO, nombre_completo: 'Carlos Cajero' };
    } else {
      req.user = { id_usuario: 1, rol: RolUsuario.ADMINISTRADOR, nombre_completo: 'Admin General' };
    }
    return true;
  }
}

describe('E2E Sistema · Flujo Completo Pedido -> Cocina -> Cobro en Caja (HU-3.1, HU-3.4, HU-3.5, HU-4.1)', () => {
  let app: INestApplication<App>;
  const tokenMesero = 'Bearer token-mesero';
  const tokenCajero = 'Bearer token-cajero';

  const pedidoMock: Pedido = Object.assign(new Pedido(), {
    id_pedido: 101,
    numero_mesa: 5,
    estado_pedido: EstadoPedido.PENDIENTE,
    total_calculado: 24000,
    detalles: [
      {
        id_detalle: 1,
        id_pedido: 101,
        id_item: 1,
        cantidad: 2,
        precio_unitario: 12000,
        subtotal: 24000,
        adicionales: [],
      },
    ],
  });

  const comandaMock: Comanda = Object.assign(new Comanda(), {
    id_comanda: 1,
    id_pedido: 101,
    version: 1,
    estado_impresion: EstadoImpresionComanda.PENDIENTE,
    pedido: pedidoMock,
  });

  const ordersServiceMock = {
    crear: jest.fn().mockImplementation(async (dto) => {
      return {
        ...pedidoMock,
        numero_mesa: dto.numero_mesa,
        estado_pedido: EstadoPedido.PENDIENTE,
      };
    }),
    buscarPorId: jest.fn().mockImplementation(async (id) => {
      return { ...pedidoMock, id_pedido: id };
    }),
    cambiarEstado: jest.fn().mockImplementation(async (id, dto) => {
      return { ...pedidoMock, id_pedido: id, estado_pedido: dto.estado_pedido };
    }),
    registrarPago: jest.fn().mockImplementation(async (id, dto, idUsuario) => {
      return {
        pedido: { ...pedidoMock, id_pedido: id, estado_pedido: EstadoPedido.PAGADO },
        movimiento: { id_movimiento: 50, monto: 24000, tipo_movimiento: 'INGRESO', concepto: 'Venta mesa 5' },
        cambio: 6000,
      };
    }),
  };

  const kitchenServiceMock = {
    obtenerPorIdPedido: jest.fn().mockResolvedValue(comandaMock),
    listarPendientes: jest.fn().mockResolvedValue([comandaMock]),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController, KitchenController],
      providers: [
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: KitchenService, useValue: kitchenServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(JwtAuthSimulado)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Paso 1: Mesero crea un pedido en la Mesa 5 exitosamente (HU-3.1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', tokenMesero)
      .send({
        numero_mesa: 5,
        detalles: [{ id_item: 1, cantidad: 2 }],
      })
      .expect(201);

    expect(res.body).toHaveProperty('id_pedido', 101);
    expect(res.body.numero_mesa).toBe(5);
    expect(res.body.estado_pedido).toBe(EstadoPedido.PENDIENTE);
    expect(ordersServiceMock.crear).toHaveBeenCalled();
  });

  it('Paso 2: Cocina consulta la comanda generada automáticamente (HU-4.1)', async () => {
    const res = await request(app.getHttpServer())
      .get('/kitchen/pedidos/101/comanda')
      .set('Authorization', tokenMesero)
      .expect(200);

    expect(res.body).toHaveProperty('id_comanda', 1);
    expect(res.body.id_pedido).toBe(101);
    expect(res.body.estado_impresion).toBe(EstadoImpresionComanda.PENDIENTE);
  });

  it('Paso 3: Transición de estado a EN_PREPARACION y luego LISTO (HU-3.4)', async () => {
    const resEnPrep = await request(app.getHttpServer())
      .patch('/orders/101/estado')
      .set('Authorization', tokenMesero)
      .send({ estado_pedido: EstadoPedido.EN_PREPARACION })
      .expect(200);

    expect(resEnPrep.body.estado_pedido).toBe(EstadoPedido.EN_PREPARACION);

    const resListo = await request(app.getHttpServer())
      .patch('/orders/101/estado')
      .set('Authorization', tokenMesero)
      .send({ estado_pedido: EstadoPedido.LISTO })
      .expect(200);

    expect(resListo.body.estado_pedido).toBe(EstadoPedido.LISTO);
  });

  it('Paso 4: Mesero NO tiene autorización para cobrar el pedido (DEF-010 / RBAC)', async () => {
    await request(app.getHttpServer())
      .post('/orders/101/pago')
      .set('Authorization', tokenMesero)
      .send({ medio_pago: 'EFECTIVO', monto_recibido: 30000 })
      .expect(403);
  });

  it('Paso 5: Cajero cobra el pedido en caja, registrando el pago y movimiento financiero (HU-3.5, HU-7.3)', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders/101/pago')
      .set('Authorization', tokenCajero)
      .send({ medio_pago: 'EFECTIVO', monto_recibido: 30000 })
      .expect(201);

    expect(res.body.pedido.estado_pedido).toBe(EstadoPedido.PAGADO);
    expect(res.body).toHaveProperty('movimiento');
    expect(res.body.movimiento.monto).toBe(24000);
    expect(res.body.cambio).toBe(6000);
  });
});
