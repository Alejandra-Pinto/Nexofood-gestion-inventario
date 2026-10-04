/**
 * Controlador: InventoryController
 * ------------------------------------------------------------------
 * Define las rutas HTTP del módulo Inventory.
 *
 * Endpoints:
 *   POST /inventory/salidas -> registra una salida manual de inventario
 *                              (merma o consumo interno) — HU-2.4
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateSalidaDto } from './dto/create-salida.dto';
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