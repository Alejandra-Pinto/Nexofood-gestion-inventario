/**
 * Servicio: InventarioService
 * ------------------------------------------------------------------
 * Se comunica con el backend NestJS (módulos Products e Inventory)
 * mediante HttpClient. La URL base está en src/environments/environment.ts
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  Categoria,
  CrearItem,
  ItemInventario,
  TipoItem,
} from '../models/item-inventario.model';
import {
  CrearSalida,
  MovimientoInventario,
} from '../models/movimiento-inventario.model';

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // ---------- Productos e insumos (ProductsModule) ----------

  /** GET /products (filtro opcional por tipo) */
  listar(tipo?: TipoItem) {
    const params = tipo ? new HttpParams().set('tipo', tipo) : undefined;
    return this.http.get<ItemInventario[]>(`${this.api}/products`, { params });
  }

  /** POST /products -> registra un producto o insumo */
  crear(item: CrearItem) {
    return this.http.post<ItemInventario>(`${this.api}/products`, item);
  }

  /** GET /categories -> opciones del selector de categoría */
  categorias() {
    return this.http.get<Categoria[]>(`${this.api}/categories`);
  }

  // ---------- Inventario (InventoryModule) ----------

  /**
   * POST /inventory/salidas
   * Registra una salida manual de inventario (merma o consumo interno).
   * Requiere token JWT: el AuthInterceptor lo agrega automáticamente.
   */
  registrarSalida(dto: CrearSalida) {
    return this.http.post<MovimientoInventario>(
      `${this.api}/inventory/salidas`,
      dto,
    );
  }
}