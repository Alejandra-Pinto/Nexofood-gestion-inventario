/**
 * Componente: NuevoPedido
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-146 Diseñar interfaz de selección de productos y cantidades
 *        · SCRUM-149 Validar stock, cantidad inválida y pedido vacío (en pantalla)
 *
 * Pantalla "Mesa N" del prototipo del mesero:
 *   - "+ Nuevo choripán" abre el paso "Elegí tu chori" (productos de la
 *     categoría Choripanes).
 *   - Las demás categorías (Bebidas, Adicionales...) se agregan tocando la fila.
 *   - Abajo: total de la mesa y "Enviar pedido a caja" (registra el pedido).
 *
 * Rutas: /ventas/mesa/:numero (pedido de una mesa)
 *        /ventas/nuevo-pedido  (sin mesa: para llevar / tomado en caja)
 *
 * Si la mesa ya tiene un pedido activo se muestra ese pedido (solo lectura);
 * agregarle productos corresponde a la HU-3.3 (modificar pedido).
 */
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { InventarioService } from '../../../core/services/inventario.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  BorradorPedidoService,
  LineaBorrador,
} from '../../../core/services/borrador-pedido.service';
import { Categoria, ItemInventario } from '../../../core/models/item-inventario.model';
import { CANTIDAD_MAXIMA, ETIQUETA_ESTADO, Pedido } from '../../../core/models/pedido.model';
// IMPORTAMOS NUESTRO COMPONENTE DE TICKET
import { TicketComandaComponent } from '../../pedidos/ticket-comanda/ticket-comanda';

interface Seccion {
  categoria: Categoria;
  productos: ItemInventario[];
}

function esCategoriaChoripan(c: Categoria): boolean {
  return c.nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('chori');
}

@Component({
  selector: 'app-nuevo-pedido',
  imports: [CurrencyPipe, RouterLink, TicketComandaComponent], // <-- AGREGADO AQUÍ
  templateUrl: './nuevo-pedido.html',
  styleUrl: './nuevo-pedido.scss',
})
export class NuevoPedido {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private inventario = inject(InventarioService);
  private pedidos = inject(PedidosService);
  private borradores = inject(BorradorPedidoService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  protected readonly maximo = CANTIDAD_MAXIMA;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;

  protected readonly mesa: number | null = this.leerMesa();
  private readonly clave = this.mesa ? `mesa-${this.mesa}` : 'llevar';

  protected nombreUsuario = computed(() => this.auth.usuarioActual()?.nombre ?? 'Mesero');

  protected productos = signal<ItemInventario[]>([]);
  protected categorias = signal<Categoria[]>([]);
  protected cargando = signal(true);
  protected errorCarga = signal(false);

  protected pedidoActivo = signal<Pedido | null>(null);

  protected vista = signal<'pedido' | 'choripan'>('pedido');
  protected choriSel = signal<ItemInventario | null>(null);
  protected choriCantidad = signal(1);

  protected lineas = signal<LineaBorrador[]>(this.borradores.obtener(this.clave));
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected intentoVacio = signal(false);

  // --- NUEVAS SEÑALES PARA EL TICKET ---
  protected mostrarTicket = signal<boolean>(false);
  protected pedidoCreado = signal<Pedido | null>(null);
  // -------------------------------------

  private categoriaChori = computed(() => this.categorias().find(esCategoriaChoripan) ?? null);

  protected choripanes = computed(() => {
    const cat = this.categoriaChori();
    return cat ? this.productos().filter((p) => p.id_categoria === cat.id_categoria) : [];
  });

  protected secciones = computed<Seccion[]>(() => {
    const idChori = this.categoriaChori()?.id_categoria;
    return this.categorias()
      .filter((c) => c.id_categoria !== idChori)
      .map((c) => ({ categoria: c, productos: this.productos().filter((p) => p.id_categoria === c.id_categoria) }))
      .filter((s) => s.productos.length > 0);
  });

  protected lineasChori = computed(() => {
    const idChori = this.categoriaChori()?.id_categoria;
    return this.lineas().filter((l) => l.producto.id_categoria === idChori);
  });

  protected resumen = computed(() => {
    const partes: string[] = [];
    const chori = this.lineasChori().reduce((s, l) => s + l.cantidad, 0);
    if (chori) partes.push(`${chori} ${chori === 1 ? 'Choripán' : 'Choripanes'}`);
    for (const s of this.secciones()) {
      const n = this.lineas()
        .filter((l) => l.producto.id_categoria === s.categoria.id_categoria)
        .reduce((t, l) => t + l.cantidad, 0);
      if (n) partes.push(`${n} ${s.categoria.nombre}`);
    }
    return partes.join(' · ');
  });

  protected total = computed(() =>
    this.lineas().reduce((s, l) => s + l.cantidad * l.producto.precio_venta, 0),
  );

  constructor() {
    this.cargar();
  }

  private leerMesa(): number | null {
    const n = Number(this.route.snapshot.paramMap.get('numero'));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);

    const pedidoActivo$ = this.mesa
      ? this.pedidos.mesas().pipe(
          switchMap((mesas) => {
            const m = mesas.find((x) => x.numero === this.mesa);
            return m?.id_pedido ? this.pedidos.obtener(m.id_pedido) : of(null);
          }),
        )
      : of(null);

    forkJoin({
      items: this.inventario.listar('PRODUCTO'),
      categorias: this.inventario.categorias(),
      activo: pedidoActivo$,
    }).subscribe({
      next: ({ items, categorias, activo }) => {
        this.productos.set(items.filter((i) => i.tipo_item === 'PRODUCTO' && i.estado_activo !== false));
        this.categorias.set(categorias);
        this.pedidoActivo.set(activo);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  protected cantidadEnPedido(id: number): number {
    return this.lineas().find((l) => l.producto.id_item === id)?.cantidad ?? 0;
  }

  protected limite(p: ItemInventario): number {
    return Math.min(p.cantidad_stock, this.maximo);
  }

  protected cambiarCantidad(p: ItemInventario, cantidad: number): void {
    this.errorGeneral.set(null);
    this.intentoVacio.set(false);
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
    this.borradores.guardar(this.clave, this.lineas());
  }

  protected sumar(p: ItemInventario): void {
    if (p.cantidad_stock <= 0) return;
    this.cambiarCantidad(p, this.cantidadEnPedido(p.id_item) + 1);
  }

  protected abrirChoripan(): void {
    this.choriSel.set(null);
    this.choriCantidad.set(1);
    this.vista.set('choripan');
  }

  protected elegirChori(p: ItemInventario): void {
    if (p.cantidad_stock <= 0) return;
    this.choriSel.set(p);
    this.choriCantidad.set(1);
  }

  protected cambiarChoriCantidad(n: number): void {
    const p = this.choriSel();
    if (!p) return;
    const disponible = this.limite(p) - this.cantidadEnPedido(p.id_item);
    if (n < 1) return;
    if (n > disponible) {
      this.toast.error(`Stock insuficiente: solo puede agregar ${disponible} más de "${p.nombre}".`);
      return;
    }
    this.choriCantidad.set(n);
  }

  protected agregarChoripan(): void {
    const p = this.choriSel();
    if (!p) return;
    this.cambiarCantidad(p, this.cantidadEnPedido(p.id_item) + this.choriCantidad());
    this.vista.set('pedido');
  }

  protected vaciar(): void {
    this.lineas.set([]);
    this.borradores.limpiar(this.clave);
    this.errorGeneral.set(null);
  }

  /** Registra el pedido en el backend: queda PENDIENTE con su ID único y comanda generada */
  protected enviar(): void {
    this.errorGeneral.set(null);

    if (this.lineas().length === 0) {
      this.intentoVacio.set(true);
      return;
    }

    this.enviando.set(true);
    const dto = {
      ...(this.mesa ? { numero_mesa: this.mesa } : {}),
      detalles: this.lineas().map((l) => ({ id_item: l.producto.id_item, cantidad: l.cantidad })),
    };

    this.pedidos.crear(dto).subscribe({
      next: (pedido) => {
        this.enviando.set(false);
        this.lineas.set([]);
        this.borradores.limpiar(this.clave);
        
        // MOSTRAMOS EL TICKET EN LUGAR DE REDIRIGIR
        this.pedidoCreado.set(pedido);
        this.mostrarTicket.set(true);
        
        this.toast.exito(
          this.mesa
            ? `Pedido #${pedido.id_pedido} de la mesa ${this.mesa} enviado a caja.`
            : `Pedido #${pedido.id_pedido} registrado.`,
        );
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.errorGeneral.set(this.mensajeError(e));
        if (e.status === 409) this.cargar();
      },
    });
  }

  /** Se ejecuta al cerrar el ticket, para volver a la pantalla principal del mesero */
  protected cerrarTicket(): void {
    this.mostrarTicket.set(false);
    this.pedidoCreado.set(null);
    if (this.mesa) {
      this.router.navigate(['/ventas/mesas']);
    } else {
      this.cargar(); // Si es para llevar, refresca el stock para un nuevo pedido
    }
  }

  private mensajeError(e: HttpErrorResponse): string {
    const m = e.error?.message;
    const texto = Array.isArray(m) ? m.join('. ') : m;
    switch (e.status) {
      case 400:
      case 404:
      case 409:
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