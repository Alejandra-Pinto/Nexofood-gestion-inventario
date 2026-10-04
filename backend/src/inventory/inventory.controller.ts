/**
 * Controlador: InventoryController
 * ------------------------------------------------------------------
 * Define las rutas HTTP del módulo Inventory.
 *
 * Endpoints:
 *   POST /inventory/ingresos    -> registra un ingreso (compra o producción) — HU-2.3
 *   GET  /inventory/proveedores -> proveedores activos para el formulario    — HU-2.3
 *   POST /inventory/salidas     -> registra una salida manual de inventario
 *                                  (merma o consumo interno) — HU-2.4
 */
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { CreateIngresoDto } from './dto/create-ingreso.dto';
import { Proveedor } from './entities/proveedor.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolUsuario } from '../users/entities/user.entity';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * HU-2.3 · Registrar ingreso de inventario (compra a proveedor / producción propia)
   *
   * El id del usuario se obtiene del token JWT, no del body.
   * Roles permitidos: Administrador y Cajero (igual que las salidas, HU-2.4).
   *
   * Respuestas:
   *   201 -> movimiento registrado (incluye stock_anterior y stock_nuevo)
   *   400 -> datos inválidos (cantidad, costo, fecha futura, proveedor faltante…)
   *   401 -> sin token o token inválido
   *   403 -> rol no autorizado
   *   404 -> ítem o proveedor no existe
   */
  @Post('ingresos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  registrarIngreso(
    @Body() dto: CreateIngresoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MovimientoInventario> {
    return this.inventoryService.registrarIngreso(dto, usuario.id_usuario);
  }

  /** GET /inventory/proveedores -> opciones del selector "Proveedor" */
  @Get('proveedores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  listarProveedores(): Promise<Proveedor[]> {
    return this.inventoryService.listarProveedores();
  }

  /**
   * HU-2.4 · Registrar salida manual de inventario
   *
   * Roles permitidos: Administrador y Cajero (según HU-2.4 en HistoriasUsuario_CORVSOFT).
   * El id del usuario se obtiene del token JWT, no del body.
   *
   * Respuestas:
   *   201 -> movimiento registrado
   *   400 -> cantidad inválida o stock insuficiente
   *   401 -> sin token o token inválido
   *   403 -> rol no autorizado
   *   404 -> ítem no existe
   */
  @Post('salidas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  registrarSalida(
    @Body() dto: CreateSalidaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MovimientoInventario> {
    return this.inventoryService.registrarSalida(dto, usuario.id_usuario);
  }
}