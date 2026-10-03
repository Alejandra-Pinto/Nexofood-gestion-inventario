/**
 * Pantalla: ItemsLista (opción "Productos" del menú)
 * ------------------------------------------------------------------
 * Muestra los productos e insumos registrados y permite abrir el
 * formulario "Nuevo producto". Diseño basado en los prototipos:
 *  - Tabla "Control de Inventario Activo" (dashboard-administrador)
 *  - Estado vacío "Aún no hay productos" (21. Estados vacíos)
 *
 * HU-2.1 · SCRUM-121 Diseñar formulario de registro de ítems
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { InventarioService } from '../../../core/services/inventario.service';
import { Categoria, ItemInventario, TipoItem, tieneStockBajo } from '../../../core/models/item-inventario.model';
import { ItemForm } from '../item-form/item-form';

/** Opciones del filtro por tipo ('' = todos) */
type FiltroTipo = TipoItem | '';

@Component({
  selector: 'app-items-lista',
  imports: [ItemForm, CurrencyPipe],
  templateUrl: './items-lista.html',
  styleUrl: './items-lista.scss',
})
export class ItemsLista {
  private service = inject(InventarioService);

  // Datos traídos del backend
  protected items = signal<ItemInventario[]>([]);
  protected categorias = signal<Categoria[]>([]);

  // Estado de la pantalla
  protected cargando = signal(true);
  protected error = signal(false);
  protected mostrarForm = signal(false);

  // Filtros de la tabla
  protected filtroTipo = signal<FiltroTipo>('');
  protected busqueda = signal('');
  protected readonly filtros: { valor: FiltroTipo; texto: string }[] = [
    { valor: '', texto: 'Todos' },
    { valor: 'PRODUCTO', texto: 'Productos' },
    { valor: 'INSUMO', texto: 'Insumos' },
  ];

  /** Función para saber si un ítem está en stock bajo (se usa en el HTML) */
  protected readonly stockBajo = tieneStockBajo;

  /** Ítems que se muestran en la tabla según el tipo y el texto buscado */
  protected filtrados = computed(() => {
    const tipo = this.filtroTipo();
    const texto = this.busqueda().trim().toLowerCase();
    return this.items().filter(
      (i) => (!tipo || i.tipo_item === tipo) && (!texto || i.nombre.toLowerCase().includes(texto)),
    );
  });

  /** Cantidad de ítems activos con stock bajo (para el resumen) */
  protected totalBajo = computed(() => this.items().filter((i) => i.estado_activo && tieneStockBajo(i)).length);

  constructor() {
    // Se piden ítems y categorías al mismo tiempo (GET /products y GET /categories)
    forkJoin({ items: this.service.listar(), categorias: this.service.categorias() }).subscribe({
      next: ({ items, categorias }) => {
        this.items.set(items);
        this.categorias.set(categorias);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set(true);
        this.cargando.set(false);
      },
    });
  }

  /** Nombre de la categoría a partir de su id */
  nombreCategoria(id: number): string {
    return this.categorias().find((c) => c.id_categoria === id)?.nombre ?? '—';
  }

  /** Agrega a la tabla el ítem recién creado, en orden alfabético */
  agregar(item: ItemInventario): void {
    this.items.update((lista) => [...lista, item].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  /** Quita los filtros de la tabla */
  limpiarFiltros(): void {
    this.filtroTipo.set('');
    this.busqueda.set('');
  }
}
