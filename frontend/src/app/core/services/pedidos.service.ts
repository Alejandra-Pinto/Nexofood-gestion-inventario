import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Pedido, EstadoPedido } from '../models/pedido.model';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** GET /orders/:id */
  obtenerPedido(id: number) {
    return this.http.get<Pedido>(`${this.api}/orders/${id}`);
  }

  /** PATCH /orders/:id/estado */
  cambiarEstado(id: number, nuevoEstado: EstadoPedido) {
    return this.http.patch<Pedido>(`${this.api}/orders/${id}/estado`, {
      estado_pedido: nuevoEstado,
    });
  }
}