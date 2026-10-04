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
  CrearIngreso,
  CrearSalida,
  MovimientoInventario,
  Proveedor,
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
   * POST /inventory/ingresos  (HU-2.3)
   * Registra un ingreso de inventario (compra a proveedor o producción propia).
   * Suma al stock y deja el movimiento en el historial, en una sola transacción.
   */
  registrarIngreso(dto: CrearIngreso) {
    return this.http.post<MovimientoInventario>(
      `${this.api}/inventory/ingresos`,
      dto,
    );
  }

  /** GET /inventory/proveedores -> opciones del selector "Proveedor" (HU-2.3) */
  proveedores() {
    return this.http.get<Proveedor[]>(`${this.api}/inventory/proveedores`);
  }

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

  /**
   * GET /products/alerts
   * Lista los ítems que están en o por debajo del stock mínimo.
   * Usado por el módulo de alertas (HU-2.5).
   */
  alertasStock() {
    return this.http.get<ItemInventario[]>(`${this.api}/products/alerts`);
  }
}

