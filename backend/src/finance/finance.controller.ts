import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService, EgresoFinanciero, IngresoFinanciero, ListaEgresos, ListaIngresos } from './finance.service';
import { CreateIngresoFinancieroDto } from './dto/create-ingreso-financiero.dto';
import { CreateEgresoFinancieroDto } from './dto/create-egreso-financiero.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolUsuario } from '../users/entities/user.entity';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('ingresos')
  registrarIngreso(@Body() dto: CreateIngresoFinancieroDto, @CurrentUser() usuario: UsuarioAutenticado): Promise<IngresoFinanciero> {
    return this.financeService.registrarIngreso(dto, usuario.id_usuario);
  }

  @Get('ingresos')
  listarIngresos(@Query('desde') desde?: string, @Query('hasta') hasta?: string): Promise<ListaIngresos> {
    return this.financeService.listarIngresos(desde, hasta);
  }

  @Post('egresos')
  registrarEgreso(@Body() dto: CreateEgresoFinancieroDto, @CurrentUser() usuario: UsuarioAutenticado): Promise<EgresoFinanciero> {
    return this.financeService.registrarEgreso(dto, usuario.id_usuario);
  }

  @Get('egresos')
  listarEgresos(@Query('desde') desde?: string, @Query('hasta') hasta?: string): Promise<ListaEgresos> {
    return this.financeService.listarEgresos(desde, hasta);
  }
}