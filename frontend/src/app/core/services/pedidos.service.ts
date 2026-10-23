import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CrearPedido, EstadoPedido, MesaResumen, normalizarPedido,
  Pedido, RegistrarPago, ResultadoPago,
} from '../models/pedido.model';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/orders`;

  crear(dto: CrearPedido) {
    return this.http.post<Pedido>(this.api, dto).pipe(map(normalizarPedido));
  }

  mesas() {
    return this.http.get<MesaResumen[]>(`${this.api}/mesas`);
  }

  obtener(id: number) {
    return this.http.get<Pedido>(`${this.api}/${id}`).pipe(map(normalizarPedido));
  }

  listar(estado?: EstadoPedido) {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http
      .get<Pedido[]>(this.api, { params })
      .pipe(map((lista) => lista.map(normalizarPedido)));
  }

  registrarPago(idPedido: number, dto: RegistrarPago) {
    return this.http.post<ResultadoPago>(`${this.api}/${idPedido}/pago`, dto).pipe(
      map((r) => ({ ...r, pedido: normalizarPedido(r.pedido), cambio: Number(r.cambio) })),
    );
  }

  // --- NUESTRO MÉTODO (HU-3.4) ---
  cambiarEstado(id: number, nuevoEstado: EstadoPedido) {
    return this.http.patch<Pedido>(`${this.api}/${id}/estado`, {
      estado_pedido: nuevoEstado,
    }).pipe(map(normalizarPedido));
  }
}