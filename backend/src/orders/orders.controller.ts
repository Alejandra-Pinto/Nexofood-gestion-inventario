/**
 * Controlador: OrdersController
 * ------------------------------------------------------------------
 * Rutas HTTP del módulo Orders (pedidos).
 *
 * Endpoints:
 *   POST /orders            -> registra un pedido nuevo (estado PENDIENTE) 
 *   GET  /orders/mesas      -> estado de las mesas (Libre / Pendiente / Ocupada) 
 *   GET  /orders?estado=    -> lista pedidos (filtro opcional por estado)
 *   GET  /orders/:id        -> consulta un pedido con sus productos
 *   POST /orders/:id/pago   -> registra el pago y su medio de pago  
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService, ResultadoPago } from './orders.service';
import { MesaResumen } from './mesas';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreatePedidoDto } from './dto/create-pedido.dto';
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

  /**
   *  Registrar nuevo pedido
   *
   * Respuestas:
   *   201 -> pedido registrado (con id_pedido, estado PENDIENTE y total)
   *   400 -> pedido vacío, cantidad inválida, insumo o stock insuficiente
   *   401 -> sin token o token inválido
   *   404 -> algún producto no existe
   *   409 -> la mesa ya tiene un pedido activo
   */
  @Post()
  crear(
    @Body() dto: CreatePedidoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Pedido> {
    return this.ordersService.crear(dto, usuario.id_usuario);
  }

  /**
   *  GET /orders/mesas -> pantalla "Mis mesas" del mesero.
   * Va antes de GET /orders/:id para que "mesas" no se tome como un id.
   */
  @Get('mesas')
  mesas(): Promise<MesaResumen[]> {
    return this.ordersService.mesas();
  }

  /** GET /orders?estado=PENDIENTE */
  @Get()
  listar(@Query('estado') estado?: string): Promise<Pedido[]> {
    if (estado && !Object.values(EstadoPedido).includes(estado as EstadoPedido)) {
      throw new BadRequestException(`Estado inválido: ${estado}`);
    }
    return this.ordersService.listar(estado as EstadoPedido | undefined);
  }

  /** GET /orders/:id */
  @Get(':id')
  buscar(@Param('id', ParseIntPipe) id: number): Promise<Pedido> {
    return this.ordersService.buscarPorId(id);
  }

  /**
   * Registrar método de pago de un pedido
   * Solo Administrador y Cajero pueden cobrar.
   *
   * Respuestas:
   *   201 -> pago registrado (pedido PAGADO, ingreso y cambio)
   *   400 -> medio de pago inválido, efectivo insuficiente o pedido anulado
   *   403 -> rol no autorizado (Mesero)
   *   404 -> el pedido no existe
   *   409 -> el pedido ya fue pagado
   */
  @Post(':id/pago')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO)
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResultadoPago> {
    return this.ordersService.registrarPago(id, dto, usuario.id_usuario);
  }
}
