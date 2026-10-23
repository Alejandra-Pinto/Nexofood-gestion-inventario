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

export interface LineaBorrador {
  producto: ItemInventario;
  cantidad: number;
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
