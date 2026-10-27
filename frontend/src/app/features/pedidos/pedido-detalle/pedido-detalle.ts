
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PedidosService } from '../../../core/services/pedidos.service';
import { InventarioService } from '../../../core/services/inventario.service';
import { AuthService } from '../../../core/services/auth.service';
import { KitchenService } from '../../../core/services/kitchen.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  CANTIDAD_MAXIMA,
  ETIQUETA_ESTADO,
  EstadoPedido,
  ModificarPedido,
  Pedido,
} from '../../../core/models/pedido.model';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { ItemTicketAdicional, TicketComandaComponent } from '../ticket-comanda/ticket-comanda';
import { esLineaConfigurada } from '../../../core/utils/configuracion-linea';

export interface LineaEdicion {
  id_detalle?: number;
  id_item: number;
  nombre: string;
  cantidad: number;
  cantidadOriginal: number;
  precio_unitario: number;
  notas_especiales: string;
  promocion_aplicada: string;
  cantidad_stock: number;
  enviadoCocina: boolean;
}

@Component({
  selector: 'app-pedido-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RouterLink, TicketComandaComponent],
  templateUrl: './pedido-detalle.html',
  styleUrl: './pedido-detalle.scss',
})
export class PedidoDetalleComponent implements OnInit {
  private pedidosService = inject(PedidosService);
  private inventarioService = inject(InventarioService);
  private authService = inject(AuthService);
  private kitchenService = inject(KitchenService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  public readonly etiquetaEstado = ETIQUETA_ESTADO;
  public readonly maximo = CANTIDAD_MAXIMA;


  public pedido = signal<Pedido | null>(null);
  public isLoading = signal<boolean>(false);
  public isPrinting = signal<boolean>(false);

  public mostrarTicket = signal<boolean>(false);
  public mostrarConfirmacion = signal<boolean>(false);
  public tituloTicket = signal<string>('COMANDA DE COCINA');
  public itemsAdicionalesTicket = signal<ItemTicketAdicional[]>([]);

  // HU-3.3 Estado de edición de pedido
  public modoEdicion = signal<boolean>(false);
  public lineasEdicion = signal<LineaEdicion[]>([]);
  public guardandoEdicion = signal<boolean>(false);
  public catalogoProductos = signal<ItemInventario[]>([]);
  public busquedaCatalogo = signal<string>('');

  // HU-3.6 Estado de anulación de pedido
  public mostrarModalAnular = signal<boolean>(false);
  public motivoAnulacion = signal<string>('');
  public anulando = signal<boolean>(false);
  public errorMotivo = signal<string | null>(null);

  // Permisos y roles
  public usuarioActual = this.authService.usuarioActual;
  public rol = computed(() => this.usuarioActual()?.rol);
  public esAdmin = computed(() => this.rol()?.toLowerCase() === 'administrador');
  public esCajero = computed(() => this.rol()?.toLowerCase() === 'cajero');
  public esMesero = computed(() => this.rol()?.toLowerCase() === 'mesero');

  public puedeModificar = computed(() => {
    const p = this.pedido();
    if (!p) return false;

    const rolAutorizado = this.esAdmin() || this.esMesero();
    const estadoModificable =
      p.estado_pedido === 'PENDIENTE' ||
      p.estado_pedido === 'EN_PREPARACION';

    return rolAutorizado && estadoModificable;
  });

  public puedeAnular = computed(() => {
    const p = this.pedido();
    if (!p) return false;

    const rolAutorizado = this.esAdmin() || this.esCajero();
    const estadoAnulable =
      p.estado_pedido !== 'ANULADO' &&
      p.estado_pedido !== 'PAGADO';

    return rolAutorizado && estadoAnulable;
  });

  /**
   * HU-3.2: líneas con adicionales o promoción (precio congelado). En la
   * modificación (HU-3.3) se conservan tal cual y no se fusionan con otras.
   */
  public lineasConfiguradas = computed(() => (this.pedido()?.detalles ?? []).filter((d) => esLineaConfigurada(d)));

  public totalEdicion = computed(
    () =>
      this.lineasConfiguradas().reduce((sum, d) => sum + d.cantidad * d.precio_unitario, 0) +
      this.lineasEdicion().reduce((sum, linea) => sum + linea.cantidad * linea.precio_unitario, 0),
  );

  public productosFiltrados = computed(() => {
    const q = this.busquedaCatalogo().trim().toLowerCase();

    return this.catalogoProductos().filter((producto) => {
      if (!producto.estado_activo) return false;
      if (!q) return true;
      return producto.nombre.toLowerCase().includes(q);
    });
  });

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));

      if (id) {
        this.cargarPedido(id);
      }
    });
  }

  cargarPedido(id: number) {
    this.isLoading.set(true);
    this.pedidosService.obtener(id).subscribe({
      next: (data: Pedido) => {
        this.pedido.set(data);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        const mensaje = err.error?.message || 'Error al cargar el pedido.';
        this.toastService.error(mensaje);
      },
    });
  }

  // =========================================================================
  // HU-3.3 MODIFICACIÓN DE PEDIDOS
  // =========================================================================
  iniciarEdicion() {
    const p = this.pedido();
    if (!p) return;

    if (p.estado_pedido === 'ENTREGADO' || p.estado_pedido === 'PAGADO') {
      this.toastService.error(`El pedido está ${this.etiquetaEstado[p.estado_pedido]} y ya no puede modificarse.`);
      return;
    }

    if (p.estado_pedido === 'ANULADO') {
      this.toastService.error('El pedido está anulado y no se puede modificar.');
      return;
    }

    const mapaLineas = new Map<number, LineaEdicion>();
    // HU-3.2: las líneas configuradas no se editan aquí (se conservan con su precio)
    for (const d of (p.detalles ?? []).filter((x) => !esLineaConfigurada(x))) {
      const actual = mapaLineas.get(d.id_item);
      if (actual) {
        actual.cantidad += d.cantidad;
        actual.cantidadOriginal += d.cantidad;
        if (d.notas_especiales && !actual.notas_especiales.includes(d.notas_especiales)) {
          actual.notas_especiales = actual.notas_especiales ? `${actual.notas_especiales}; ${d.notas_especiales}` : d.notas_especiales;
        }
      } else {
        mapaLineas.set(d.id_item, {
          id_detalle: d.id_detalle,
          id_item: d.id_item,
          nombre: d.item?.nombre ?? `Producto #${d.id_item}`,
          cantidad: d.cantidad,
          cantidadOriginal: d.cantidad,
          precio_unitario: d.precio_unitario,
          notas_especiales: d.notas_especiales ?? '',
          promocion_aplicada: d.promocion_aplicada ?? '',
          cantidad_stock: d.item?.cantidad_stock ?? 999,
          enviadoCocina: p.estado_pedido === 'EN_PREPARACION',
        });
      }
    }

    this.lineasEdicion.set(Array.from(mapaLineas.values()));
    this.busquedaCatalogo.set('');
    this.modoEdicion.set(true);

    // Cargar catálogo de productos para adicionar nuevos
    this.inventarioService.listar('PRODUCTO').subscribe({
      next: (items) => {
        this.catalogoProductos.set(items.filter((i) => i.tipo_item === 'PRODUCTO' && i.estado_activo));
      },
      error: () => {
        this.toastService.error('No se pudo cargar el catálogo de productos disponibles.');
      },
    });
  }

  cancelarEdicion() {
    this.modoEdicion.set(false);
    this.lineasEdicion.set([]);
  }

  cambiarCantidadLinea(linea: LineaEdicion, delta: number) {
    const p = this.pedido();
    const nuevaCantidad = linea.cantidad + delta;

    if (p?.estado_pedido === 'EN_PREPARACION' && linea.enviadoCocina && nuevaCantidad < linea.cantidadOriginal) {
      this.toastService.error(`Este producto ya fue enviado a cocina. La cantidad mínima es ${linea.cantidadOriginal}.`);
      return;
    }

    if (nuevaCantidad <= 0) {
      if (p?.estado_pedido === 'PENDIENTE' || !linea.enviadoCocina) {
        this.eliminarLinea(linea);
      }
      return;
    }

    if (nuevaCantidad > Math.min(linea.cantidad_stock, this.maximo)) {
      this.toastService.error(`Stock máximo disponible para "${linea.nombre}": ${linea.cantidad_stock}`);
      return;
    }

    this.lineasEdicion.update((ls) =>
      ls.map((l) => (l.id_item === linea.id_item ? { ...l, cantidad: nuevaCantidad } : l)),
    );
  }

  eliminarLinea(linea: LineaEdicion) {
    const p = this.pedido();
    if (p?.estado_pedido === 'EN_PREPARACION' && linea.enviadoCocina) {
      this.toastService.error('No se pueden eliminar productos que ya fueron enviados a cocina.');
      return;
    }

    this.lineasEdicion.update((ls) => ls.filter((l) => l.id_item !== linea.id_item));
  }

  adicionarProducto(prod: ItemInventario) {
    if (prod.cantidad_stock <= 0) {
      this.toastService.error(`El producto "${prod.nombre}" está agotado.`);
      return;
    }

    const actual = this.lineasEdicion().find((l) => l.id_item === prod.id_item);
    if (actual) {
      this.cambiarCantidadLinea(actual, 1);
    } else {
      const nueva: LineaEdicion = {
        id_item: prod.id_item,
        nombre: prod.nombre,
        cantidad: 1,
        cantidadOriginal: 0,
        precio_unitario: prod.precio_venta,
        notas_especiales: '',
        promocion_aplicada: '',
        cantidad_stock: prod.cantidad_stock,
        enviadoCocina: false,
      };
      this.lineasEdicion.update((ls) => [...ls, nueva]);
      this.toastService.exito(`"${prod.nombre}" agregado al pedido.`);
    }
  }

  guardarModificacion() {
    const p = this.pedido();
    if (!p) return;

    const lineas = this.lineasEdicion();
    if (lineas.length === 0) {
      this.toastService.error('El pedido debe tener al menos un producto.');
      return;
    }

    this.guardandoEdicion.set(true);

    const dto: ModificarPedido = {
      detalles: lineas.map((l) => ({
        id_item: l.id_item,
        cantidad: l.cantidad,
        notas_especiales: l.notas_especiales?.trim() || undefined,
        promocion_aplicada: l.promocion_aplicada?.trim() || undefined,
      })),
    };

    const adiciones: ItemTicketAdicional[] = lineas
      .filter((l) => !l.enviadoCocina || l.cantidad > l.cantidadOriginal)
      .map((l) => ({
        nombre: l.nombre,
        cantidad: l.enviadoCocina ? l.cantidad - l.cantidadOriginal : l.cantidad,
        notas_especiales: l.notas_especiales?.trim() || undefined,
        promocion_aplicada: l.promocion_aplicada?.trim() || undefined,
      }));

    this.pedidosService.modificar(p.id_pedido, dto).subscribe({
      next: (pedidoActualizado: Pedido) => {
        this.pedido.set(pedidoActualizado);
        this.guardandoEdicion.set(false);
        this.modoEdicion.set(false);
        this.toastService.exito(`Pedido #${pedidoActualizado.id_pedido} modificado exitosamente.`);

        if (p.estado_pedido === 'EN_PREPARACION' && adiciones.length > 0) {
          this.toastService.exito('Se generó la comanda de adición para cocina.');
          this.tituloTicket.set('COMANDA DE ADICIÓN (COCINA)');
          this.itemsAdicionalesTicket.set(adiciones);
          this.mostrarTicket.set(true);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.guardandoEdicion.set(false);
        const mensaje = err.error?.message || 'Error al guardar los cambios del pedido.';
        this.toastService.error(mensaje);
      },
    });
  }

  // =========================================================================
  // HU-3.6 ANULACIÓN DE PEDIDOS
  // =========================================================================
  abrirModalAnulacion() {
    const p = this.pedido();
    if (!p) return;

    if (p.estado_pedido === 'PAGADO') {
      this.toastService.error('El pedido ya fue pagado. La anulación ordinaria está bloqueada para preservar los movimientos financieros.');
      return;
    }

    if (p.estado_pedido === 'ANULADO') {
      this.toastService.error('El pedido ya se encuentra anulado.');
      return;
    }

    this.motivoAnulacion.set('');
    this.errorMotivo.set(null);
    this.mostrarModalAnular.set(true);
  }

  cerrarModalAnulacion() {
    if (this.anulando()) return;
    this.mostrarModalAnular.set(false);
    this.motivoAnulacion.set('');
    this.errorMotivo.set(null);
  }

  confirmarAnulacion() {
    const p = this.pedido();
    if (!p) return;

    const motivo = this.motivoAnulacion().trim();
    if (!motivo) {
      this.errorMotivo.set('El motivo de la anulación es obligatorio.');
      return;
    }

    if (motivo.length < 5) {
      this.errorMotivo.set('Indique un motivo más descriptivo (mínimo 5 caracteres).');
      return;
    }

    this.anulando.set(true);
    this.errorMotivo.set(null);

    this.pedidosService.anular(p.id_pedido, { motivo }).subscribe({
      next: (pedidoAnulado: Pedido) => {
        this.pedido.set(pedidoAnulado);
        this.anulando.set(false);
        this.mostrarModalAnular.set(false);
        this.toastService.exito(`Pedido #${pedidoAnulado.id_pedido} anulado correctamente.`);
      },
      error: (err: HttpErrorResponse) => {
        this.anulando.set(false);
        const mensaje = err.error?.message || 'Error al anular el pedido.';
        this.toastService.error(mensaje);
      },
    });
  }

  // =========================================================================
  // MÁQUINA DE ESTADOS (FLUJO OPERATIVO)
  // =========================================================================
  cambiarEstado(nuevoEstado: EstadoPedido) {
    if (this.isLoading()) return;
    const pedidoActual = this.pedido();
    if (!pedidoActual) return;

    this.isLoading.set(true);

    this.pedidosService.cambiarEstado(pedidoActual.id_pedido, nuevoEstado).subscribe({
      next: (pedidoActualizado: Pedido) => {
        this.pedido.set(pedidoActualizado);
        this.isLoading.set(false);

        if (nuevoEstado === 'EN_PREPARACION') {
          this.toastService.exito('Pedido en preparación. ¡Comanda generada!');
          this.tituloTicket.set('COMANDA DE COCINA');
          this.itemsAdicionalesTicket.set([]);
          this.mostrarTicket.set(true);
        } else {
          this.toastService.exito('Estado actualizado correctamente.');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        const mensaje = err.error?.message || 'Error al cambiar el estado.';
        this.toastService.error(mensaje);
      },
    });
  }

  abrirConfirmacionReimpresion() {
    this.mostrarConfirmacion.set(true);
  }

  cancelarConfirmacion() {
    this.mostrarConfirmacion.set(false);
  }

  /**
   * Ejecuta la solicitud de reimpresión silenciosa en el backend una vez confirmada.
   */
  ejecutarReimpresion() {
    const p = this.pedido();
    if (!p) return;

    this.mostrarConfirmacion.set(false);
    this.isPrinting.set(true);

    this.kitchenService.solicitarImpresion(p.id_pedido).subscribe({
      next: () => {
        this.isPrinting.set(false);
        this.toastService.exito(`Comanda #${p.id_pedido} enviada a la impresora térmica.`);
      },
      error: (err: HttpErrorResponse) => {
        this.isPrinting.set(false);
        const mensaje = err.error?.message || 'No se pudo enviar la comanda a la impresora.';
        this.toastService.error(mensaje);
      }
    });
  }
}
