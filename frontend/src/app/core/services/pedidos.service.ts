import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnularPedido,
  CrearPedido, EstadoPedido, MesaResumen, ModificarPedido, normalizarPedido,
  OpcionesPedido, Pedido, RegistrarPago, ResultadoCotizacion, ResultadoPago,
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

  // --- HU-3.2 ADICIONALES, PROMOCIONES, COMBOS Y NOTAS ---

  /** Catálogo del wizard: adicionales (con stock de su insumo) y promociones vigentes */
  opciones() {
    return this.http.get<OpcionesPedido>(`${this.api}/opciones`).pipe(
      map((o) => ({
        adicionales: (o.adicionales ?? []).map((a) => ({
          ...a,
          precio_adicional: Number(a.precio_adicional),
          cantidad_insumo: Number(a.cantidad_insumo),
          stock_disponible: a.stock_disponible === null ? null : Number(a.stock_disponible),
        })),
        promociones: (o.promociones ?? []).map((p) => ({
          ...p,
          precio_final: p.precio_final === null ? null : Number(p.precio_final),
          recargo: Number(p.recargo),
          porcentaje_descuento: Number(p.porcentaje_descuento),
          cantidad_insumo: Number(p.cantidad_insumo),
          stock_disponible: p.stock_disponible === null ? null : Number(p.stock_disponible),
        })),
      })),
    );
  }

  /** Precio y validación (stock / promoción vigente) de las líneas, sin guardar */
  cotizar(dto: Pick<CrearPedido, 'detalles'>) {
    return this.http.post<ResultadoCotizacion>(`${this.api}/cotizar`, dto);
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

  // --- HU-3.3 MODIFICAR PEDIDO ---
  modificar(id: number, dto: ModificarPedido) {
    return this.http.patch<Pedido>(`${this.api}/${id}`, dto).pipe(map(normalizarPedido));
  }

  // --- HU-3.6 ANULAR PEDIDO ---
  anular(id: number, dto: AnularPedido) {
    return this.http.post<Pedido>(`${this.api}/${id}/anular`, dto).pipe(map(normalizarPedido));
  }

  // --- MÁQUINA DE ESTADOS (HU-3.4) ---
  cambiarEstado(id: number, nuevoEstado: EstadoPedido) {
    return this.http.patch<Pedido>(`${this.api}/${id}/estado`, {
      estado_pedido: nuevoEstado,
    }).pipe(map(normalizarPedido));
  }
}