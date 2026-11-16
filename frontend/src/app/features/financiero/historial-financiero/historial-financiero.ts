/**
 * Pantalla: HistorialFinanciero (opción "Control financiero" del menú)
 * ------------------------------------------------------------------
 * HU-7.3 · Historial de ingresos y egresos (Administrador y Cajero)
 *   SCRUM-249 Diseñar vista del historial financiero
 *   SCRUM-250 Listado de movimientos (concepto, monto, medio)
 *   SCRUM-251 Cálculo del saldo neto actual (Ingresos - Egresos)
 *
 * Al cargar la pantalla se consulta GET /finance/movimientos.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FinanzasService } from '../../../core/services/finanzas.service';
import { AuthService } from '../../../core/services/auth.service';
import { HistorialFinanciero as Historial, MovimientoHistorial, TipoMovimiento } from '../../../core/models/finanzas.model';
import { MEDIOS_PAGO, MedioPago } from '../../../core/models/pedido.model';

type Vista = 'TODOS' | TipoMovimiento;

export const MSJ_SIN_MOVIMIENTOS = 'Aún no hay ingresos ni egresos registrados.';

const ETIQUETA_MEDIO = Object.fromEntries(MEDIOS_PAGO.map((m) => [m.valor, m.texto])) as Record<MedioPago, string>;

@Component({
  selector: 'app-historial-financiero',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './historial-financiero.html',
  styleUrl: './historial-financiero.scss',
})
export class HistorialFinanciero {
  private service = inject(FinanzasService);
  private auth = inject(AuthService);

  /** Solo el Administrador registra ingresos y egresos; el Cajero solo consulta */
  protected readonly esAdmin = computed(() => this.auth.usuarioActual()?.rol === 'Administrador');
  protected readonly msjSinMovimientos = MSJ_SIN_MOVIMIENTOS;

  protected cargando = signal(true);
  protected error = signal<string | null>(null);
  protected historial = signal<Historial | null>(null);
  protected vista = signal<Vista>('TODOS');

  protected movimientos = computed<MovimientoHistorial[]>(() => {
    const lista = this.historial()?.movimientos ?? [];
    const v = this.vista();
    return v === 'TODOS' ? lista : lista.filter((m) => m.tipo_movimiento === v);
  });

  protected cuenta = computed(() => {
    const lista = this.historial()?.movimientos ?? [];
    const ingresos = lista.filter((m) => m.tipo_movimiento === 'INGRESO').length;
    return { TODOS: lista.length, INGRESO: ingresos, EGRESO: lista.length - ingresos };
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.service.historial().subscribe({
      next: (h) => {
        this.historial.set(h);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  protected medio(m: MedioPago): string {
    return ETIQUETA_MEDIO[m] ?? m;
  }
}

function mensajeDeError(e: HttpErrorResponse): string {
  switch (e.status) {
    case 401:
      return 'Sesión expirada. Vuelva a iniciar sesión.';
    case 403:
      return 'No tiene permisos suficientes para consultar el control financiero.';
    case 0:
      return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
    default:
      return 'No se pudo cargar el historial financiero. Intente de nuevo.';
  }
}
