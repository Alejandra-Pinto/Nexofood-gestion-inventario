/**
 * Componente: FiltrosReportes
 * ------------------------------------------------------------------
 * HU-6.5 · Filtros en reportes (SCRUM-228 / SCRUM-229 / SCRUM-230)
 * Componente reutilizable con:
 *   - Selector de período: Diario, Mensual o Personalizado
 *   - Campos dinámicos de fecha según el modo
 *   - Selector de Ítem (catálogo de productos)
 *   - Botón APLICAR FILTRO
 *
 * Valida las fechas y emite FiltrosReporteData en hora de Colombia (America/Bogota).
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, model, OnInit, output, signal } from '@angular/core';
import { InventarioService } from '../../../core/services/inventario.service';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import {
  fechaColombia,
  FiltrosReporteData,
  ModoFechaReporte,
  rangoDe,
  rangoMes,
} from '../../../core/models/reportes.model';

@Component({
  selector: 'app-filtros-reportes',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './filtros-reportes.html',
  styleUrl: './filtros-reportes.scss',
})
export class FiltrosReportes implements OnInit {
  private inventario = inject(InventarioService);

  // Modelos bidireccionales / inputs
  modoFecha = model<ModoFechaReporte>('mensual');
  desde = model<string>('');
  hasta = model<string>('');
  idItem = model<number | ''>('');

  // Opciones de configuración
  mostrarModosFecha = input<boolean>(true);
  mostrarItem = input<boolean>(true);
  cargando = input<boolean>(false);
  botonTexto = input<string>('APLICAR FILTRO');
  productosInput = input<ItemInventario[] | null>(null);

  // Evento al presionar el botón
  aplicarFiltro = output<FiltrosReporteData>();

  // Estado interno de fechas en hora de Colombia
  protected readonly hoy = fechaColombia();
  protected readonly mesActual = fechaColombia().slice(0, 7);
  protected dia = signal<string>(fechaColombia());
  protected mes = signal<string>(fechaColombia().slice(0, 7));

  protected productosCatalogo = signal<ItemInventario[]>([]);
  protected errorFiltro = signal<string | null>(null);

  protected productos = computed<ItemInventario[]>(() => {
    const custom = this.productosInput();
    if (custom !== null) return custom;
    return this.productosCatalogo();
  });

  ngOnInit(): void {
    if (!this.desde() || !this.hasta()) {
      const inicial = rangoDe('mes', this.hoy);
      this.desde.set(inicial.desde);
      this.hasta.set(inicial.hasta);
    }
  }

  cargarProductos(): void {
    if (this.productosCatalogo().length > 0) return;
    this.inventario.listar('PRODUCTO').subscribe({
      next: (lista) => {
        this.productosCatalogo.set([...lista].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      },
      error: () => {
        this.productosCatalogo.set([]);
      },
    });
  }

  cambiarModoFecha(modo: ModoFechaReporte): void {
    this.modoFecha.set(modo);

    if (modo === 'diario') {
      const d = this.dia() || this.hoy;
      this.desde.set(d);
      this.hasta.set(d);
    } else if (modo === 'mensual') {
      const m = this.mes() || this.mesActual;
      const r = rangoMes(m, this.hoy);
      this.desde.set(r.desde);
      this.hasta.set(r.hasta);
    }

    this.validar();
  }

  actualizarDia(valor: string): void {
    this.dia.set(valor);
    this.desde.set(valor);
    this.hasta.set(valor);
    this.validar();
  }

  actualizarMes(valor: string): void {
    this.mes.set(valor);
    const r = rangoMes(valor, this.hoy);
    this.desde.set(r.desde);
    this.hasta.set(r.hasta);
    this.validar();
  }

  actualizarDesde(valor: string): void {
    this.desde.set(valor);
    this.validar();
  }

  actualizarHasta(valor: string): void {
    this.hasta.set(valor);
    this.validar();
  }

  actualizarItem(valor: string): void {
    this.idItem.set(valor ? Number(valor) : '');
  }

  validar(): boolean {
    const d = this.desde();
    const h = this.hasta();

    if (!d || !h) {
      this.errorFiltro.set('Indique la fecha inicial y la fecha final.');
      return false;
    }

    if (d > h) {
      this.errorFiltro.set('La fecha inicial no puede ser posterior a la fecha final.');
      return false;
    }

    this.errorFiltro.set(null);
    return true;
  }

  aplicar(): void {
    if (!this.validar()) return;

    const itemVal = this.idItem();
    this.aplicarFiltro.emit({
      desde: this.desde(),
      hasta: this.hasta(),
      id_item: itemVal !== '' && itemVal !== undefined ? Number(itemVal) : undefined,
    });
  }
}
