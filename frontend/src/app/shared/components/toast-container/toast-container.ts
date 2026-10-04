import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

/** Pila de notificaciones (esquina superior derecha). Va una sola vez en MainLayout. */
@Component({
  selector: 'app-toast-container',
  template: `
    <div class="pila" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.tipo" [attr.role]="t.tipo === 'error' ? 'alert' : 'status'">
          <span class="icono" aria-hidden="true">{{ t.tipo === 'exito' ? '✓' : t.tipo === 'error' ? '⚠' : 'ℹ' }}</span>
          <span class="mensaje">{{ t.mensaje }}</span>
          <button type="button" class="cerrar" aria-label="Cerrar notificación" (click)="toast.descartar(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .pila { position: fixed; top: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 10px;
            width: min(380px, calc(100vw - 40px)); pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px;
             font-size: .88rem; border: 1px solid; background: #fff; box-shadow: 0 8px 24px rgba(31,36,48,.14);
             animation: entrar .18s ease-out; }
    .exito { background: var(--ok-suave); color: var(--ok); border-color: #bbf7d0; }
    .error { background: var(--error-suave); color: var(--error); border-color: var(--error-borde); }
    .info { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .icono { font-weight: 700; }
    .mensaje { flex: 1; line-height: 1.35; }
    .cerrar { border: 0; background: transparent; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 0 2px; }
    @keyframes entrar { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  `],
})
export class ToastContainer {
  protected toast = inject(ToastService);
}
