import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Pedido, DetallePedido, EstadoPedido } from './entities/pedido.entity';
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
      // 1. Buscamos y bloqueamos SOLO la tabla pedidos (evita error de PostgreSQL con JOINs)
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!pedido) throw new NotFoundException(`El pedido con id ${id_pedido} no existe`);

      // 2. Validamos la transición de la máquina de estados
      this.validarTransicion(pedido.estado_pedido, dto.estado_pedido);

      // 3. Actualizamos el estado
      pedido.estado_pedido = dto.estado_pedido;
      
      // 4. Generación de comanda y validación de pedido vacío (HU-4.1 y SCRUM-179)
      if (dto.estado_pedido === EstadoPedido.EN_PREPARACION) {
        const cantidadDetalles = await manager.count(DetallePedido, { 
          where: { id_pedido } 
        });
        
        if (cantidadDetalles === 0) {
          throw new BadRequestException(
            'No se puede generar una comanda para un pedido sin productos.'
          );
        }

        const nuevaComanda = manager.create(Comanda, {
          id_pedido: pedido.id_pedido,
        });
        await manager.save(nuevaComanda);
      }

      // 5. Guardamos el pedido
      await manager.save(pedido);

      // 6. Retornamos el pedido actualizado con sus relaciones para el frontend
      const pedidoActualizado = await manager.findOne(Pedido, {
        where: { id_pedido },
        relations: { detalles: { item: true }, mesero: true },
      });

      return pedidoActualizado!;
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