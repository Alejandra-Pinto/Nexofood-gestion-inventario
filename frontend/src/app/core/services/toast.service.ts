/**
 * Servicio: ToastService
 * ------------------------------------------------------------------
 * Notificaciones flotantes (éxito / error / info) que se descartan solas.
 * Se muestran con <app-toast-container /> (ya incluido en MainLayout).
 *
 * Uso:  this.toast.exito('Ingreso registrado');
 *       this.toast.error('No se pudo registrar el ingreso');
 */
import { Injectable, signal } from '@angular/core';

export type TipoToast = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private siguienteId = 1;

  /** Toasts visibles en este momento */
  readonly toasts = signal<Toast[]>([]);

  exito(mensaje: string, duracionMs = 4000): number {
    return this.mostrar('exito', mensaje, duracionMs);
  }

  /** Los errores duran más para que dé tiempo de leerlos */
  error(mensaje: string, duracionMs = 7000): number {
    return this.mostrar('error', mensaje, duracionMs);
  }

  info(mensaje: string, duracionMs = 4000): number {
    return this.mostrar('info', mensaje, duracionMs);
  }

  /** duracionMs = 0 -> no se descarta solo */
  mostrar(tipo: TipoToast, mensaje: string, duracionMs: number): number {
    const id = this.siguienteId++;
    this.toasts.update((lista) => [...lista, { id, tipo, mensaje }]);
    if (duracionMs > 0) {
      setTimeout(() => this.descartar(id), duracionMs);
    }
    return id;
  }

  descartar(id: number): void {
    this.toasts.update((lista) => lista.filter((t) => t.id !== id));
  }
}
