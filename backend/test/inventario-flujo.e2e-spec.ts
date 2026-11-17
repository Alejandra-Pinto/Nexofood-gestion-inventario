/**
 * Pruebas E2E / Sistema: Flujo de Inventario, Ingresos, Mermas y Reporte Consolidado
 * ----------------------------------------------------------------------------------
 * Cubre:
 * - HU-2.3 Registrar ingresos por compra a proveedores
 * - HU-2.4 Registrar salidas manuales por merma o autoconsumo
 * - HU-2.5 Alertas de stock mínimo
 * - HU-6.1 Reporte consolidado de inventario
 */
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { InventoryController } from '../src/inventory/inventory.controller';
import { InventoryService } from '../src/inventory/inventory.service';
import { QueriesReportsController } from '../src/queries-reports/queries-reports.controller';
import { QueriesReportsService } from '../src/queries-reports/queries-reports.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolUsuario } from '../src/users/entities/user.entity';
import { MotivoIngreso } from '../src/inventory/dto/create-ingreso.dto';
import { TipoMovimiento } from '../src/inventory/entities/movimiento-inventario.entity';

class JwtAuthSimulado implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.includes('token-mesero')) {
      req.user = { id_usuario: 3, rol: RolUsuario.MESERO, nombre_completo: 'Mesero' };
    } else {
      req.user = { id_usuario: 1, rol: RolUsuario.ADMINISTRADOR, nombre_completo: 'Admin' };
    }
    return true;
  }
}

describe('E2E Sistema · Flujo de Inventario, Ingresos, Salidas y Reportes (HU-2.3, HU-2.4, HU-6.1)', () => {
  let app: INestApplication<App>;
  let stockActual = 10;

  const inventoryServiceMock = {
    registrarIngreso: jest.fn().mockImplementation(async (dto, idUsuario) => {
      const stockAnterior = stockActual;
      stockActual += dto.cantidad;
      return {
        id_movimiento: 10,
        id_item: dto.id_item,
        tipo_movimiento: TipoMovimiento.INGRESO,
        motivo_ingreso: dto.motivo,
        cantidad: dto.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockActual,
      };
    }),
    registrarSalida: jest.fn().mockImplementation(async (dto, idUsuario) => {
      const stockAnterior = stockActual;
      stockActual -= dto.cantidad;
      return {
        id_movimiento: 11,
        id_item: dto.id_item,
        tipo_movimiento: TipoMovimiento.SALIDA,
        cantidad: dto.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockActual,
      };
    }),
    listarProveedores: jest.fn().mockResolvedValue([
      { id_proveedor: 1, nombre_contacto: 'Distribuidora Carnes del Valle', activo: true },
    ]),
  };

  const queriesReportsServiceMock = {
    reporteInventario: jest.fn().mockImplementation(async () => {
      return {
        items: [
          {
            id_item: 1,
            nombre: 'Chorizo de Res',
            tipo_item: 'INSUMO',
            cantidad_stock: stockActual,
            stock_minimo: 5,
            estado_stock: stockActual <= 5 ? 'BAJO' : 'NORMAL',
            categoria: 'Carnes',
          },
        ],
        resumen: {
          total_items: 1,
          productos_venta: 0,
          insumos_cocina: 1,
          bajo_stock: stockActual <= 5 ? 1 : 0,
          agotados: stockActual === 0 ? 1 : 0,
        },
      };
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController, QueriesReportsController],
      providers: [
        { provide: InventoryService, useValue: inventoryServiceMock },
        { provide: QueriesReportsService, useValue: queriesReportsServiceMock },
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
    stockActual = 10;
  });

  it('Paso 1: Administrador registra ingreso de compra a proveedor (HU-2.3)', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/ingresos')
      .set('Authorization', 'Bearer token-admin')
      .send({
        id_item: 1,
        cantidad: 15,
        costo_unitario: 4500,
        motivo: MotivoIngreso.COMPRA,
        id_proveedor: 1,
      })
      .expect(201);

    expect(res.body.stock_anterior).toBe(10);
    expect(res.body.stock_nuevo).toBe(25);
    expect(stockActual).toBe(25);
  });

  it('Paso 2: Administrador registra salida por merma de producto (HU-2.4)', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/salidas')
      .set('Authorization', 'Bearer token-admin')
      .send({
        id_item: 1,
        cantidad: 3,
        motivo: 'MERMA',
        observaciones: 'Producto vencido',
      })
      .expect(201);

    expect(res.body.stock_anterior).toBe(10);
    expect(res.body.stock_nuevo).toBe(7);
    expect(stockActual).toBe(7);
  });

  it('Paso 3: Mesero intenta consultar el reporte de inventario y es rechazado con HTTP 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .get('/queries-reports/reportes/inventario')
      .set('Authorization', 'Bearer token-mesero')
      .expect(403);
  });

  it('Paso 4: Administrador consulta el reporte de inventario consolidado en tiempo real (HU-6.1)', async () => {
    const res = await request(app.getHttpServer())
      .get('/queries-reports/reportes/inventario')
      .set('Authorization', 'Bearer token-admin')
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].nombre).toBe('Chorizo de Res');
    expect(res.body.items[0].cantidad_stock).toBe(stockActual);
    expect(res.body.resumen.total_items).toBe(1);
  });
});
