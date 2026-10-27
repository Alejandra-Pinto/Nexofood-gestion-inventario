import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { UpdateEstadoComandaDto } from './dto/update-estado-comanda.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../users/entities/user.entity';

@Controller('kitchen')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  /**
   * Endpoint para que Electron consulte las comandas pendientes.
   */
  @Get('comandas/pendientes')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
  listarPendientes() {
    return this.kitchenService.listarPendientes();
  }

  /**
   * Endpoint para consultar una comanda específica por ID de pedido.
   */
  @Get('pedidos/:id/comanda')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
  obtenerPorIdPedido(@Param('id', ParseIntPipe) id: number) {
    return this.kitchenService.obtenerPorIdPedido(id);
  }

  /**
   * HU-4.3: versiones de la comanda, último cambio e historial de impresión.
   */
  @Get('pedidos/:id/comandas')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
  resumenPorPedido(@Param('id', ParseIntPipe) id: number) {
    return this.kitchenService.resumenPorPedido(id);
  }

  /**
   * Endpoint para que Electron reporte el estado final de la impresión (IMPRESA o ERROR).
   */
  @Patch('comandas/:id/estado')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoComandaDto,
  ) {
    return this.kitchenService.actualizarEstado(id, dto);
  }

  /**
   * Endpoint para solicitar la impresión/reimpresión manual desde la UI.
   */
  @Post('pedidos/:id/imprimir')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
  solicitarImpresion(@Param('id', ParseIntPipe) id: number) {
    return this.kitchenService.solicitarImpresion(id);
  }
}
