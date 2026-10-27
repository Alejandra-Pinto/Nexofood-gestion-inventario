/**
 * Componente: NuevoPedido
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-146 Diseñar interfaz de selección de productos y cantidades
 *        · SCRUM-149 Validar stock, cantidad inválida y pedido vacío (en pantalla)
 * HU-3.2 · SCRUM-151 Interfaz de adicionales, promociones y notas
 *        · SCRUM-152 Adicionales y actualización del precio (Signals)
 *        · SCRUM-153 Promociones y combos vigentes ("Combo con papa")
 *        · SCRUM-154 Notas especiales por producto (** SIN CEBOLLA **)
 *        · SCRUM-155 Promoción no vigente y adicional sin stock (prototipo 21)
 *
 * Pantalla "Mesa N" del prototipo del mesero:
 *   - "+ Nuevo choripán" abre el wizard de 3 pasos (prototipos step-1/2/3):
 *       Paso 1 Embutido · Paso 2 Pan base · Paso 3 Salsas y Extras
 *       (aderezo, formato Individual/Combo, adicionales, notas y cantidad).
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
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { InventarioService } from '../../../core/services/inventario.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  AdicionalElegido,
  BorradorPedidoService,
  LineaBorrador,
} from '../../../core/services/borrador-pedido.service';
import { Categoria, ItemInventario } from '../../../core/models/item-inventario.model';
import {
  CANTIDAD_MAXIMA,
  DetalleCrearPedido,
  ETIQUETA_ESTADO,
  ErrorPedido,
  OpcionAdicional,
  OpcionPromocion,
  OpcionesPedido,
  Pedido,
} from '../../../core/models/pedido.model';
import {
  ConsumidorInsumo,
  FaltanteStock,
  LineaConsumo,
  MAX_NOTA,
  NOTAS_RAPIDAS,
  calcularPrecioUnitario,
  claveLinea,
  componerNota,
  faltanteStock,
  formatearNotaCocina,
  precioConPromocion,
} from '../../../core/utils/configuracion-linea';
import { TicketComandaComponent } from '../../pedidos/ticket-comanda/ticket-comanda';
import { AlertaStock } from '../../../shared/components/alerta-stock/alerta-stock';

interface Seccion {
  categoria: Categoria;
  productos: ItemInventario[];
}

type Paso = 1 | 2 | 3;

/** Títulos del wizard (subtítulo dorado de la barra) */
const TITULOS_PASO: Record<Paso, string> = {
  1: 'Embutido',
  2: 'Pan base',
  3: 'Salsas y Extras',
};

function esCategoriaChoripan(c: Categoria): boolean {
  return c.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('chori');
}

/** Lo que consume una línea (adicionales + combo) para validar stock de insumos */
function consumidoresDe(adicionales: AdicionalElegido[] = [], promo?: OpcionPromocion | null): ConsumidorInsumo[] {
  return [...adicionales, ...(promo ? [{ ...promo, cantidad: 1 }] : [])];
}

@Component({
  selector: 'app-nuevo-pedido',
  imports: [CurrencyPipe, RouterLink, TicketComandaComponent, AlertaStock],
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
  protected readonly notasRapidasDisponibles = NOTAS_RAPIDAS;
  protected readonly maxNota = MAX_NOTA;
  protected readonly titulosPaso = TITULOS_PASO;

  protected readonly mesa: number | null = this.leerMesa();
  private readonly clave = this.mesa ? `mesa-${this.mesa}` : 'llevar';

  protected nombreUsuario = computed(() => this.auth.usuarioActual()?.nombre ?? 'Mesero');

  /** "Registrar ingreso" (prototipo 21) solo si puede entrar a Inventario */
  protected puedeRegistrarIngreso = computed(() => {
    const u = this.auth.usuarioActual();
    return u?.rol === 'Administrador' || !!u?.permisos?.includes('inventario');
  });

  protected productos = signal<ItemInventario[]>([]);
  protected categorias = signal<Categoria[]>([]);
  protected opciones = signal<OpcionesPedido>({ adicionales: [], promociones: [] });
  protected cargando = signal(true);
  protected errorCarga = signal(false);

  protected pedidoActivo = signal<Pedido | null>(null);

  protected lineas = signal<LineaBorrador[]>(this.borradores.obtener(this.clave));
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected intentoVacio = signal(false);

  // Ticket que se muestra al registrar el pedido
  protected mostrarTicket = signal<boolean>(false);
  protected pedidoCreado = signal<Pedido | null>(null);

  // ---------------------------------------------------------------------------
  // HU-3.2 · Wizard "Nuevo choripán"
  // ---------------------------------------------------------------------------
  protected vista = signal<'pedido' | 'choripan'>('pedido');
  protected paso = signal<Paso>(1);
  protected choriSel = signal<ItemInventario | null>(null);
  protected choriCantidad = signal(1);
  protected panSel = signal<OpcionAdicional | null>(null);
  protected aderezoSel = signal<OpcionAdicional | null>(null);
  protected extrasSel = signal<number[]>([]);
  /** null = formato Individual */
  protected promoSel = signal<OpcionPromocion | null>(null);
  protected notasRapidas = signal<string[]>([]);
  protected notaLibre = signal('');
  protected validando = signal(false);

  /** SCRUM-155: tarjeta "Stock insuficiente" (prototipo 21) */
  protected alertaStock = signal<FaltanteStock | null>(null);
  /** SCRUM-155: aviso de promoción no vigente */
  protected avisoPromo = signal<string | null>(null);

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

  /** Adicionales y promociones que aplican a la categoría de choripanes */
  private aplicaAChori = (o: { id_categoria: number | null }) =>
    o.id_categoria === null || o.id_categoria === this.categoriaChori()?.id_categoria;

  protected panes = computed(() => this.opciones().adicionales.filter((a) => a.tipo === 'PAN' && this.aplicaAChori(a)));
  protected aderezos = computed(() =>
    this.opciones().adicionales.filter((a) => a.tipo === 'ADEREZO' && this.aplicaAChori(a)),
  );
  protected extras = computed(() => this.opciones().adicionales.filter((a) => a.tipo === 'EXTRA' && this.aplicaAChori(a)));
  protected promociones = computed(() => this.opciones().promociones.filter((p) => this.aplicaAChori(p)));

  /** Adicionales de la configuración actual (pan + aderezo + extras) */
  protected adicionalesConfig = computed<AdicionalElegido[]>(() => {
    const extras = this.extras().filter((e) => this.extrasSel().includes(e.id_adicional));
    return [this.panSel(), this.aderezoSel(), ...extras]
      .filter((a): a is OpcionAdicional => a !== null)
      .map((a) => ({ ...a, cantidad: 1 }));
  });

  /** SCRUM-154: nota final = notas rápidas + texto libre */
  protected notaConfig = computed(() => componerNota(this.notasRapidas(), this.notaLibre()));
  protected notaCocina = computed(() => formatearNotaCocina(this.notaConfig()));

  /** SCRUM-152/153: precio unitario y subtotal en vivo */
  protected precioUnitarioConfig = computed(() => {
    const p = this.choriSel();
    if (!p) return 0;
    return calcularPrecioUnitario(
      p.precio_venta,
      this.adicionalesConfig().map((a) => ({ precio_unitario: a.precio_adicional, cantidad: a.cantidad })),
      this.promoSel(),
    );
  });
  protected subtotalConfig = computed(() => this.precioUnitarioConfig() * this.choriCantidad());

  protected progreso = computed(() => Math.round((this.paso() / 3) * 100));

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

  protected total = computed(() => this.lineas().reduce((s, l) => s + l.cantidad * this.precioDe(l), 0));

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
      // Si el catálogo de adicionales falla, se puede seguir vendiendo sin ellos
      opciones: this.pedidos.opciones().pipe(
        catchError(() => of<OpcionesPedido>({ adicionales: [], promociones: [] })),
      ),
    }).subscribe({
      next: ({ items, categorias, activo, opciones }) => {
        this.productos.set(items.filter((i) => i.tipo_item === 'PRODUCTO' && i.estado_activo !== false));
        this.categorias.set(categorias);
        this.pedidoActivo.set(activo);
        this.opciones.set(opciones);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Líneas del pedido
  // ---------------------------------------------------------------------------

  /** Precio de una unidad de la línea (confirmado por el backend o precio de venta) */
  protected precioDe(l: LineaBorrador): number {
    return l.precio_unitario ?? l.producto.precio_venta;
  }

  /** Cantidad de la línea simple (sin adicionales) de un producto */
  protected cantidadEnPedido(id: number): number {
    return this.lineas().find((l) => l.clave === claveLinea(id))?.cantidad ?? 0;
  }

  /** Unidades del producto en TODAS sus líneas (para el stock del producto) */
  protected cantidadTotalProducto(id: number, excepto?: string): number {
    return this.lineas()
      .filter((l) => l.producto.id_item === id && l.clave !== excepto)
      .reduce((s, l) => s + l.cantidad, 0);
  }

  protected limite(p: ItemInventario): number {
    return Math.min(p.cantidad_stock, this.maximo);
  }

  /** Bebidas y demás categorías: línea simple del producto */
  protected cambiarCantidad(p: ItemInventario, cantidad: number): void {
    this.errorGeneral.set(null);
    this.intentoVacio.set(false);
    const clave = claveLinea(p.id_item);
    const tope = Math.min(this.limite(p) - this.cantidadTotalProducto(p.id_item, clave), this.maximo);

    if (!Number.isInteger(cantidad) || cantidad < 0) return;
    if (cantidad > tope) {
      this.toast.error(
        p.cantidad_stock <= this.maximo
          ? `Stock insuficiente: solo hay ${p.cantidad_stock} de "${p.nombre}".`
          : `La cantidad máxima por producto es ${this.maximo}.`,
      );
      cantidad = Math.max(0, tope);
    }

    this.lineas.update((ls) => {
      const sin = ls.filter((l) => l.clave !== clave);
      if (cantidad === 0) return sin;
      const existe = ls.some((l) => l.clave === clave);
      return existe
        ? ls.map((l) => (l.clave === clave ? { ...l, cantidad } : l))
        : [...ls, { clave, producto: p, cantidad }];
    });
    this.guardarBorrador();
  }

  protected sumar(p: ItemInventario): void {
    if (p.cantidad_stock <= 0) return;
    this.cambiarCantidad(p, this.cantidadEnPedido(p.id_item) + 1);
  }

  /** Choripán configurado: cambia la cantidad validando stock del producto y de sus insumos */
  protected cambiarCantidadLinea(linea: LineaBorrador, cantidad: number): void {
    this.errorGeneral.set(null);
    if (!Number.isInteger(cantidad) || cantidad < 0) return;

    if (cantidad === 0) {
      this.lineas.update((ls) => ls.filter((l) => l.clave !== linea.clave));
      this.guardarBorrador();
      return;
    }

    const disponible = this.limite(linea.producto) - this.cantidadTotalProducto(linea.producto.id_item, linea.clave);
    if (cantidad > disponible) {
      this.toast.error(`Stock insuficiente: solo hay ${linea.producto.cantidad_stock} de "${linea.producto.nombre}".`);
      return;
    }

    const faltante = this.faltanteConLineas(
      this.lineas().map((l) => (l.clave === linea.clave ? { ...l, cantidad } : l)),
    );
    if (faltante) {
      this.alertaStock.set(faltante);
      return;
    }

    this.alertaStock.set(null);
    this.lineas.update((ls) => ls.map((l) => (l.clave === linea.clave ? { ...l, cantidad } : l)));
    this.guardarBorrador();
  }

  protected vaciar(): void {
    this.lineas.set([]);
    this.borradores.limpiar(this.clave);
    this.errorGeneral.set(null);
    this.alertaStock.set(null);
  }

  private guardarBorrador(): void {
    this.borradores.guardar(this.clave, this.lineas());
  }

  // ---------------------------------------------------------------------------
  // HU-3.2 · Wizard "Nuevo choripán"
  // ---------------------------------------------------------------------------

  protected abrirChoripan(): void {
    this.choriSel.set(null);
    this.choriCantidad.set(1);
    this.panSel.set(null);
    this.aderezoSel.set(null);
    this.extrasSel.set([]);
    this.promoSel.set(null);
    this.notasRapidas.set([]);
    this.notaLibre.set('');
    this.alertaStock.set(null);
    this.avisoPromo.set(null);
    this.paso.set(1);
    this.vista.set('choripan');
  }

  /** Flecha atrás: paso anterior o vuelve al pedido */
  protected atras(): void {
    this.alertaStock.set(null);
    const p = this.paso();
    if (p > 1) this.paso.set((p - 1) as Paso);
    else this.vista.set('pedido');
  }

  protected puedeAvanzar = computed(() => {
    if (this.paso() === 1) return !!this.choriSel();
    if (this.paso() === 2) return this.panes().length === 0 || !!this.panSel();
    return !!this.choriSel() && !this.validando();
  });

  protected siguiente(): void {
    if (!this.puedeAvanzar()) {
      if (this.paso() === 2) this.toast.error('Elegí el pan del choripán.');
      return;
    }
    this.alertaStock.set(null);
    const p = this.paso();
    if (p < 3) this.paso.set((p + 1) as Paso);
    else this.agregarChoripan();
  }

  protected elegirChori(p: ItemInventario): void {
    if (p.cantidad_stock <= 0) return;
    this.choriSel.set(p);
    this.choriCantidad.set(1);
  }

  protected elegirPan(a: OpcionAdicional): void {
    if (this.panSel()?.id_adicional === a.id_adicional) return;
    if (this.bloqueadoPorStock({ pan: a })) return;
    this.panSel.set(a);
  }

  /** Aderezo: chip de selección única (tocar de nuevo lo quita) */
  protected elegirAderezo(a: OpcionAdicional): void {
    if (this.aderezoSel()?.id_adicional === a.id_adicional) {
      this.aderezoSel.set(null);
      return;
    }
    if (this.bloqueadoPorStock({ aderezo: a })) return;
    this.aderezoSel.set(a);
  }

  /** SCRUM-152: marcar/desmarcar un adicional actualiza el subtotal al instante */
  protected alternarExtra(a: OpcionAdicional): void {
    const marcados = this.extrasSel();
    if (marcados.includes(a.id_adicional)) {
      this.extrasSel.set(marcados.filter((id) => id !== a.id_adicional));
      return;
    }
    if (this.bloqueadoPorStock({ extras: [...marcados, a.id_adicional] })) return;
    this.extrasSel.set([...marcados, a.id_adicional]);
  }

  protected extraMarcado(a: OpcionAdicional): boolean {
    return this.extrasSel().includes(a.id_adicional);
  }

  /** SCRUM-153: formato Individual (null) o una promoción/combo */
  protected elegirFormato(promo: OpcionPromocion | null): void {
    this.avisoPromo.set(null);
    if (promo && this.bloqueadoPorStock({ promo })) return;
    this.promoSel.set(promo);
  }

  /** Precio del botón de formato: "Individual $16.000" / "Combo con papa $19.000" */
  protected precioFormato(promo: OpcionPromocion | null): number {
    return precioConPromocion(this.choriSel()?.precio_venta ?? 0, promo);
  }

  protected alternarNotaRapida(nota: string): void {
    this.notasRapidas.update((ns) => (ns.includes(nota) ? ns.filter((n) => n !== nota) : [...ns, nota]));
  }

  protected escribirNota(texto: string): void {
    this.notaLibre.set(texto.slice(0, MAX_NOTA));
  }

  protected cambiarChoriCantidad(n: number): void {
    const p = this.choriSel();
    if (!p || n < 1) return;
    const disponible = this.limite(p) - this.cantidadTotalProducto(p.id_item);
    if (n > disponible) {
      this.toast.error(`Stock insuficiente: solo puede agregar ${disponible} más de "${p.nombre}".`);
      return;
    }
    if (this.bloqueadoPorStock({ cantidad: n })) return;
    this.choriCantidad.set(n);
  }

  /**
   * SCRUM-155: ¿alcanza el stock de los insumos si se aplica este cambio a la
   * configuración actual? Si no, muestra la tarjeta del prototipo 21 y NO lo aplica.
   */
  private bloqueadoPorStock(cambio: {
    pan?: OpcionAdicional;
    aderezo?: OpcionAdicional;
    extras?: number[];
    promo?: OpcionPromocion;
    cantidad?: number;
  }): boolean {
    const extrasIds = cambio.extras ?? this.extrasSel();
    const adicionales = [
      cambio.pan ?? this.panSel(),
      cambio.aderezo ?? this.aderezoSel(),
      ...this.extras().filter((e) => extrasIds.includes(e.id_adicional)),
    ]
      .filter((a): a is OpcionAdicional => a !== null)
      .map((a) => ({ ...a, cantidad: 1 }));

    const candidata: LineaConsumo = {
      cantidad: cambio.cantidad ?? this.choriCantidad(),
      consumidores: consumidoresDe(adicionales, cambio.promo ?? this.promoSel()),
    };
    const faltante = faltanteStock([...this.consumoDe(this.lineas()), candidata]);
    this.alertaStock.set(faltante);
    return faltante !== null;
  }

  private consumoDe(lineas: LineaBorrador[]): LineaConsumo[] {
    return lineas.map((l) => ({ cantidad: l.cantidad, consumidores: consumidoresDe(l.adicionales, l.promocion) }));
  }

  private faltanteConLineas(lineas: LineaBorrador[]): FaltanteStock | null {
    return faltanteStock(this.consumoDe(lineas));
  }

  /** Línea del borrador a partir de la configuración del wizard */
  private lineaDesdeConfig(): LineaBorrador | null {
    const p = this.choriSel();
    if (!p) return null;
    const adicionales = this.adicionalesConfig();
    const promo = this.promoSel();
    const nota = this.notaConfig();
    return {
      clave: claveLinea(p.id_item, adicionales, promo?.id_promocion, nota),
      producto: p,
      cantidad: this.choriCantidad(),
      precio_unitario: this.precioUnitarioConfig(),
      adicionales,
      promocion: promo,
      notas_especiales: nota,
    };
  }

  /**
   * "Agregar al pedido": el backend confirma precio, stock y vigencia de la
   * promoción (POST /orders/cotizar) ANTES de sumar el producto al borrador.
   */
  protected agregarChoripan(): void {
    const nueva = this.lineaDesdeConfig();
    if (!nueva || this.validando()) return;

    if (this.panes().length > 0 && !this.panSel()) {
      this.toast.error('Elegí el pan del choripán.');
      this.paso.set(2);
      return;
    }

    const existente = this.lineas().find((l) => l.clave === nueva.clave);
    if (existente && existente.cantidad + nueva.cantidad > this.maximo) {
      this.toast.error(`La cantidad máxima por producto es ${this.maximo}.`);
      return;
    }
    const lineasFinales = existente
      ? this.lineas().map((l) => (l.clave === nueva.clave ? { ...l, cantidad: l.cantidad + nueva.cantidad } : l))
      : [...this.lineas(), nueva];

    const faltante = this.faltanteConLineas(lineasFinales);
    if (faltante) {
      this.alertaStock.set(faltante);
      return;
    }

    this.validando.set(true);
    this.alertaStock.set(null);
    this.avisoPromo.set(null);

    this.pedidos.cotizar({ detalles: lineasFinales.map((l) => this.dtoDe(l)) }).subscribe({
      next: (r) => {
        this.validando.set(false);
        const cotizada = r.lineas.find(
          (c) => claveLinea(c.id_item, c.adicionales, c.id_promocion, c.notas_especiales) === nueva.clave,
        );
        const precio = cotizada ? Number(cotizada.precio_unitario) : nueva.precio_unitario;
        this.lineas.set(
          lineasFinales.map((l) => (l.clave === nueva.clave ? { ...l, precio_unitario: precio } : l)),
        );
        this.guardarBorrador();
        this.vista.set('pedido');
        this.toast.exito(`${nueva.producto.nombre} agregado al pedido.`);
      },
      error: (e: HttpErrorResponse) => {
        this.validando.set(false);
        if (!this.manejarErrorConfiguracion(e)) {
          this.toast.error(this.mensajeError(e));
        }
      },
    });
  }

  /**
   * Errores de HU-3.2 que devuelve el backend:
   *   422 PROMOCION_NO_VIGENTE -> avisa, quita la promo y NO agrega el producto
   *   400 STOCK_INSUFICIENTE   -> tarjeta del prototipo 21
   * Devuelve true si el error se manejó.
   */
  private manejarErrorConfiguracion(e: HttpErrorResponse): boolean {
    const err = (e.error ?? {}) as ErrorPedido;
    const texto = Array.isArray(err.message) ? err.message.join('. ') : err.message;

    if (err.codigo === 'PROMOCION_NO_VIGENTE') {
      const mensaje = texto ?? 'La promoción no está disponible y no se aplicó al pedido.';
      this.avisoPromo.set(mensaje);
      this.toast.error(mensaje);
      // Ya no se ofrece: se quita del catálogo y el formato vuelve a Individual
      this.opciones.update((o) => ({
        ...o,
        promociones: o.promociones.filter((p) => p.id_promocion !== err.id_promocion),
      }));
      if (this.promoSel()?.id_promocion === err.id_promocion) this.promoSel.set(null);
      // Si una línea del borrador ya la tenía, se quita para que el pedido se pueda enviar
      this.lineas.update((ls) =>
        ls.filter((l) => l.promocion?.id_promocion !== err.id_promocion),
      );
      this.guardarBorrador();
      return true;
    }

    if (err.codigo === 'STOCK_INSUFICIENTE' && err.id_item !== undefined) {
      const disponible = Number(err.disponible ?? 0);
      this.alertaStock.set({
        id_insumo: err.id_item,
        insumo: err.insumo ?? 'El insumo',
        disponible,
        requerido: Number(err.requerido ?? 0),
        usado_por: err.adicionales ?? [],
      });
      // Se actualiza el stock conocido para que la pantalla no lo vuelva a ofrecer
      this.opciones.update((o) => ({
        adicionales: o.adicionales.map((a) =>
          a.id_insumo === err.id_item
            ? { ...a, stock_disponible: disponible, disponible: disponible >= a.cantidad_insumo }
            : a,
        ),
        promociones: o.promociones.map((p) =>
          p.id_insumo === err.id_item
            ? { ...p, stock_disponible: disponible, disponible: disponible >= p.cantidad_insumo }
            : p,
        ),
      }));
      return true;
    }
    return false;
  }

  /** Tarjeta de stock: "Quitar producto" */
  protected quitarSinStock(): void {
    const f = this.alertaStock();
    this.alertaStock.set(null);
    if (!f) return;

    if (this.vista() === 'choripan') {
      // En el wizard: se quita lo que usa ese insumo (pan, aderezo, extras o combo)
      if (this.panSel()?.id_insumo === f.id_insumo) this.panSel.set(null);
      if (this.aderezoSel()?.id_insumo === f.id_insumo) this.aderezoSel.set(null);
      this.extrasSel.update((ids) =>
        ids.filter((id) => this.extras().find((e) => e.id_adicional === id)?.id_insumo !== f.id_insumo),
      );
      if (this.promoSel()?.id_insumo === f.id_insumo) this.promoSel.set(null);
      return;
    }

    // En el pedido: se quitan los productos que usan ese insumo (o el propio producto)
    this.lineas.update((ls) =>
      ls.filter(
        (l) =>
          l.producto.id_item !== f.id_insumo &&
          !consumidoresDe(l.adicionales, l.promocion).some((c) => c.id_insumo === f.id_insumo),
      ),
    );
    this.guardarBorrador();
  }

  /** Tarjeta de stock: "Registrar ingreso" (HU-2.3) */
  protected irARegistrarIngreso(): void {
    this.router.navigate(['/inventario/ingresos']);
  }

  // ---------------------------------------------------------------------------
  // Registro del pedido
  // ---------------------------------------------------------------------------

  /** Cuerpo que entiende el backend para una línea */
  private dtoDe(l: LineaBorrador): DetalleCrearPedido {
    const dto: DetalleCrearPedido = { id_item: l.producto.id_item, cantidad: l.cantidad };
    if (l.adicionales?.length) {
      dto.adicionales = l.adicionales.map((a) =>
        a.cantidad > 1 ? { id_adicional: a.id_adicional, cantidad: a.cantidad } : { id_adicional: a.id_adicional },
      );
    }
    if (l.promocion) dto.id_promocion = l.promocion.id_promocion;
    if (l.notas_especiales) dto.notas_especiales = l.notas_especiales;
    return dto;
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
      detalles: this.lineas().map((l) => this.dtoDe(l)),
    };

    this.pedidos.crear(dto).subscribe({
      next: (pedido) => {
        this.enviando.set(false);
        this.lineas.set([]);
        this.borradores.limpiar(this.clave);

        // Se muestra el ticket de comanda en lugar de redirigir
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
        if (this.manejarErrorConfiguracion(e)) return;
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
    const m = (e.error as ErrorPedido | null)?.message;
    const texto = Array.isArray(m) ? m.join('. ') : m;
    switch (e.status) {
      case 400:
      case 404:
      case 409:
      case 422:
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
