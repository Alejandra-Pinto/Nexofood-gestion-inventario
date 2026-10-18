/**
 * Servicio: PedidosService
 * ------------------------------------------------------------------
 * Se comunica con el módulo Orders del backend.
 * HU-3.1 Registrar nuevo pedido · HU-3.5 Registrar método de pago
 * El token JWT lo agrega el AuthInterceptor.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CrearPedido,
  EstadoPedido,
  normalizarPedido,
  Pedido,
  RegistrarPago,
  ResultadoPago,
} from '../models/pedido.model';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/orders`;

  /** POST /orders -> registra el pedido (queda en estado PENDIENTE) */
  crear(dto: CrearPedido) {
    return this.http.post<Pedido>(this.api, dto).pipe(map(normalizarPedido));
  }

  /** GET /orders?estado= -> pedidos más recientes primero */
  listar(estado?: EstadoPedido) {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http
      .get<Pedido[]>(this.api, { params })
      .pipe(map((lista) => lista.map(normalizarPedido)));
  }

  /** POST /orders/:id/pago -> registra el medio de pago (HU-3.5) */
  registrarPago(idPedido: number, dto: RegistrarPago) {
    return this.http.post<ResultadoPago>(`${this.api}/${idPedido}/pago`, dto).pipe(
      map((r) => ({ ...r, pedido: normalizarPedido(r.pedido), cambio: Number(r.cambio) })),
    );
  }
}
