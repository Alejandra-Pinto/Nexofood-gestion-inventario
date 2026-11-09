/**
 * Componente: ReporteInventario
 * HU-6.1 · Generar reporte de inventario consolidado
 * HU-6.6 · Descargar y/o imprimir reportes
 *
 * Exclusivo para rol Administrador (protegido por adminGuard en rutas).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportesService } from '../../../core/services/reportes.service';
import { ToastService } from '../../../core/services/toast.service';
import { ItemReporteInventario, ReporteInventarioResultado } from '../../../core/models/reporte.model';
import { descargarReporteInventarioPdf } from '../../../core/utils/reporte-pdf.util';

export type FiltroReporte = 'TODOS' | 'PRODUCTO' | 'INSUMO' | 'BAJO_STOCK' | 'AGOTADOS';

@Component({
  selector: 'app-reporte-inventario',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './reporte-inventario.html',
  styleUrl: './reporte-inventario.scss',
})
export class ReporteInventario {
  private service = inject(ReportesService);
  private toast = inject(ToastService);

  // Estados de carga y datos
  protected cargando = signal(true);
  protected errorCarga = signal<string | null>(null);
  protected resultado = signal<ReporteInventarioResultado | null>(null);

  // Filtros interactivos en pantalla
  protected filtroSeleccionado = signal<FiltroReporte>('TODOS');
  protected terminoBusqueda = signal('');

  // Computados
  protected items = computed<ItemReporteInventario[]>(() => this.resultado()?.items ?? []);
  protected resumen = computed(() => this.resultado()?.resumen ?? null);
  protected fechaGeneracion = computed(() => this.resultado()?.fecha_generacion ?? null);
  protected inventarioVacio = computed(() => !this.cargando() && this.items().length === 0);

  protected itemsFiltrados = computed<ItemReporteInventario[]>(() => {
    let lista = this.items();
    const filtro = this.filtroSeleccionado();
    const busqueda = this.terminoBusqueda().trim().toLowerCase();

    if (filtro === 'PRODUCTO') {
      lista = lista.filter((i) => i.tipo_item === 'PRODUCTO');
    } else if (filtro === 'INSUMO') {
      lista = lista.filter((i) => i.tipo_item === 'INSUMO');
    } else if (filtro === 'BAJO_STOCK') {
      lista = lista.filter((i) => i.estado_stock === 'BAJO');
    } else if (filtro === 'AGOTADOS') {
      lista = lista.filter((i) => i.estado_stock === 'AGOTADO');
    }

    if (busqueda) {
      lista = lista.filter(
        (i) =>
          i.nombre.toLowerCase().includes(busqueda) ||
          i.categoria.toLowerCase().includes(busqueda) ||
          String(i.id_item).includes(busqueda),
      );
    }

    return lista;
  });

  /** Descripción textual del filtro actual para encabezados de impresión y PDF */
  protected descripcionFiltroActual = computed(() => {
    const f = this.filtroSeleccionado();
    const b = this.terminoBusqueda().trim();
    let texto = 'Todos los registros';

    if (f === 'PRODUCTO') texto = 'Solo productos';
    else if (f === 'INSUMO') texto = 'Solo insumos';
    else if (f === 'BAJO_STOCK') texto = 'Ítems con stock bajo';
    else if (f === 'AGOTADOS') texto = 'Ítems agotados';

    if (b) {
      texto += ` · Búsqueda: "${b}"`;
    }
    return texto;
  });

  constructor() {
    this.cargarReporte();
  }

  cargarReporte(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    this.service.obtenerReporteInventario().subscribe({
      next: (res) => {
        this.resultado.set(res);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.errorCarga.set(this.obtenerMensajeError(e));
      },
    });
  }

  cambiarFiltro(f: FiltroReporte): void {
    this.filtroSeleccionado.set(f);
  }

  actualizarBusqueda(termino: string): void {
    this.terminoBusqueda.set(termino);
  }

  /**
   * HU-6.6 · Descarga del reporte en formato PDF estándar.
   * Respeta los filtros aplicados en pantalla (todos, insumos, productos, bajo stock, agotados y búsqueda).
   */
  descargarPdf(): void {
    if (this.items().length === 0) {
      this.toast.error('No hay datos en el reporte para exportar a PDF.');
      return;
    }

    const items = this.itemsFiltrados();
    if (items.length === 0) {
      this.toast.error('No hay datos en el reporte para exportar a PDF con el filtro seleccionado.');
      return;
    }

    try {
      const ok = descargarReporteInventarioPdf(
        items,
        this.resumen(),
        this.descripcionFiltroActual(),
      );
      if (ok) {
        this.toast.exito('Reporte de inventario descargado en PDF correctamente.');
      } else {
        this.toast.error('No se pudo generar el archivo PDF.');
      }
    } catch {
      this.toast.error('Ocurrió un error al preparar el archivo PDF.');
    }
  }

  /**
   * HU-6.6 · Impresión directa del reporte con formato limpio (sin barras, menús ni botones).
   * Imprime la información visible en pantalla respetando los filtros aplicados.
   */
  imprimir(): void {
    if (this.items().length === 0) {
      this.toast.error('No hay datos en el inventario para imprimir.');
      return;
    }
    if (this.itemsFiltrados().length === 0) {
      this.toast.error('No hay datos en el inventario para imprimir con el filtro seleccionado.');
      return;
    }
    window.print();
  }

  private obtenerMensajeError(e: HttpErrorResponse): string {
    if (e.status === 401) return 'Sesión expirada. Inicie sesión nuevamente.';
    if (e.status === 403) return 'No tiene autorización para consultar reportes de inventario.';
    if (e.status === 0) return 'No hay conexión con el servidor backend.';
    return e.error?.message || 'Error al obtener el reporte consolidado de existencias.';
  }
}
