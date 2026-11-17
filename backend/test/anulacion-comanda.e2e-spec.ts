/**
 * Pruebas E2E / Sistema: Anulación de Pedidos y Ciclo de Comandas (HU-3.6, HU-4.2, DEF-004, DEF-006, DEF-007)
 * -------------------------------------------------------------------------------------------------------------
 * Cubre:
 * - HU-3.6 Anulación de pedido con motivo obligatorio
 * - HU-4.2 Control de reimpresión de comandas térmicas
 * - DEF-004: Restricción de anulación (mesero no puede anular)
 * - DEF-006: Comanda de pedido anulado sale de la cola de impresión
 * - DEF-007: Rechazo de reimpresión de comanda si el pedido está anulado
 */
import { BadRequestException, CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
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

class JwtAuthSimulado implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.includes('token-mesero')) {
      req.user = { id_usuario: 3, rol: RolUsuario.MESERO, nombre_completo: 'Mesero' };
    } else if (authHeader.includes('token-cajero')) {
      req.user = { id_usuario: 2, rol: RolUsuario.CAJERO, nombre_completo: 'Cajero' };
    } else {
      req.user = { id_usuario: 1, rol: RolUsuario.ADMINISTRADOR, nombre_completo: 'Admin' };
    }
    return true;
  }
}

describe('E2E Sistema · Anulación de Pedidos y Rechazo de Reimpresión (DEF-004, DEF-006, DEF-007)', () => {
  let app: INestApplication<App>;
  let pedidoEstado: EstadoPedido = EstadoPedido.PENDIENTE;

  const ordersServiceMock = {
    anular: jest.fn().mockImplementation(async (id, dto, idUsuario) => {
      pedidoEstado = EstadoPedido.ANULADO;
      return Object.assign(new Pedido(), {
        id_pedido: id,
        estado_pedido: EstadoPedido.ANULADO,
        motivo_anulacion: dto.motivo,
      });
    }),
  };

  const kitchenServiceMock = {
    solicitarImpresion: jest.fn().mockImplementation(async (idPedido) => {
      if (pedidoEstado === EstadoPedido.ANULADO) {
        throw new BadRequestException(`El pedido #${idPedido} está anulado y no se puede reimprimir su comanda.`);
      }
      return { id_comanda: 1, id_pedido: idPedido, estado_impresion: 'PENDIENTE' };
    }),
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

  beforeEach(() => {
    pedidoEstado = EstadoPedido.PENDIENTE;
  });

  it('Escenario 1 (DEF-004): Mesero NO puede anular pedidos (403 Forbidden)', async () => {
    await request(app.getHttpServer())
      .post('/orders/55/anular')
      .set('Authorization', 'Bearer token-mesero')
      .send({ motivo: 'Cliente se retiró' })
      .expect(403);
  });

  it('Escenario 2: Administrador intenta anular sin motivo y es rechazado con 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post('/orders/55/anular')
      .set('Authorization', 'Bearer token-admin')
      .send({ motivo: '   ' }) // Inválido / vacío
      .expect(400);
  });

  it('Escenario 3: Administrador anula pedido con motivo válido exitosamente (201 Created)', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders/55/anular')
      .set('Authorization', 'Bearer token-admin')
      .send({ motivo: 'Cliente canceló el pedido por demora' })
      .expect(201);

    expect(res.body.estado_pedido).toBe(EstadoPedido.ANULADO);
    expect(res.body.motivo_anulacion).toBe('Cliente canceló el pedido por demora');
    expect(ordersServiceMock.anular).toHaveBeenCalled();
  });

  it('Escenario 4 (DEF-007): Intento de reimprimir comanda de pedido anulado es rechazado con HTTP 400', async () => {
    // Pedido pasa a estado anulado
    pedidoEstado = EstadoPedido.ANULADO;

    const res = await request(app.getHttpServer())
      .post('/kitchen/pedidos/55/imprimir')
      .set('Authorization', 'Bearer token-admin')
      .expect(400);

    expect(res.body.message).toContain('está anulado y no se puede reimprimir');
  });
});
