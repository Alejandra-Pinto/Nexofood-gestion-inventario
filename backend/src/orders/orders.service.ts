import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido, EstadoPedido } from './entities/pedido.entity';
import { UpdateEstadoDto } from './dto/update-estado.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
  ) {}

  async findOne(id_pedido: number): Promise<Pedido> {
    const pedido = await this.pedidosRepo.findOne({
      where: { id_pedido },
      relations: {
        detalles: { item: true },
        mesero: true,
      },
    });

    if (!pedido) {
      throw new NotFoundException(`El pedido con id ${id_pedido} no existe`);
    }
    return pedido;
  }

  async cambiarEstado(id_pedido: number, dto: UpdateEstadoDto): Promise<Pedido> {
    const pedido = await this.findOne(id_pedido);

    this.validarTransicion(pedido.estado_pedido, dto.estado_pedido);

    pedido.estado_pedido = dto.estado_pedido;
    return this.pedidosRepo.save(pedido);
  }

  private validarTransicion(estadoActual: EstadoPedido, nuevoEstado: EstadoPedido) {
    if (estadoActual === nuevoEstado) return;

    const transicionesValidas: Record<EstadoPedido, EstadoPedido[]> = {
      [EstadoPedido.PENDIENTE]: [EstadoPedido.EN_PREPARACION, EstadoPedido.ANULADO],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.LISTO, EstadoPedido.ANULADO],
      [EstadoPedido.LISTO]: [EstadoPedido.ENTREGADO],
      [EstadoPedido.ENTREGADO]: [EstadoPedido.PAGADO],
      [EstadoPedido.PAGADO]: [], 
      [EstadoPedido.ANULADO]: [], 
    };

    const permitidos = transicionesValidas[estadoActual];

    if (!permitidos.includes(nuevoEstado)) {
      throw new BadRequestException(
        `Transición inválida: No se puede pasar de ${estadoActual} a ${nuevoEstado}.`
      );
    }
  }
}