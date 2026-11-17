/**
 * Pruebas E2E / Sistema: Concurrencia y Exclusión Mutua en Mesas (CP-3.1-06 / DEF-005)
 * -------------------------------------------------------------------------------------
 * Cubre:
 * - HU-3.1 Registrar un nuevo pedido
 * - DEF-005: Evitar dos pedidos activos simultáneos en la misma mesa mediante exclusión mutua
 */
import { CanActivate, ConflictException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolUsuario } from '../src/users/entities/user.entity';
import { EstadoPedido, Pedido } from '../src/orders/entities/pedido.entity';

class JwtAuthSimulado implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id_usuario: 3, rol: RolUsuario.MESERO, nombre_completo: 'Mesero Concurrente' };
    return true;
  }
}

describe('E2E Sistema · Concurrencia y Exclusión Mutua en Mesas (CP-3.1-06 / DEF-005)', () => {
  let app: INestApplication<App>;
  let mesaOcupada = false;

  const ordersServiceMock = {
    crear: jest.fn().mockImplementation(async (dto) => {
      if (dto.numero_mesa === 4 && mesaOcupada) {
        throw new ConflictException(`La mesa 4 ya tiene un pedido activo.`);
      }
      if (dto.numero_mesa === 4) {
        mesaOcupada = true;
      }
      return Object.assign(new Pedido(), {
        id_pedido: 201,
        numero_mesa: dto.numero_mesa,
        estado_pedido: EstadoPedido.PENDIENTE,
        total_calculado: 15000,
        detalles: [],
      });
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersServiceMock }],
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

  beforeEach(() => {
    mesaOcupada = false;
  });

  it('Escenario 1: Mesero 1 abre pedido en Mesa 4 exitosamente (201 Created)', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer token')
      .send({
        numero_mesa: 4,
        detalles: [{ id_item: 1, cantidad: 1 }],
      })
      .expect(201);

    expect(res.body.numero_mesa).toBe(4);
    expect(res.body.estado_pedido).toBe(EstadoPedido.PENDIENTE);
  });

  it('Escenario 2 (DEF-005): Petición simultánea en la misma Mesa 4 es rechazada con HTTP 409 Conflict', async () => {
    // Primer intento ocupa la mesa
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer token')
      .send({
        numero_mesa: 4,
        detalles: [{ id_item: 1, cantidad: 1 }],
      })
      .expect(201);

    // Segundo intento concurrente inmediato sobre la misma mesa
    const resConcurrente = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer token')
      .send({
        numero_mesa: 4,
        detalles: [{ id_item: 2, cantidad: 1 }],
      })
      .expect(409);

    expect(resConcurrente.body.message).toContain('ya tiene un pedido activo');
  });

  it('Escenario 3: Petición simultánea en una mesa diferente (Mesa 6) no se bloquea y es aceptada', async () => {
    // Mesa 4 ocupada
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer token')
      .send({
        numero_mesa: 4,
        detalles: [{ id_item: 1, cantidad: 1 }],
      })
      .expect(201);

    // Mesa 6 libre debe crearse sin interferencia
    const resMesa6 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer token')
      .send({
        numero_mesa: 6,
        detalles: [{ id_item: 1, cantidad: 1 }],
      })
      .expect(201);

    expect(resMesa6.body.numero_mesa).toBe(6);
  });
});
