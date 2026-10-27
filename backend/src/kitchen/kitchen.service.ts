import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comanda, EstadoImpresionComanda } from './entities/comanda.entity';
import { Pedido } from '../orders/entities/pedido.entity';
import { UpdateEstadoComandaDto } from './dto/update-estado-comanda.dto';
import { lineasCocina } from '../orders/configuracion-linea';
import type { CambioComanda } from '../orders/cambios-comanda';
import {
  HistorialImpresion,
  ResultadoImpresion,
  TipoImpresion,
} from './entities/historial-impresion.entity';

/** HU-4.3: una versión de la comanda del pedido */
export interface VersionComanda {
  id_comanda: number;
  version: number;
  estado_impresion: EstadoImpresionComanda;
  fecha_creacion: Date;
  fecha_impresion: Date;
  cambios: CambioComanda[];
}

/**
 * HU-4.3: lo que necesita la vista del pedido (prototipo 14):
 *   - versión vigente de la comanda y si falta imprimirla,
 *   - último cambio ("Se agregó 1x Cerveza" + hora) para el aviso amarillo,
 *   - historial de impresión ("12:48:10 · Comanda v2 · OK").
 */
export interface ResumenComandas {
  id_pedido: number;
  version_actual: number;
  estado_impresion_actual: EstadoImpresionComanda | null;
  /** La versión vigente aún no sale por la impresora (PENDIENTE o ERROR) */
  requiere_reimpresion: boolean;
  ultima_modificacion: { version: number; fecha: Date; cambios: CambioComanda[] } | null;
  versiones: VersionComanda[];
  historial: HistorialImpresion[];
}

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
    @InjectRepository(HistorialImpresion)
    private readonly historialRepo: Repository<HistorialImpresion>,
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
   * Obtiene la comanda VIGENTE (última versión) de un pedido, con sus detalles.
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
      order: { version: 'DESC', id_comanda: 'DESC' },
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

    const guardada = await this.comandaRepo.save(comanda);

    // HU-4.3: cada resultado de impresión queda en el historial (prototipo 14)
    if (
      dto.estado_impresion === EstadoImpresionComanda.IMPRESA ||
      dto.estado_impresion === EstadoImpresionComanda.ERROR
    ) {
      await this.historialRepo.save(
        this.historialRepo.create({
          id_pedido: comanda.id_pedido,
          id_comanda: comanda.id_comanda,
          tipo: TipoImpresion.COMANDA,
          version: comanda.version ?? 1,
          resultado:
            dto.estado_impresion === EstadoImpresionComanda.IMPRESA
              ? ResultadoImpresion.OK
              : ResultadoImpresion.ERROR,
        }),
      );
    }

    return guardada;
  }

  /**
   * HU-4.3 · GET /kitchen/pedidos/:id/comandas
   * Versiones de la comanda, último cambio e historial de impresión del pedido.
   */
  async resumenPorPedido(idPedido: number): Promise<ResumenComandas> {
    const pedido = await this.pedidoRepo.findOne({ where: { id_pedido: idPedido } });
    if (!pedido) throw new NotFoundException(`El pedido #${idPedido} no existe`);

    const [comandas, historial] = await Promise.all([
      this.comandaRepo.find({ where: { id_pedido: idPedido }, order: { version: 'ASC', id_comanda: 'ASC' } }),
      this.historialRepo.find({ where: { id_pedido: idPedido }, order: { fecha_hora: 'ASC', id_impresion: 'ASC' } }),
    ]);

    const versiones = comandas.map<VersionComanda>((c) => ({
      id_comanda: c.id_comanda,
      version: c.version ?? 1,
      estado_impresion: c.estado_impresion,
      fecha_creacion: c.fecha_creacion ?? c.fecha_impresion,
      fecha_impresion: c.fecha_impresion,
      cambios: c.cambios ?? [],
    }));

    const actual = versiones.at(-1) ?? null;
    const modificada = [...versiones].reverse().find((v) => v.version > 1 && v.cambios.length > 0) ?? null;

    return {
      id_pedido: idPedido,
      version_actual: actual?.version ?? 0,
      estado_impresion_actual: actual?.estado_impresion ?? null,
      requiere_reimpresion: !!actual && actual.estado_impresion !== EstadoImpresionComanda.IMPRESA,
      ultima_modificacion: modificada
        ? { version: modificada.version, fecha: modificada.fecha_creacion, cambios: modificada.cambios }
        : null,
      versiones,
      historial,
    };
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

    // HU-4.3: se reimprime la versión VIGENTE (la más alta), nunca una vieja
    let comanda = await this.comandaRepo.findOne({
      where: { id_pedido: idPedido },
      order: { version: 'DESC', id_comanda: 'DESC' },
    });

    if (!comanda) {
      // Si el pedido existe pero por algún motivo no tenía comanda previa, se crea la v1
      comanda = this.comandaRepo.create({
        id_pedido: idPedido,
        version: 1,
        cambios: [],
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
    } else {
      // Reimpresión: se marca pendiente para que el agente de impresión la tome
      comanda.estado_impresion = EstadoImpresionComanda.PENDIENTE;
    }

    return this.comandaRepo.save(comanda);
  }
}
