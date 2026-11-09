/** Pantalla: Reportes - Resumen del período y reporte de ventas */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ReportesService } from '../../../core/services/reportes.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  fechaColombia,
  MSJ_SIN_OPERACIONES,
  MSJ_SIN_VENTAS,
  PeriodoRapido,
  rangoDe,
  ReporteVentas,
  ResumenPeriodo,
  TEXTO_MEDIO,
} from '../../../core/models/reportes.model';
import {
  descargarReporteResumenPdf,
  descargarReporteVentasPdf,
} from '../../../core/utils/reporte-pdf.util';

/** Pestañas del reporte (como en el prototipo de Reportes) */
type Pestana = 'resumen' | 'ventas';

@Component({
  selector: 'app-reportes',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss',
})
export class Reportes {
  private service = inject(ReportesService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  protected readonly msjSinOperaciones = MSJ_SIN_OPERACIONES;
  protected readonly msjSinVentas = MSJ_SIN_VENTAS;
  protected readonly textoMedio = TEXTO_MEDIO;
  protected pestana = signal<Pestana>('resumen');
  protected readonly hoy = fechaColombia();
  protected readonly periodos: { valor: PeriodoRapido; texto: string }[] = [
    { valor: 'hoy', texto: 'Hoy' },
    { valor: 'semana', texto: 'Esta semana' },
    { valor: 'mes', texto: 'Este mes' },
    { valor: 'personalizado', texto: 'Personalizado' },
  ];

  // Período
  protected periodo = signal<PeriodoRapido>('mes');
  protected desde = signal(rangoDe('mes').desde);
  protected hasta = signal(rangoDe('mes').hasta);
  protected errorPeriodo = computed(() => {
    if (!this.desde() || !this.hasta()) return 'Indique la fecha inicial y la fecha final.';
    if (this.desde() > this.hasta()) return 'La fecha inicial no puede ser posterior a la fecha final.';
    return null;
  });

  protected rangoTexto = computed(() => `${this.desde()} al ${this.hasta()}`);

  // Resumen
  protected resumen = signal<ResumenPeriodo | null>(null);
  protected cargando = signal(false);
  protected errorCarga = signal<string | null>(null);
  /** Días del período con movimiento (los días en cero no se listan) */
  protected diasConMovimiento = computed(() => (this.resumen()?.por_dia ?? []).filter((d) => d.pedidos > 0));

  // Ventas
  protected reporteVentas = signal<ReporteVentas | null>(null);
  /** Para las barras de "Ventas por medio de pago" */
  protected maxPorMedio = computed(() => Math.max(1, ...(this.reporteVentas()?.por_medio_pago ?? []).map((m) => m.total)));

  protected sinDatosReporte = computed(() => {
    if (this.pestana() === 'ventas') {
      const v = this.reporteVentas();
      return !v || v.sin_ventas || (v.ventas || []).length === 0;
    }
    const r = this.resumen();
    return !r || r.sin_operaciones;
  });

  constructor() {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam === 'ventas') {
      this.pestana.set('ventas');
    }
    this.consultar();
  }

  protected cambiarPestana(p: Pestana): void {
    if (this.pestana() === p) return;
    this.pestana.set(p);
    this.consultar();
  }

  protected elegirPeriodo(p: PeriodoRapido): void {
    this.periodo.set(p);
    if (p === 'personalizado') return; // Espera a que elija las fechas
    const r = rangoDe(p);
    this.desde.set(r.desde);
    this.hasta.set(r.hasta);
    this.consultar();
  }

  /** Consulta el reporte del período elegido */
  protected consultar(): void {
    if (this.errorPeriodo()) return;
    this.cargando.set(true);
    this.errorCarga.set(null);

    if (this.pestana() === 'ventas') {
      this.service.ventas(this.desde(), this.hasta()).subscribe({
        next: (r) => {
          this.reporteVentas.set(r);
          this.cargando.set(false);
        },
        error: (e: HttpErrorResponse) => {
          this.cargando.set(false);
          this.reporteVentas.set(null);
          this.errorCarga.set(this.mensajeError(e));
        },
      });
      return;
    }

    this.service.resumen(this.desde(), this.hasta()).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.resumen.set(null);
        this.errorCarga.set(this.mensajeError(e));
      },
    });
  }

  /**
   * HU-6.6 · Impresión directa del reporte actual respetando el período consultado.
   */
  imprimir(): void {
    if (this.sinDatosReporte()) {
      this.toast.error('No hay datos en el período seleccionado para imprimir.');
      return;
    }
    window.print();
  }

  /**
   * HU-6.6 · Descarga del reporte actual en formato PDF estándar.
   */
  descargarPdf(): void {
    if (this.sinDatosReporte()) {
      this.toast.error('No hay datos en el período seleccionado para exportar a PDF.');
      return;
    }

    if (this.pestana() === 'ventas') {
      const v = this.reporteVentas();
      if (!v) return;
      try {
        const ok = descargarReporteVentasPdf(v, this.rangoTexto());
        if (ok) {
          this.toast.exito('Reporte de ventas descargado en PDF correctamente.');
        } else {
          this.toast.error('No se pudo generar el archivo PDF de ventas.');
        }
      } catch {
        this.toast.error('Ocurrió un error al preparar el PDF de ventas.');
      }
      return;
    }

    const r = this.resumen();
    if (!r) return;
    try {
      const ok = descargarReporteResumenPdf(r, this.rangoTexto());
      if (ok) {
        this.toast.exito('Reporte de resumen descargado en PDF correctamente.');
      } else {
        this.toast.error('No se pudo generar el archivo PDF del resumen.');
      }
    } catch {
      this.toast.error('Ocurrió un error al preparar el PDF del resumen.');
    }
  }

  protected mensajeError(e: HttpErrorResponse): string {
    const m = e.error?.message;
    const texto = Array.isArray(m) ? m.join('. ') : m;
    if (e.status === 0) return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
    if (e.status === 403) return 'Solo el administrador puede consultar los reportes.';
    return texto ?? 'No se pudo generar el reporte. Intente de nuevo.';
  }
}
