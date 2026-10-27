import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/** REEMPLAZADA (HU-4.3): una versión más nueva la reemplazó antes de imprimirse */
export type EstadoImpresion = 'PENDIENTE' | 'IMPRESA' | 'ERROR' | 'REEMPLAZADA';

/** HU-4.3 · SCRUM-182: un cambio del pedido respecto a la versión anterior */
export interface CambioComanda {
  tipo: 'AGREGADO' | 'QUITADO' | 'CANTIDAD_AUMENTADA' | 'CANTIDAD_REDUCIDA' | 'NOTA';
  id_item: number;
  producto: string;
  cantidad?: number;
  antes?: number | string | null;
  despues?: number | string | null;
  /** "Se agregó 1x Cerveza" */
  texto: string;
}

export interface ComandaBackend {
  id_comanda: number;
  id_pedido: number;
  estado_impresion: EstadoImpresion;
  fecha_impresion: string;
  /** HU-4.3: versión de la comanda (v1, v2…) */
  version?: number;
  cambios?: CambioComanda[];
  fecha_creacion?: string;
}

/** HU-4.3: una versión de la comanda del pedido */
export interface VersionComanda {
  id_comanda: number;
  version: number;
  estado_impresion: EstadoImpresion;
  fecha_creacion: string;
  fecha_impresion: string;
  cambios: CambioComanda[];
}

/** HU-4.3: "12:48:10 · Comanda v2 · OK" (prototipo 14) */
export interface RegistroImpresion {
  id_impresion: number;
  id_pedido: number;
  id_comanda: number | null;
  tipo: 'COMANDA' | 'COMPROBANTE';
  version: number | null;
  resultado: 'OK' | 'ERROR';
  fecha_hora: string;
}

/** HU-4.3 · GET /kitchen/pedidos/:id/comandas */
export interface ResumenComandas {
  id_pedido: number;
  version_actual: number;
  estado_impresion_actual: EstadoImpresion | null;
  /** La versión vigente aún no sale por la impresora (PENDIENTE o ERROR) */
  requiere_reimpresion: boolean;
  ultima_modificacion: { version: number; fecha: string; cambios: CambioComanda[] } | null;
  versiones: VersionComanda[];
  historial: RegistroImpresion[];
}

@Injectable({ providedIn: 'root' })
export class KitchenService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/kitchen`;

  /**
   * Solicita la impresión de la comanda de un pedido a la impresora térmica (SCRUM-186 / SCRUM-188).
   * Deja la versión vigente en PENDIENTE para que el agente de Electron la imprima silenciosamente.
   */
  solicitarImpresion(idPedido: number) {
    return this.http.post<ComandaBackend>(`${this.api}/pedidos/${idPedido}/imprimir`, {});
  }

  /**
   * Obtiene la comanda vigente (última versión) de un pedido.
   */
  obtenerPorIdPedido(idPedido: number) {
    return this.http.get<ComandaBackend>(`${this.api}/pedidos/${idPedido}/comanda`);
  }

  /**
   * HU-4.3: versiones de la comanda, último cambio e historial de impresión.
   */
  resumen(idPedido: number) {
    return this.http.get<ResumenComandas>(`${this.api}/pedidos/${idPedido}/comandas`);
  }
}
