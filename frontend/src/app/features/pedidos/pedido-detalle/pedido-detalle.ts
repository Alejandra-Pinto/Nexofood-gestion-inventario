/**
 * Componente: PedidoDetalleComponent
 * ------------------------------------------------------------------
 * HU-3.3 Modificar pedido · HU-3.4 Estados · HU-3.6 Anular
 * HU-4.3 Actualizar comanda ante modificaciones (prototipo 14):
 *   - SCRUM-181 Al guardar cambios se genera la comanda vN+1 para cocina.
 *   - SCRUM-182 Aviso amarillo "Pedido modificado" con el cambio y la hora,
 *               versión en la comanda (Impreso 12:45:22 · v2) e historial de impresión.
 *   - SCRUM-183 Pedido finalizado: edición deshabilitada con el motivo.
 */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PedidosService } from '../../../core/services/pedidos.service';
import { InventarioService } from '../../../core/services/inventario.service';
import { AuthService } from '../../../core/services/auth.service';
import { KitchenService, ResumenComandas } from '../../../core/services/kitchen.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  CANTIDAD_MAXIMA,
  DetallePedido,
  ETIQUETA_ESTADO,
  EstadoPedido,
  ModificarPedido,
  OpcionesPedido,
  Pedido,
} from '../../../core/models/pedido.model';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { ItemTicketAdicional, TicketComandaComponent } from '../ticket-comanda/ticket-comanda';
import {
  AdicionalLinea,
  EditarAdicionales,
  ProductoLinea,
  ResultadoAdicionales,
} from '../editar-adicionales/editar-adicionales';
import {
  ConsumidorInsumo,
  LineaConsumo,
  esLineaConfigurada,
  faltanteStock,
} from '../../../core/utils/configuracion-linea';
import { catchError, of } from 'rxjs';
import { resumirCambios } from '../../../core/utils/cambios-comanda';

/** HU-4.3 · SCRUM-183: estados en los que el pedido ya no admite modificaciones */
export const ESTADOS_FINALIZADOS: EstadoPedido[] = ['LISTO', 'ENTREGADO', 'PAGADO', 'ANULADO'];

export interface LineaEdicion {
  /** Identifica la fila en la tabla: "item:<id>" (simple) o "det:<id_detalle>" (con adicionales) */
  clave: string;
  /** HU-3.2: línea con adicionales, combo o promoción (se edita por id_detalle) */
  configurada: boolean;
  /** "+ Orégano", "+ Combo con papa" */
  extras: string[];
  /** Insumos que consumen sus adicionales/combo (para validar stock al aumentar) */
  consumidores: ConsumidorInsumo[];
  /** Adicionales que tiene la línea (para abrir el modal con su estado actual) */
  seleccion: AdicionalLinea[];
  /** Combo/promoción actual de la línea (null = Individual) */
  promocionNombre: string | null;
  /** Combo elegido en el modal: número, null = Individual, undefined = sin cambios */
  id_promocion?: number | null;
  /** Se cambiaron sus adicionales o su formato en el modal */
  configCambiada: boolean;
  /** Precio de venta y categoría del producto (para recalcular el precio) */
  precio_venta: number;
  id_categoria: number | null;
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
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RouterLink, TicketComandaComponent, EditarAdicionales],
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

  // Editar adicionales/formato de una línea existente
  /** Catálogo de adicionales y combos vigentes (se carga al entrar a edición) */
  public opcionesPedido = signal<OpcionesPedido | null>(null);
  /** Línea cuyo modal "Adicionales y formato" está abierto */
  public lineaAdicionales = signal<LineaEdicion | null>(null);
  /** Datos fijos del modal mientras está abierto (evita recrearlos en cada detección) */
  public productoModal = signal<ProductoLinea | null>(null);
  public otrasLineasModal = signal<LineaConsumo[]>([]);
  private secuenciaNuevas = 0;

  // HU-4.3 Versiones de la comanda e historial de impresión
  public resumenComandas = signal<ResumenComandas | null>(null);

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

  /** Roles que modifican pedidos (HU-3.3) */
  public rolPuedeModificar = computed(() => this.esAdmin() || this.esMesero());

  /** HU-4.3 · SCRUM-183: el pedido ya está listo, entregado, pagado o anulado */
  public pedidoFinalizado = computed(() => {
    const p = this.pedido();
    return !!p && ESTADOS_FINALIZADOS.includes(p.estado_pedido);
  });

  public puedeModificar = computed(() => {
    const p = this.pedido();
    if (!p) return false;

    const estadoModificable =
      p.estado_pedido === 'PENDIENTE' ||
      p.estado_pedido === 'EN_PREPARACION';

    return this.rolPuedeModificar() && estadoModificable;
  });

  /** HU-4.3 · SCRUM-183: por qué ya no se puede modificar (null si sí se puede) */
  public motivoBloqueo = computed(() => {
    const p = this.pedido();
    if (!p || !this.pedidoFinalizado()) return null;
    const motivo: Partial<Record<EstadoPedido, string>> = {
      LISTO: 'está listo para entrega',
      ENTREGADO: 'ya fue entregado',
      PAGADO: 'ya fue pagado',
      ANULADO: 'fue anulado',
    };
    return `Este pedido ${motivo[p.estado_pedido]} y ya no admite modificaciones. Cocina conserva la última comanda enviada.`;
  });

  // ---------------------------------------------------------------------------
  // HU-4.3 · Comanda versionada (prototipo 14)
  // ---------------------------------------------------------------------------

  /** Versión vigente de la comanda (v1, v2…) */
  public versionComanda = computed(() => this.resumenComandas()?.version_actual || null);

  private versionVigente = computed(() => {
    const r = this.resumenComandas();
    return r?.versiones.find((v) => v.version === r.version_actual) ?? null;
  });

  /** Hora del pie de la comanda: la de impresión si ya se imprimió */
  public fechaImpresionComanda = computed(() => {
    const v = this.versionVigente();
    return v && v.estado_impresion === 'IMPRESA' ? v.fecha_impresion : null;
  });

  /** Cambios de la versión vigente para mostrarlos en la comanda */
  public cambiosComanda = computed(() => (this.versionVigente()?.cambios ?? []).map((c) => c.texto));

  /**
   * SCRUM-182: aviso amarillo "Pedido modificado".
   * Se muestra si el pedido cambió después de su primera comanda.
   */
  public avisoModificacion = computed(() => {
    const r = this.resumenComandas();
    const m = r?.ultima_modificacion;
    if (!r || !m) return null;
    return {
      version: m.version,
      fecha: m.fecha,
      texto: resumirCambios(m.cambios.map((c) => c.texto)),
      // Solo se pide reimprimir si esa versión es la vigente y no ha salido por la impresora
      requiereReimpresion: r.requiere_reimpresion && r.version_actual === m.version,
      conError: r.estado_impresion_actual === 'ERROR',
    };
  });

  /** Historial de impresión: "12:45:22 · Comanda v1 · OK" */
  public historialImpresion = computed(() => this.resumenComandas()?.historial ?? []);

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
   * Total en edición. Las líneas con adicionales/combo usan su precio unitario
   * congelado (base o combo + Σ adicionales) × la nueva cantidad.
   */
  public totalEdicion = computed(() =>
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
        this.cargarResumenComandas(data.id_pedido);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        const mensaje = err.error?.message || 'Error al cargar el pedido.';
        this.toastService.error(mensaje);
      },
    });
  }

  /**
   * HU-4.3: versiones de la comanda e historial. Si falla (p. ej. falta la
   * migración 010) la pantalla sigue funcionando sin el aviso ni el historial.
   */
  cargarResumenComandas(idPedido: number) {
    this.kitchenService.resumen(idPedido).subscribe({
      next: (r) => this.resumenComandas.set(r),
      error: () => this.resumenComandas.set(null),
    });
  }

  // =========================================================================
  // HU-3.3 MODIFICACIÓN DE PEDIDOS
  // =========================================================================
  iniciarEdicion() {
    const p = this.pedido();
    if (!p) return;

    // HU-4.3 · SCRUM-183: pedido finalizado -> no se entra a edición
    const bloqueo = this.motivoBloqueo();
    if (bloqueo) {
      this.toastService.error(bloqueo);
      return;
    }

    const enCocina = p.estado_pedido === 'EN_PREPARACION';
    const simples = new Map<number, LineaEdicion>();
    const lineas: LineaEdicion[] = [];

    for (const d of p.detalles ?? []) {
      // HU-3.2: cada línea con adicionales o combo es una fila editable propia
      if (esLineaConfigurada(d)) {
        lineas.push(this.lineaConfigurada(d, enCocina));
        continue;
      }
      // Líneas simples: una fila por producto
      const actual = simples.get(d.id_item);
      if (actual) {
        actual.cantidad += d.cantidad;
        actual.cantidadOriginal += d.cantidad;
        if (d.notas_especiales && !actual.notas_especiales.includes(d.notas_especiales)) {
          actual.notas_especiales = actual.notas_especiales ? `${actual.notas_especiales}; ${d.notas_especiales}` : d.notas_especiales;
        }
      } else {
        const nueva: LineaEdicion = {
          clave: `item:${d.id_item}`,
          configurada: false,
          extras: [],
          consumidores: [],
          seleccion: [],
          promocionNombre: null,
          configCambiada: false,
          precio_venta: Number(d.item?.precio_venta ?? d.precio_unitario),
          id_categoria: d.item?.id_categoria ?? null,
          id_item: d.id_item,
          nombre: d.item?.nombre ?? `Producto #${d.id_item}`,
          cantidad: d.cantidad,
          cantidadOriginal: d.cantidad,
          precio_unitario: d.precio_unitario,
          notas_especiales: d.notas_especiales ?? '',
          promocion_aplicada: '',
          cantidad_stock: d.item?.cantidad_stock ?? 999,
          enviadoCocina: enCocina,
        };
        simples.set(d.id_item, nueva);
        lineas.push(nueva);
      }
    }

    this.lineasEdicion.set(lineas);
    this.busquedaCatalogo.set('');
    this.modoEdicion.set(true);

    // Stock de los insumos de adicionales y combos para validar al aumentar
    this.pedidosService
      .opciones()
      .pipe(catchError(() => of<OpcionesPedido>({ adicionales: [], promociones: [] })))
      .subscribe((o) => {
        this.opcionesPedido.set(o);
        this.asignarConsumidores(o);
      });

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

  /** Fila editable para una línea con adicionales/combo (HU-3.2) */
  private lineaConfigurada(d: DetallePedido, enCocina: boolean): LineaEdicion {
    return {
      clave: `det:${d.id_detalle}`,
      configurada: true,
      extras: [
        ...(d.adicionales ?? []).map(
          (a) => `+ ${a.nombre_adicional ?? 'Adicional'}${a.cantidad > 1 ? ' x' + a.cantidad : ''}`,
        ),
        ...(d.promocion_aplicada ? [`+ ${d.promocion_aplicada}`] : []),
      ],
      consumidores: [],
      seleccion: (d.adicionales ?? []).map((a) => ({
        id_adicional: a.id_adicional,
        cantidad: a.cantidad,
        nombre: a.nombre_adicional ?? 'Adicional',
      })),
      promocionNombre: d.promocion_aplicada ?? null,
      configCambiada: false,
      precio_venta: Number(d.item?.precio_venta ?? d.precio_unitario),
      id_categoria: d.item?.id_categoria ?? null,
      id_detalle: d.id_detalle,
      id_item: d.id_item,
      nombre: d.item?.nombre ?? `Producto #${d.id_item}`,
      cantidad: d.cantidad,
      cantidadOriginal: d.cantidad,
      // Precio congelado: base o combo + Σ adicionales
      precio_unitario: d.precio_unitario,
      notas_especiales: d.notas_especiales ?? '',
      promocion_aplicada: d.promocion_aplicada ?? '',
      cantidad_stock: d.item?.cantidad_stock ?? 999,
      enviadoCocina: enCocina,
    };
  }

  /** Relaciona cada línea con adicionales con el stock de sus insumos */
  private asignarConsumidores(o: OpcionesPedido) {
    const detalles = this.pedido()?.detalles ?? [];
    this.lineasEdicion.update((ls) =>
      ls.map((l) => {
        if (!l.configurada || l.configCambiada) return l;
        const d = detalles.find((x) => x.id_detalle === l.id_detalle);
        const consumidores: ConsumidorInsumo[] = [];
        for (const a of d?.adicionales ?? []) {
          const op = o.adicionales.find((x) => x.id_adicional === a.id_adicional);
          if (op) consumidores.push({ ...op, cantidad: a.cantidad });
        }
        const promo = o.promociones.find((x) => x.nombre === d?.promocion_aplicada);
        if (promo) consumidores.push({ ...promo, cantidad: 1 });
        return { ...l, consumidores };
      }),
    );
  }

  /** Unidades del producto en todas las filas (para el stock del producto) */
  private unidadesProducto(idItem: number, excepto?: string): number {
    return this.lineasEdicion()
      .filter((l) => l.id_item === idItem && l.clave !== excepto)
      .reduce((s, l) => s + l.cantidad, 0);
  }

  /** ¿Se puede sumar una unidad a la fila? (stock del producto entre todas sus filas) */
  puedeSumar(linea: LineaEdicion): boolean {
    return this.unidadesProducto(linea.id_item) < linea.cantidad_stock && linea.cantidad < this.maximo;
  }

  // ---------------------------------------------------------------------------
  // Adicionales y formato de una línea existente
  // ---------------------------------------------------------------------------

  /** ¿Hay adicionales o combos que apliquen a este producto? */
  tieneOpciones(linea: LineaEdicion): boolean {
    const o = this.opcionesPedido();
    if (!o) return false;
    const aplica = (x: { id_categoria: number | null }) =>
      x.id_categoria === null || linea.id_categoria === null || x.id_categoria === linea.id_categoria;
    return o.adicionales.some(aplica) || o.promociones.some(aplica) || linea.configurada;
  }

  /** Abre el modal con los adicionales y el formato que la línea tiene hoy */
  abrirAdicionales(linea: LineaEdicion) {
    if (!this.opcionesPedido()) return;
    this.productoModal.set({ nombre: linea.nombre, precio_venta: linea.precio_venta, id_categoria: linea.id_categoria });
    this.otrasLineasModal.set(
      this.lineasEdicion()
        .filter((l) => l.clave !== linea.clave && l.configurada)
        .map((l) => ({ cantidad: l.cantidad, consumidores: l.consumidores })),
    );
    this.lineaAdicionales.set(linea);
  }

  cerrarAdicionales() {
    this.lineaAdicionales.set(null);
  }

  /**
   * Aplica lo elegido en el modal: la fila cambia sus adicionales, su formato y su
   * precio unitario; el subtotal y el total del pedido se recalculan (Signals).
   * Una fila simple que recibe adicionales pasa a ser una línea nueva con adicionales.
   */
  aplicarAdicionales(r: ResultadoAdicionales) {
    const linea = this.lineaAdicionales();
    this.lineaAdicionales.set(null);
    if (!linea) return;

    const formato = r.mantenerPromocion ? linea.promocionNombre : (r.promocion?.nombre ?? null);
    const seleccion: AdicionalLinea[] = r.adicionales.map((a) => ({
      id_adicional: a.id_adicional,
      cantidad: a.cantidad,
      nombre: a.nombre,
    }));
    const configurada = seleccion.length > 0 || !!formato;

    const igual =
      formato === linea.promocionNombre &&
      seleccion.length === linea.seleccion.length &&
      seleccion.every((s) => linea.seleccion.some((x) => x.id_adicional === s.id_adicional && x.cantidad === s.cantidad));
    if (igual) return;

    // Fila simple sin nada elegido: no hay nada que cambiar
    if (linea.id_detalle === undefined && !linea.configurada && !configurada) return;

    const consumidores: ConsumidorInsumo[] = [
      ...r.adicionales.filter((a) => a.consumidor).map((a) => a.consumidor!),
      ...(r.promocion ? [{ ...r.promocion, cantidad: 1 }] : []),
    ];

    const actualizada: LineaEdicion = {
      ...linea,
      configurada,
      seleccion,
      promocionNombre: formato,
      id_promocion: r.mantenerPromocion ? undefined : (r.promocion?.id_promocion ?? null),
      configCambiada: linea.id_detalle !== undefined,
      precio_unitario: r.precioUnitario,
      consumidores,
      extras: [
        ...seleccion.map((a) => `+ ${a.nombre}${a.cantidad > 1 ? ' x' + a.cantidad : ''}`),
        ...(formato ? [`+ ${formato}`] : []),
      ],
      // Una fila simple que recibe adicionales se envía como línea nueva
      ...(linea.id_detalle === undefined && !linea.clave.startsWith('nuevo:')
        ? { clave: `nuevo:${++this.secuenciaNuevas}` }
        : {}),
    };

    this.lineasEdicion.update((ls) => ls.map((l) => (l.clave === linea.clave ? actualizada : l)));
    this.toastService.exito(`Adicionales de "${linea.nombre}" actualizados.`);
  }

  cancelarEdicion() {
    this.modoEdicion.set(false);
    this.lineaAdicionales.set(null);
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

    if (nuevaCantidad > this.maximo) {
      this.toastService.error(`La cantidad máxima por producto es ${this.maximo}.`);
      return;
    }

    // Stock del producto: cuentan todas sus filas (simples y con adicionales)
    if (delta > 0 && this.unidadesProducto(linea.id_item, linea.clave) + nuevaCantidad > linea.cantidad_stock) {
      this.toastService.error(`Stock máximo disponible para "${linea.nombre}": ${linea.cantidad_stock}`);
      return;
    }

    const actualizadas = this.lineasEdicion().map((l) =>
      l.clave === linea.clave ? { ...l, cantidad: nuevaCantidad } : l,
    );

    // HU-3.2: stock de los insumos de sus adicionales y combo
    if (delta > 0 && linea.configurada) {
      const faltante = faltanteStock(
        actualizadas.filter((l) => l.configurada).map((l) => ({ cantidad: l.cantidad, consumidores: l.consumidores })),
      );
      if (faltante) {
        this.toastService.error(
          `${faltante.insumo} sin existencias suficientes. Quedan ${faltante.disponible} unidades y el pedido requiere ${faltante.requerido}.`,
        );
        return;
      }
    }

    this.lineasEdicion.set(actualizadas);
  }

  eliminarLinea(linea: LineaEdicion) {
    const p = this.pedido();
    if (p?.estado_pedido === 'EN_PREPARACION' && linea.enviadoCocina) {
      this.toastService.error('No se pueden eliminar productos que ya fueron enviados a cocina.');
      return;
    }

    this.lineasEdicion.update((ls) => ls.filter((l) => l.clave !== linea.clave));
  }

  adicionarProducto(prod: ItemInventario) {
    if (prod.cantidad_stock <= 0) {
      this.toastService.error(`El producto "${prod.nombre}" está agotado.`);
      return;
    }

    // Del catálogo se agrega como línea simple (los adicionales se eligen en "Nuevo choripán")
    const actual = this.lineasEdicion().find((l) => l.id_item === prod.id_item && !l.configurada);
    if (actual) {
      this.cambiarCantidadLinea(actual, 1);
    } else {
      if (this.unidadesProducto(prod.id_item) + 1 > prod.cantidad_stock) {
        this.toastService.error(`Stock máximo disponible para "${prod.nombre}": ${prod.cantidad_stock}`);
        return;
      }
      const nueva: LineaEdicion = {
        clave: `item:${prod.id_item}`,
        configurada: false,
        extras: [],
        consumidores: [],
        seleccion: [],
        promocionNombre: null,
        configCambiada: false,
        precio_venta: prod.precio_venta,
        id_categoria: prod.id_categoria ?? null,
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

    // Las líneas con adicionales/combo viajan con su id_detalle para conservar
    // sus adicionales; la promoción NO se reenvía (es la que ya tiene la línea).
    // - Líneas existentes con adicionales/combo: viajan con su id_detalle.
    // - Si se cambiaron sus adicionales o formato: lista completa de adicionales
    //   e id_promocion (null = Individual; se omite si conserva su combo actual).
    // - Líneas nuevas con adicionales (sin id_detalle): se crean en el backend.
    const dto: ModificarPedido = {
      detalles: lineas.map((l) => {
        const enviarConfig = l.configCambiada || (l.id_detalle === undefined && l.configurada);
        return {
          ...(l.id_detalle !== undefined ? { id_detalle: l.id_detalle } : {}),
          id_item: l.id_item,
          cantidad: l.cantidad,
          notas_especiales: l.notas_especiales?.trim() || undefined,
          ...(enviarConfig
            ? {
                adicionales: l.seleccion.map((a) =>
                  a.cantidad > 1 ? { id_adicional: a.id_adicional, cantidad: a.cantidad } : { id_adicional: a.id_adicional },
                ),
                ...(l.id_promocion !== undefined ? { id_promocion: l.id_promocion } : {}),
              }
            : {}),
        };
      }),
    };

    const versionAnterior = this.versionComanda() ?? 0;

    this.pedidosService.modificar(p.id_pedido, dto).subscribe({
      next: (pedidoActualizado: Pedido) => {
        this.pedido.set(pedidoActualizado);
        this.guardandoEdicion.set(false);
        this.modoEdicion.set(false);

        // HU-4.3 · SCRUM-181: si hubo cambios el backend generó la comanda vN+1
        this.kitchenService.resumen(p.id_pedido).subscribe({
          next: (r) => {
            this.resumenComandas.set(r);
            if (r.version_actual > versionAnterior) {
              this.toastService.exito(
                `Pedido #${pedidoActualizado.id_pedido} modificado. Comanda v${r.version_actual} enviada a cocina.`,
              );
              this.tituloTicket.set('COMANDA DE COCINA');
              this.itemsAdicionalesTicket.set([]);
              this.mostrarTicket.set(true);
            } else {
              this.toastService.exito('No hubo cambios en el pedido.');
            }
          },
          error: () => {
            this.resumenComandas.set(null);
            this.toastService.exito(`Pedido #${pedidoActualizado.id_pedido} modificado exitosamente.`);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.guardandoEdicion.set(false);
        const mensaje = err.error?.message || 'Error al guardar los cambios del pedido.';
        this.toastService.error(mensaje);
        // HU-4.3 · SCRUM-183: el pedido se finalizó mientras se editaba
        if (err.error?.codigo === 'PEDIDO_NO_MODIFICABLE') {
          this.modoEdicion.set(false);
          this.cargarPedido(p.id_pedido);
        }
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

        this.cargarResumenComandas(pedidoActualizado.id_pedido);

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
      next: (comanda) => {
        this.isPrinting.set(false);
        const v = comanda?.version ? ` v${comanda.version}` : '';
        this.toastService.exito(`Comanda${v} del pedido #${p.id_pedido} enviada a la impresora térmica.`);
        this.cargarResumenComandas(p.id_pedido);
      },
      error: (err: HttpErrorResponse) => {
        this.isPrinting.set(false);
        const mensaje = err.error?.message || 'No se pudo enviar la comanda a la impresora.';
        this.toastService.error(mensaje);
      }
    });
  }
}
