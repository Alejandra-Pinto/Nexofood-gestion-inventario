/**
 * Componente: FiltrosReportes
 * ------------------------------------------------------------------
 * HU-6.5 · Filtros en reportes (SCRUM-228)
 * Componente reutilizable con:
 *   - Fecha inicial
 *   - Fecha final
 *   - Ítem (catálogo de productos)
 *   - Botón APLICAR FILTRO
 *
 * Valida las fechas y emite FiltrosReporteData en hora de Colombia.
 */
import { Component, computed, inject, input, model, OnInit, output, signal } from '@angular/core';
import { InventarioService } from '../../../core/services/inventario.service';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { fechaColombia, FiltrosReporteData } from '../../../core/models/reportes.model';

@Component({
  selector: 'app-filtros-reportes',
  standalone: true,
  templateUrl: './filtros-reportes.html',
  styleUrl: './filtros-reportes.scss',
})
export class FiltrosReportes implements OnInit {
  private inventario = inject(InventarioService);

  // Modelos bidireccionales / inputs
  desde = model<string>('');
  hasta = model<string>('');
  idItem = model<number | ''>('');

  // Opciones de configuración
  mostrarItem = input<boolean>(true);
  cargando = input<boolean>(false);
  botonTexto = input<string>('APLICAR FILTRO');
  productosInput = input<ItemInventario[] | null>(null);

  // Evento al presionar el botón
  aplicarFiltro = output<FiltrosReporteData>();

  // Estado interno
  protected readonly hoy = fechaColombia();
  protected productosCatalogo = signal<ItemInventario[]>([]);
  protected errorFiltro = signal<string | null>(null);

  protected productos = computed<ItemInventario[]>(() => {
    const custom = this.productosInput();
    if (custom !== null) return custom;
    return this.productosCatalogo();
  });

  ngOnInit(): void {
    if (this.productosInput() === null) {
      this.cargarProductos();
    }
  }

  cargarProductos(): void {
    this.inventario.listar('PRODUCTO').subscribe({
      next: (lista) => {
        this.productosCatalogo.set([...lista].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      },
      error: () => {
        this.productosCatalogo.set([]);
      },
    });
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
