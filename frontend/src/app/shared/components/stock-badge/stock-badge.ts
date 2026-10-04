import { Component, computed, input } from '@angular/core';
import { ItemInventario, nivelStock } from '../../../core/models/item-inventario.model';

@Component({
  selector: 'app-stock-badge',
  template: `
    <span class="badge" [class.badge-ok]="nivel() === 'ok'" [class.badge-bajo]="nivel() === 'bajo'"
          [class.badge-agotado]="nivel() === 'agotado'" [attr.title]="ayuda()">
      @if (nivel() === 'ok') { ● OK } @else if (nivel() === 'bajo') { ⚠ Bajo } @else { ⚠ Agotado }
    </span>
  `,
  styles: [`
    .badge { display:inline-flex; align-items:center; gap:4px; padding:4px 12px; border-radius:999px;
             font-size:.75rem; font-weight:700; white-space:nowrap; }
    .badge-ok { background:#e3f6ec; color:#0f7a4a; }
    .badge-bajo { background:#fbf1d6; color:#9a6b00; }
    .badge-agotado { background:#fbe4e4; color:#c0392b; }
  `],
})
export class StockBadge {
  item = input.required<Pick<ItemInventario, 'cantidad_stock' | 'stock_minimo'>>();
  nivel = computed(() => nivelStock(this.item()));
  ayuda = computed(() =>
    this.nivel() === 'ok' ? null
      : `Stock ${this.item().cantidad_stock} (mínimo ${this.item().stock_minimo}). Requiere reposición.`);
}
