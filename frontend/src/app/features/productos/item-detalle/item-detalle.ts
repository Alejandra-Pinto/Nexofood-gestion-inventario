/**
 * Componente: ItemDetalle (tarjeta "VER DETALLES" · Prototipo 12)
 * ------------------------------------------------------------------
 * Muestra toda la información de un producto o insumo consultando
 * GET /products/:id.
 *
 * HU-2.2 · SCRUM-194 Confidencialidad del costo de fabricación
 *   - El bloque "COSTO (SOLO ADMIN)" se renderiza solo si el usuario es
 *     Administrador Y el backend envió el campo. Para los demás roles el
 *     bloque NO existe en el DOM (ni "$0", ni "—", ni "oculto").
 *   - La protección real está en el backend (ConfidencialidadInterceptor):
 *     a un no-admin el campo ni siquiera le llega en el JSON.
 */
import { Component, computed, inject, input, output, signal, effect } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { InventarioService } from '../../../core/services/inventario.service';
import { AuthService } from '../../../core/services/auth.service';
import { ItemInventario, tieneCosto } from '../../../core/models/item-inventario.model';
import { StockBadge } from '../../../shared/components/stock-badge/stock-badge';

@Component({
  selector: 'app-item-detalle',
  imports: [CurrencyPipe, StockBadge],
  templateUrl: './item-detalle.html',
  styleUrl: './item-detalle.scss',
})
export class ItemDetalle {
  private service = inject(InventarioService);
  private auth = inject(AuthService);

  /** Id del ítem a consultar */
  readonly idItem = input.required<number>();
  /** Nombre de la categoría (la lista ya la tiene cargada) */
  readonly categoria = input<string>('—');
  readonly cerrado = output<void>();

  protected item = signal<ItemInventario | null>(null);
  protected cargando = signal(true);
  protected error = signal(false);

  private readonly esAdmin = computed(() => this.auth.usuarioActual()?.rol === 'Administrador');

  /** Costo a mostrar, o null si el bloque no debe existir */
  protected costo = computed<number | null>(() => {
    const item = this.item();
    if (!this.esAdmin() || !item || !tieneCosto(item)) return null;
    return item.costo_fabricacion;
  });

  constructor() {
    effect(() => {
      const id = this.idItem();
      this.cargando.set(true);
      this.error.set(false);
      this.service.obtener(id).subscribe({
        next: (i) => {
          this.item.set(i);
          this.cargando.set(false);
        },
        error: () => {
          this.error.set(true);
          this.cargando.set(false);
        },
      });
    });
  }
}
