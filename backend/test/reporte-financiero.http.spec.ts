/**
 * Pruebas HTTP (supertest): GET /queries-reports/financiero
 * ------------------------------------------------------------------
 * HU-6.4 · SCRUM-227
 *
 * Levanta el ReportesController y el ReportesService REALES con el RolesGuard
 * y el ValidationPipe de main.ts. Solo se reemplazan la base de datos (período
 * sin datos) y la validación del JWT: el rol llega en el header `x-rol`.
 *
 * Ejecutar:  cd backend  ->  npm test
 */
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';

import { ReportesController } from '../src/queries-reports/reportes.controller';
import { ReportesService } from '../src/queries-reports/reportes.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolUsuario } from '../src/users/entities/user.entity';
import { Pedido } from '../src/orders/entities/pedido.entity';
import { MovimientoFinanciero } from '../src/finance/entities/movimiento-financiero.entity';

/** QueryBuilder que no encuentra nada (SUM sin filas → NULL) */
function qbVacio(): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'innerJoin', 'leftJoin', 'orderBy', 'addOrderBy', 'limit']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(() => Promise.resolve([]));
  qb.getRawOne = jest.fn(() => Promise.resolve({ total: null, cantidad: '0' }));
  return qb;
}

/** Sustituye la validación del token: el usuario autenticado tiene el rol del header */
class JwtSimulado implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id_usuario: 1, rol: req.headers['x-rol'] };
    return true;
  }
}

describe('HTTP · GET /queries-reports/financiero (HU-6.4)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const repo = {
      createQueryBuilder: () => qbVacio(),
      manager: { getRepository: () => ({ createQueryBuilder: () => qbVacio() }) },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Pedido), useValue: repo },
        { provide: getRepositoryToken(MovimientoFinanciero), useValue: repo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(JwtSimulado)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (rol: RolUsuario, query = '') =>
    request(app.getHttpServer()).get(`/queries-reports/financiero${query}`).set('x-rol', rol);

  it('Administrador: 200 y período vacío con todo en 0', async () => {
    const res = await get(RolUsuario.ADMINISTRADOR, '?desde=2026-10-01&hasta=2026-10-31').expect(200);
    expect(res.body.sin_movimientos).toBe(true);
    expect(res.body.ingresos.total).toBe(0);
    expect(res.body.egresos.total).toBe(0);
    expect(res.body.saldo_neto).toBe(0);
    expect(res.body.consumo_interno.total_valorizado).toBe(0);
    expect(res.body.compras_inventario.total).toBe(0);
    expect(res.body.ingresos.por_medio_pago).toHaveLength(5);
  });

  it('Administrador sin fechas: 200 con el mes en curso', async () => {
    const res = await get(RolUsuario.ADMINISTRADOR).expect(200);
    expect(res.body.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(res.body.hasta.slice(0, 8)).toBe(res.body.desde.slice(0, 8));
  });

  it.each([
    ['?desde=2026-11-30&hasta=2026-11-01'],
    ['?desde=2026-02-30&hasta=2026-03-01'],
    ['?desde=01-11-2026&hasta=2026-11-30'],
    ['?desde=2026-11-01'],
  ])('rango inválido %s → 400', async (query) => {
    await get(RolUsuario.ADMINISTRADOR, query).expect(400);
  });

  it.each([RolUsuario.CAJERO, RolUsuario.MESERO])('%s → 403', async (rol) => {
    await get(rol, '?desde=2026-11-01&hasta=2026-11-30').expect(403);
  });
});
