import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Pedido, EstadoPedido } from './entities/pedido.entity';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { Comanda } from '../kitchen/entities/comanda.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    @InjectRepository(Comanda)
    private readonly comandasRepo: Repository<Comanda>,
    private readonly dataSource: DataSource,
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
    return this.dataSource.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido },
        relations: { detalles: { item: true } },
      });

      if (!pedido) throw new NotFoundException(`El pedido con id ${id_pedido} no existe`);

      this.validarTransicion(pedido.estado_pedido, dto.estado_pedido);

      pedido.estado_pedido = dto.estado_pedido;
      
      // SCRUM-177 y 178: Generar comanda automáticamente si pasa a EN_PREPARACION
      if (dto.estado_pedido === EstadoPedido.EN_PREPARACION) {
        const nuevaComanda = manager.create(Comanda, {
          id_pedido: pedido.id_pedido,
        });
        await manager.save(nuevaComanda);
      }

      return manager.save(pedido);
    });
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