/**
 * Componente: AlertaStock
 * ------------------------------------------------------------------
 * HU-3.2 · SCRUM-155 Tarjeta "Stock insuficiente" (prototipo 21):
 *   "Chimichurri sin existencias suficientes"
 *   "Quedan 5 unidades y el pedido requiere 8. No se puede agregar al pedido."
 *   [Quitar producto]  [Registrar ingreso]
 */
import { Component, input, output } from '@angular/core';
import { FaltanteStock } from '../../../core/utils/configuracion-linea';

@Component({
  selector: 'app-alerta-stock',
  template: `
    <div class="alerta-stock" role="alert">
      <p class="titulo">
        <span class="icono" aria-hidden="true">⚠</span>
        {{ faltante().insumo }} sin existencias suficientes
      </p>
      <p class="detalle">
        Quedan {{ faltante().disponible }} {{ faltante().disponible === 1 ? 'unidad' : 'unidades' }}
        y el pedido requiere {{ faltante().requerido }}. No se puede agregar al pedido.
      </p>
      @if (faltante().usado_por.length) {
        <p class="usado">Lo usa: {{ faltante().usado_por.join(', ') }}</p>
      }
      <div class="acciones">
        <button type="button" class="btn btn-secundario" (click)="quitar.emit()">Quitar producto</button>
        @if (puedeRegistrarIngreso()) {
          <button type="button" class="btn btn-primario" (click)="registrarIngreso.emit()">Registrar ingreso</button>
        }
      </div>
    </div>
  `,
  styles: `
    .alerta-stock {
      margin: 14px 0;
      padding: 14px 16px;
      border: 1px solid #f3e1a6;
      border-radius: 12px;
      background: #fdf8e6;
      color: #5c4a10;
    }
    .titulo { margin: 0; font-weight: 700; color: #8a6d12; display: flex; gap: 6px; align-items: baseline; }
    .detalle { margin: 4px 0 0; font-size: 0.85rem; }
    .usado { margin: 4px 0 0; font-size: 0.75rem; color: #8a6d12; }
    .acciones { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  `,
})
export class AlertaStock {
  readonly faltante = input.required<FaltanteStock>();
  /** "Registrar ingreso" solo para Administrador o usuarios con permiso de inventario */
  readonly puedeRegistrarIngreso = input(false);

  readonly quitar = output<void>();
  readonly registrarIngreso = output<void>();
}
