/**
 * Pantalla: HistorialPedidos (opción "Historial" del menú, solo Administrador)
 * ------------------------------------------------------------------
 * HU-5.1 · Consultar historial de pedidos
 * HU-5.2 · Historial con filtros (fecha, rango, producto)
 * HU-6.6 · Descargar y/o imprimir reportes
 *   SCRUM-201 Diseñar barra de filtros
 *   SCRUM-202 Filtro por fecha y rango de fechas
 *   SCRUM-203 Filtro por producto y combinación de filtros
 *   SCRUM-204 Caso sin resultados
 *
 * Al hacer clic en BUSCAR se consulta GET /queries-reports/historial con los
 * filtros elegidos. Sin filtros se listan todos los pedidos.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { HistorialService } from '../../../core/services/historial.service';
import { InventarioService } from '../../../core/services/inventario.service';
import { ToastService } from '../../../core/services/toast.service';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { EstadoPedido, ETIQUETA_ESTADO } from '../../../core/models/pedido.model';
import { FiltrosHistorial, PedidoHistorial, ResultadoHistorial } from '../../../core/models/historial.model';
import { descargarHistorialPedidosPdf } from '../../../core/utils/reporte-pdf.util';

/** Filtrar por un día o por un rango de fechas */
type ModoFecha = 'fecha' | 'rango';

export const MSJ_SIN_RESULTADOS = 'No existen operaciones para los criterios seleccionados.';
export const MSJ_ESTADO_SIN_RESULTADOS = 'No existen pedidos que coincidan con el estado indicado.';

@Component({
  selector: 'app-historial-pedidos',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './historial-pedidos.html',
  styleUrl: './historial-pedidos.scss',
})
export class HistorialPedidos {
  private service = inject(HistorialService);
  private inventario = inject(InventarioService);
  private toast = inject(ToastService);

  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly msjSinResultados = MSJ_SIN_RESULTADOS;
  protected readonly msjEstadoSinResultados = MSJ_ESTADO_SIN_RESULTADOS;

  // Barra de filtros
  protected modo = signal<ModoFecha>('fecha');
  protected fecha = signal('');
  protected desde = signal('');
  protected hasta = signal('');
  protected idItem = signal('');
  protected estado = signal<EstadoPedido | ''>('');
  protected readonly opcionesEstado: { valor: EstadoPedido; etiqueta: string }[] = (
    Object.entries(ETIQUETA_ESTADO) as [EstadoPedido, string][]
  ).map(([valor, etiqueta]) => ({ valor, etiqueta }));
  protected productos = signal<ItemInventario[]>([]);
  protected errorFiltro = signal<string | null>(null);

  // Resultado
  protected buscando = signal(false);
  protected errorCarga = signal<string | null>(null);
  protected resultado = signal<ResultadoHistorial | null>(null);
  protected pedidos = computed<PedidoHistorial[]>(() => this.resultado()?.pedidos ?? []);
  protected hayFiltros = computed(() => {
    const f = this.resultado()?.filtros;
    return !!(f && (f.fecha || f.desde || f.producto || f.estado));
  });
  protected soloFiltroEstado = computed(() => {
    const f = this.resultado()?.filtros;
    return !!(f && f.estado && !f.fecha && !f.desde && !f.producto);
  });
  protected mensajeSinResultados = computed(() => {
    return this.soloFiltroEstado() ? this.msjEstadoSinResultados : this.msjSinResultados;
  });

  /** Texto de los filtros aplicados: "04/11/2026 · Choripán Pampero · Pagado" */
  protected descripcionFiltros = computed(() => {
    const f = this.resultado()?.filtros;
    if (!f) return '';
    const partes: string[] = [];
    if (f.fecha) partes.push(aTexto(f.fecha));
    if (f.desde && f.hasta) partes.push(`del ${aTexto(f.desde)} al ${aTexto(f.hasta)}`);
    if (f.producto) partes.push(f.producto.nombre);
    if (f.estado) partes.push(this.etiquetaEstado[f.estado] ?? f.estado);
    return partes.join(' · ');
  });

  constructor() {
    this.inventario.listar('PRODUCTO').subscribe({
      next: (lista) => this.productos.set([...lista].sort((a, b) => a.nombre.localeCompare(b.nombre))),
      error: () => this.productos.set([]),
    });
    this.consultar({});
  }

  protected cambiarModo(m: ModoFecha): void {
    this.modo.set(m);
    this.errorFiltro.set(null);
  }

  /** Clic en BUSCAR */
  protected buscar(): void {
    const filtros = this.armarFiltros();
    if (filtros) this.consultar(filtros);
  }

  protected limpiar(): void {
    this.fecha.set('');
    this.desde.set('');
    this.hasta.set('');
    this.idItem.set('');
    this.estado.set('');
    this.errorFiltro.set(null);
    this.consultar({});
  }

  /** HU-6.6 · Impresión directa del historial de pedidos */
  protected imprimir(): void {
    if (this.pedidos().length === 0) {
      this.toast.error('No hay pedidos en el historial para imprimir.');
      return;
    }
    window.print();
  }

  /** HU-6.6 · Descarga del historial de pedidos en PDF */
  protected descargarPdf(): void {
    if (this.pedidos().length === 0 || !this.resultado()) {
      this.toast.error('No hay pedidos en el historial para exportar a PDF.');
      return;
    }

    const ok = descargarHistorialPedidosPdf(
      this.pedidos(),
      this.resultado()!.resumen,
      this.descripcionFiltros() || 'Todos los pedidos',
    );

    if (ok) {
      this.toast.exito('Historial de pedidos descargado en PDF correctamente.');
    } else {
      this.toast.error('No se pudo generar el archivo PDF.');
    }
  }

  /** Valida la barra y devuelve los filtros, o null si hay un error */
  private armarFiltros(): FiltrosHistorial | null {
    this.errorFiltro.set(null);
    const filtros: FiltrosHistorial = {};

    if (this.modo() === 'fecha') {
      if (this.fecha()) filtros.fecha = this.fecha();
    } else {
      const d = this.desde();
      const h = this.hasta();
      if (d || h) {
        if (!d || !h) {
          this.errorFiltro.set('Indique la fecha inicial y la fecha final.');
          return null;
        }
        if (d > h) {
          this.errorFiltro.set('La fecha inicial no puede ser posterior a la fecha final.');
          return null;
        }
        filtros.desde = d;
        filtros.hasta = h;
      }
    }

    if (this.idItem()) filtros.id_item = Number(this.idItem());
    if (this.estado()) filtros.estado = this.estado() as EstadoPedido;
    return filtros;
  }

  private consultar(filtros: FiltrosHistorial): void {
    this.buscando.set(true);
    this.errorCarga.set(null);
    this.service.buscar(filtros).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.buscando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.buscando.set(false);
        this.errorCarga.set(mensajeDeError(e));
      },
    });
  }

  /** "2x Choripán Pampero, 1x Gaseosa" */
  protected textoProductos(p: PedidoHistorial): string {
    return p.productos.map((x) => `${x.cantidad}x ${x.nombre}`).join(', ');
  }

  protected esProductoFiltrado(idItem: number): boolean {
    return this.resultado()?.filtros.producto?.id_item === idItem;
  }
}

/** 2026-11-04 -> 04/11/2026 */
function aTexto(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

function mensajeDeError(e: HttpErrorResponse): string {
  const mensaje = e.error?.message;
  switch (e.status) {
    case 400:
    case 404:
      return Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? 'Los filtros no son válidos.');
    case 401:
      return 'Sesión expirada. Vuelva a iniciar sesión.';
    case 403:
      return 'No tiene permisos suficientes para consultar el historial.';
    case 0:
      return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
    default:
      return 'No se pudo consultar el historial. Intente de nuevo.';
  }
}
