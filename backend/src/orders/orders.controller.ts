/**
 * Controlador: OrdersController
 * ------------------------------------------------------------------
 * Rutas HTTP del módulo Orders (pedidos).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService, ResultadoPago } from './orders.service';
import { MesaResumen } from './mesas';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { ModificarPedidoDto } from './dto/modificar-pedido.dto';
import { AnularPedidoDto } from './dto/anular-pedido.dto';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolUsuario } from '../users/entities/user.entity';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  crear(
    @Body() dto: CreatePedidoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Pedido> {
    return this.ordersService.crear(dto, usuario.id_usuario);
  }

  @Get('mesas')
  mesas(): Promise<MesaResumen[]> {
    return this.ordersService.mesas();
  }

  @Get()
  listar(@Query('estado') estado?: string): Promise<Pedido[]> {
    if (estado && !Object.values(EstadoPedido).includes(estado as EstadoPedido)) {
      throw new BadRequestException(`Estado inválido: ${estado}`);
    }
    return this.ordersService.listar(estado as EstadoPedido | undefined);
  }

  @Get(':id')
  buscar(@Param('id', ParseIntPipe) id: number): Promise<Pedido> {
    return this.ordersService.buscarPorId(id);
  }

  @Post(':id/pago')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResultadoPago> {
    return this.ordersService.registrarPago(id, dto, usuario.id_usuario);
  }

  // =========================================================================
  // HU-3.3 MODIFICAR PEDIDO (MESERO Y ADMINISTRADOR)
  // =========================================================================
  @Patch(':id')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MESERO)
  modificar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModificarPedidoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Pedido> {
    return this.ordersService.modificar(id, dto, usuario.id_usuario, usuario.rol as RolUsuario);
  }

  // =========================================================================
  // HU-3.6 ANULAR PEDIDO (SOLO ADMINISTRADOR Y CAJERO)
  // =========================================================================
  @Post(':id/anular')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularPedidoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Pedido> {
    return this.ordersService.anular(id, dto, usuario.id_usuario);
  }

  // =========================================================================
  // MÁQUINA DE ESTADOS (HU-3.4)
  // =========================================================================
  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoDto,
  ) {
    return this.ordersService.cambiarEstado(id, dto);
  }
}