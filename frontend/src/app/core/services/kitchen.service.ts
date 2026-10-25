import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ComandaBackend {
  id_comanda: number;
  id_pedido: number;
  estado_impresion: 'PENDIENTE' | 'IMPRESA' | 'ERROR';
  fecha_impresion: string;
}

@Injectable({ providedIn: 'root' })
export class KitchenService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/kitchen`;

  /**
   * Solicita la impresión de la comanda de un pedido a la impresora térmica (SCRUM-186 / SCRUM-188).
   * Deja la comanda en PENDIENTE para que el agente de Electron la imprima silenciosamente.
   */
  solicitarImpresion(idPedido: number) {
    return this.http.post<ComandaBackend>(`${this.api}/pedidos/${idPedido}/imprimir`, {});
  }

  /**
   * Obtiene la comanda asociada a un pedido.
   */
  obtenerPorIdPedido(idPedido: number) {
    return this.http.get<ComandaBackend>(`${this.api}/pedidos/${idPedido}/comanda`);
  }
}

