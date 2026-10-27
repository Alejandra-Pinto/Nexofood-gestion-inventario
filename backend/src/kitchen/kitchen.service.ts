import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comanda, EstadoImpresionComanda } from './entities/comanda.entity';
import { Pedido } from '../orders/entities/pedido.entity';
import { UpdateEstadoComandaDto } from './dto/update-estado-comanda.dto';
import { lineasCocina } from '../orders/configuracion-linea';

/**
 * HU-3.2 · SCRUM-154: cada detalle viaja con sus líneas ya formateadas para la
 * impresora (2x CHORIPAN PAMPERO / + Chimi Rojo / + Combo con papa / ** SIN CEBOLLA **).
 * El agente Electron las imprime tal cual.
 */
function agregarLineasCocina(comanda: Comanda): Comanda {
  for (const d of comanda?.pedido?.detalles ?? []) {
    (d as typeof d & { lineas_cocina: string[] }).lineas_cocina = lineasCocina(d);
  }
  return comanda;
}

@Injectable()
export class KitchenService {
  constructor(
    @InjectRepository(Comanda)
    private readonly comandaRepo: Repository<Comanda>,
    @InjectRepository(Pedido)
    private readonly pedidoRepo: Repository<Pedido>,
  ) {}

  /**
   * Lista todas las comandas pendientes de imprimir para el agente Electron.
   */
  async listarPendientes(): Promise<Comanda[]> {
    const comandas = await this.comandaRepo.find({
      where: { estado_impresion: EstadoImpresionComanda.PENDIENTE },
      relations: {
        pedido: {
          detalles: {
            item: true,
            adicionales: true,
          },
          mesero: true,
        },
      },
      order: { fecha_impresion: 'ASC' },
    });
    return comandas.map(agregarLineasCocina);
  }

  /**
   * Obtiene una comanda por ID de pedido (con detalles para imprimir/visualizar).
   */
  async obtenerPorIdPedido(idPedido: number): Promise<Comanda> {
    const comanda = await this.comandaRepo.findOne({
      where: { id_pedido: idPedido },
      relations: {
        pedido: {
          detalles: {
            item: true,
            adicionales: true,
          },
          mesero: true,
        },
      },
      order: { fecha_impresion: 'DESC' },
    });

    if (!comanda) {
      throw new NotFoundException(`No existe una comanda asociada al pedido #${idPedido}`);
    }

    return agregarLineasCocina(comanda);
  }

  /**
   * Actualiza el estado de impresión de una comanda (llamado por Electron).
   */
  async actualizarEstado(
    idComanda: number,
    dto: UpdateEstadoComandaDto,
  ): Promise<Comanda> {
    const comanda = await this.comandaRepo.findOne({
      where: { id_comanda: idComanda },
    });

    if (!comanda) {
      throw new NotFoundException(`La comanda #${idComanda} no existe`);
    }

    comanda.estado_impresion = dto.estado_impresion;
    if (dto.estado_impresion === EstadoImpresionComanda.IMPRESA) {
      comanda.fecha_impresion = new Date();
    }

    return this.comandaRepo.save(comanda);
  }

  /**
   * Encola o solicita la impresión de la comanda de un pedido (SCRUM-186 / SCRUM-188).
   * Si ya existe la comanda, la vuelve a poner en PENDIENTE para que Electron la imprima.
   * Si no existe el pedido, lanza NotFoundException.
   */
  async solicitarImpresion(idPedido: number): Promise<Comanda> {
    const pedido = await this.pedidoRepo.findOne({
      where: { id_pedido: idPedido },
    });

    if (!pedido) {
      throw new NotFoundException(`El pedido #${idPedido} no existe`);
    }

    let comanda = await this.comandaRepo.findOne({
      where: { id_pedido: idPedido },
      order: { fecha_impresion: 'DESC' },
    });

    if (!comanda) {
      // Si el pedido existe pero por algún motivo no tenía comanda previa, se crea
      comanda = this.comandaRepo.create({
        id_pedido: idPedido,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
    } else {
      // Reimpresión: se marca pendiente para que el agente de impresión la tome
      comanda.estado_impresion = EstadoImpresionComanda.PENDIENTE;
    }

    return this.comandaRepo.save(comanda);
  }
}
