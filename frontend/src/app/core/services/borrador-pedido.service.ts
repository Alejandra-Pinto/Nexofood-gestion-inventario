/**
 * Servicio: BorradorPedidoService
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-146 Interfaz de selección de productos y cantidades
 *
 * Guarda en memoria el pedido que el mesero está armando en cada mesa
 * (antes de enviarlo a caja). Así, si vuelve a "Mis mesas" y entra de
 * nuevo a la mesa, no pierde los productos que ya había elegido.
 * Clave: 'mesa-4', 'mesa-7'... o 'llevar' para pedidos sin mesa.
 */
import { Injectable } from '@angular/core';
import { ItemInventario } from '../models/item-inventario.model';
import { OpcionAdicional, OpcionPromocion } from '../models/pedido.model';

/** HU-3.2: adicional elegido para una línea del borrador */
export type AdicionalElegido = OpcionAdicional & { cantidad: number };

export interface LineaBorrador {
  /** HU-3.2: identifica la línea (mismo producto + mismos adicionales/promo/nota) */
  clave: string;
  producto: ItemInventario;
  cantidad: number;
  /** HU-3.2: precio de UNA unidad confirmado por el backend (si no: precio_venta) */
  precio_unitario?: number;
  adicionales?: AdicionalElegido[];
  promocion?: OpcionPromocion | null;
  notas_especiales?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BorradorPedidoService {
  private borradores = new Map<string, LineaBorrador[]>();

  obtener(clave: string): LineaBorrador[] {
    return this.borradores.get(clave) ?? [];
  }

  guardar(clave: string, lineas: LineaBorrador[]): void {
    if (lineas.length === 0) this.borradores.delete(clave);
    else this.borradores.set(clave, lineas);
  }

  /** true si la mesa tiene productos elegidos sin enviar */
  tieneBorrador(clave: string): boolean {
    return (this.borradores.get(clave)?.length ?? 0) > 0;
  }

  limpiar(clave: string): void {
    this.borradores.delete(clave);
  }
}
