/**
 * Componente: NuevoPedido
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-146 Diseñar interfaz de selección de productos y cantidades
 *        · SCRUM-149 Validar stock, cantidad inválida y pedido vacío (en pantalla)
 *
 * El mesero toca un producto del catálogo para agregarlo y ajusta la
 * cantidad con − / +. El resumen muestra subtotales y el total.
 * El backend vuelve a validar todo y calcula el total real.
 */
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InventarioService } from '../../../core/services/inventario.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ToastService } from '../../../core/services/toast.service';
import { Categoria, ItemInventario } from '../../../core/models/item-inventario.model';
import { CANTIDAD_MAXIMA, Pedido } from '../../../core/models/pedido.model';

/** Una línea del pedido que se está armando */
interface Linea {
  producto: ItemInventario;
  cantidad: number;
}

@Component({
  selector: 'app-nuevo-pedido',
  imports: [CurrencyPipe, RouterLink, RouterLinkActive],
  templateUrl: './nuevo-pedido.html',
  styleUrl: './nuevo-pedido.scss',
})
export class NuevoPedido {
  private inventario = inject(InventarioService);
  private pedidos = inject(PedidosService);
  private toast = inject(ToastService);

  protected readonly maximo = CANTIDAD_MAXIMA;

  /** Catálogo: solo productos (los insumos no se venden) */
  protected productos = signal<ItemInventario[]>([]);
  protected categorias = signal<Categoria[]>([]);
  protected cargando = signal(true);
  protected errorCarga = signal(false);

  /** Filtros del catálogo */
  protected categoriaSel = signal<number | null>(null);
  protected busqueda = signal('');

  /** Pedido en construcción */
  protected lineas = signal<Linea[]>([]);
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected registrado = signal<Pedido | null>(null);
  /** true cuando se intentó registrar sin productos (SCRUM-149) */
  protected intentoVacio = signal(false);

  /** Categorías que tienen al menos un producto */
  protected categoriasConProductos = computed(() =>
    this.categorias().filter((c) => this.productos().some((p) => p.id_categoria === c.id_categoria)),
  );

  /** Productos visibles según categoría y búsqueda */
  protected catalogo = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const cat = this.categoriaSel();
    return this.productos().filter(
      (p) => (cat === null || p.id_categoria === cat) && (!texto || p.nombre.toLowerCase().includes(texto)),
    );
  });

  protected totalUnidades = computed(() => this.lineas().reduce((s, l) => s + l.cantidad, 0));
  protected total = computed(() =>
    this.lineas().reduce((s, l) => s + l.cantidad * l.producto.precio_venta, 0),
  );

  constructor() {
    this.cargar();
  }

  /** Carga productos activos y categorías */
  protected cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);
    forkJoin({ items: this.inventario.listar('PRODUCTO'), categorias: this.inventario.categorias() }).subscribe({
      next: ({ items, categorias }) => {
        this.productos.set(items.filter((i) => i.tipo_item === 'PRODUCTO' && i.estado_activo !== false));
        this.categorias.set(categorias);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  /** Cantidad del producto que ya está en el pedido */
  protected cantidadEnPedido(id: number): number {
    return this.lineas().find((l) => l.producto.id_item === id)?.cantidad ?? 0;
  }

  /** Máximo que se puede pedir: lo menor entre el stock y el límite por producto */
  protected limite(p: ItemInventario): number {
    return Math.min(p.cantidad_stock, this.maximo);
  }

  /** Toca un producto del catálogo: lo agrega o suma 1 */
  protected agregar(p: ItemInventario): void {
    this.registrado.set(null);
    this.intentoVacio.set(false);
    this.cambiarCantidad(p, this.cantidadEnPedido(p.id_item) + 1);
  }

  /** Cambia la cantidad de un producto validando stock y máximo (SCRUM-149) */
  protected cambiarCantidad(p: ItemInventario, cantidad: number): void {
    this.errorGeneral.set(null);
    const tope = this.limite(p);

    if (!Number.isInteger(cantidad) || cantidad < 0) return;
    if (cantidad > tope) {
      this.toast.error(
        p.cantidad_stock <= this.maximo
          ? `Stock insuficiente: solo hay ${p.cantidad_stock} de "${p.nombre}".`
          : `La cantidad máxima por producto es ${this.maximo}.`,
      );
      cantidad = tope;
    }

    this.lineas.update((ls) => {
      const sin = ls.filter((l) => l.producto.id_item !== p.id_item);
      if (cantidad === 0) return sin;
      const existe = ls.some((l) => l.producto.id_item === p.id_item);
      return existe
        ? ls.map((l) => (l.producto.id_item === p.id_item ? { ...l, cantidad } : l))
        : [...ls, { producto: p, cantidad }];
    });
  }

  /** Cantidad escrita a mano en el resumen */
  protected escribirCantidad(p: ItemInventario, valor: string): void {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) {
      this.toast.error('La cantidad debe ser un número entero mayor a 0.');
      this.lineas.update((ls) => ls.map((l) => ({ ...l }))); // vuelve a pintar el valor anterior
      return;
    }
    this.cambiarCantidad(p, n);
  }

  protected quitar(p: ItemInventario): void {
    this.cambiarCantidad(p, 0);
  }

  protected vaciar(): void {
    this.lineas.set([]);
    this.errorGeneral.set(null);
  }

  /** Registra el pedido en el backend (SCRUM-148) */
  protected registrar(): void {
    this.errorGeneral.set(null);
    this.registrado.set(null);

    // SCRUM-149: pedido vacío
    if (this.lineas().length === 0) {
      this.intentoVacio.set(true);
      return;
    }

    this.enviando.set(true);
    const dto = { detalles: this.lineas().map((l) => ({ id_item: l.producto.id_item, cantidad: l.cantidad })) };

    this.pedidos.crear(dto).subscribe({
      next: (pedido) => {
        this.enviando.set(false);
        this.registrado.set(pedido);
        this.lineas.set([]);
        this.toast.exito(`Pedido #${pedido.id_pedido} registrado`);
        this.cargar(); // refresca el stock mostrado
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.errorGeneral.set(this.mensajeError(e));
      },
    });
  }

  /** Traduce el error HTTP a un mensaje para el usuario */
  private mensajeError(e: HttpErrorResponse): string {
    const m = e.error?.message;
    const texto = Array.isArray(m) ? m.join('. ') : m;
    switch (e.status) {
      case 400:
      case 404:
        return texto ?? 'Revise los productos del pedido.';
      case 401:
        return 'Sesión expirada. Vuelva a iniciar sesión.';
      case 403:
        return 'No tiene permisos para registrar pedidos.';
      case 0:
        return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
      default:
        return 'No se pudo registrar el pedido. Intente de nuevo.';
    }
  }
}
