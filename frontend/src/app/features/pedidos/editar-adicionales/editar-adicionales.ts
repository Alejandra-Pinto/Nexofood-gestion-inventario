/**
 * Componente: EditarAdicionales (modal)
 * ------------------------------------------------------------------
 * Editar adicionales y formato de una línea que YA está en el pedido.
 * Mismas opciones que el paso 3 de "Nuevo choripán" (prototipo step-3):
 *   - Pan (paso 2), aderezo (chips), formato Individual / Combo y adicionales (checkbox).
 *   - Abre con lo que la línea tiene hoy; el precio unitario y el subtotal se
 *     recalculan en vivo con Signals.
 *   - Si un insumo no alcanza, muestra la tarjeta del prototipo 21 y no lo aplica.
 *
 * El backend vuelve a validar todo al guardar la modificación del pedido.
 */
import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { OpcionAdicional, OpcionPromocion, OpcionesPedido } from '../../../core/models/pedido.model';
import {
  ConsumidorInsumo,
  FaltanteStock,
  LineaConsumo,
  calcularPrecioUnitario,
  faltanteStock,
  precioConPromocion,
} from '../../../core/utils/configuracion-linea';
import { AlertaStock } from '../../../shared/components/alerta-stock/alerta-stock';

/** Adicional que la línea tiene hoy */
export interface AdicionalLinea {
  id_adicional: number;
  cantidad: number;
  nombre: string;
}

/** Producto de la línea (para precio y categoría) */
export interface ProductoLinea {
  nombre: string;
  precio_venta: number;
  id_categoria: number | null;
}

/** Adicional elegido al confirmar */
export interface AdicionalElegidoLinea extends AdicionalLinea {
  precio: number;
  /** Insumo que consume (null si no se conoce o no controla stock) */
  consumidor: ConsumidorInsumo | null;
}

export interface ResultadoAdicionales {
  adicionales: AdicionalElegidoLinea[];
  /** Combo/promoción elegido (null = Individual) */
  promocion: OpcionPromocion | null;
  /** La línea conserva su combo actual aunque ya no esté vigente */
  mantenerPromocion: boolean;
  precioUnitario: number;
}

@Component({
  selector: 'app-editar-adicionales',
  imports: [CurrencyPipe, AlertaStock],
  templateUrl: './editar-adicionales.html',
  styleUrl: './editar-adicionales.scss',
})
export class EditarAdicionales implements OnInit {
  readonly producto = input.required<ProductoLinea>();
  readonly opciones = input.required<OpcionesPedido>();
  readonly seleccionInicial = input<AdicionalLinea[]>([]);
  /** Nombre del combo que la línea tiene hoy (null = Individual) */
  readonly promocionInicial = input<string | null>(null);
  readonly cantidad = input(1);
  /** Lo que consumen las demás líneas del pedido (para el stock de insumos) */
  readonly otrasLineas = input<LineaConsumo[]>([]);
  readonly puedeRegistrarIngreso = input(false);

  readonly aplicar = output<ResultadoAdicionales>();
  readonly cerrar = output<void>();

  protected panSel = signal<OpcionAdicional | null>(null);
  protected aderezoSel = signal<OpcionAdicional | null>(null);
  protected extrasSel = signal<number[]>([]);
  protected promoSel = signal<OpcionPromocion | null>(null);
  /** Combo actual que ya no está vigente: se puede conservar, no volver a elegir */
  protected promoActualNoVigente = signal<string | null>(null);
  protected mantenerPromo = signal(false);
  /** Adicionales que la línea tiene pero ya no están en el catálogo activo */
  protected noDisponibles = signal<AdicionalLinea[]>([]);
  /** Cantidad de cada adicional que traía la línea (x2) */
  private cantidades = new Map<number, number>();

  protected alertaStock = signal<FaltanteStock | null>(null);

  private aplica = (o: { id_categoria: number | null }) => {
    const cat = this.producto().id_categoria;
    return o.id_categoria === null || cat === null || o.id_categoria === cat;
  };

  protected panes = computed(() => this.opciones().adicionales.filter((a) => a.tipo === 'PAN' && this.aplica(a)));
  protected aderezos = computed(() =>
    this.opciones().adicionales.filter((a) => a.tipo === 'ADEREZO' && this.aplica(a)),
  );
  protected extras = computed(() => this.opciones().adicionales.filter((a) => a.tipo === 'EXTRA' && this.aplica(a)));
  protected promociones = computed(() => this.opciones().promociones.filter((p) => this.aplica(p)));

  /** Adicionales elegidos (en el orden pan, aderezo, extras, no disponibles) */
  protected seleccion = computed<AdicionalElegidoLinea[]>(() => {
    const extras = this.extras().filter((e) => this.extrasSel().includes(e.id_adicional));
    const activos = [this.panSel(), this.aderezoSel(), ...extras]
      .filter((a): a is OpcionAdicional => a !== null)
      .map((a) => {
        const cantidad = this.cantidades.get(a.id_adicional) ?? 1;
        return {
          id_adicional: a.id_adicional,
          cantidad,
          nombre: a.nombre,
          precio: a.precio_adicional,
          consumidor: { ...a, cantidad },
        };
      });
    const viejos = this.noDisponibles().map((a) => ({ ...a, precio: 0, consumidor: null }));
    return [...activos, ...viejos];
  });

  /** Precio de UNA unidad con la configuración elegida (mismas reglas del backend) */
  protected precioUnitario = computed(() =>
    calcularPrecioUnitario(
      this.producto().precio_venta,
      this.seleccion().map((a) => ({ precio_unitario: a.precio, cantidad: a.cantidad })),
      this.mantenerPromo() ? null : this.promoSel(),
    ),
  );
  protected subtotal = computed(() => this.precioUnitario() * this.cantidad());

  ngOnInit(): void {
    // Cargar lo que la línea tiene hoy
    const viejos: AdicionalLinea[] = [];
    const extras: number[] = [];
    for (const a of this.seleccionInicial()) {
      this.cantidades.set(a.id_adicional, a.cantidad);
      const op = this.opciones().adicionales.find((x) => x.id_adicional === a.id_adicional);
      if (!op) viejos.push(a);
      else if (op.tipo === 'PAN' && !this.panSel()) this.panSel.set(op);
      else if (op.tipo === 'ADEREZO' && !this.aderezoSel()) this.aderezoSel.set(op);
      else extras.push(op.id_adicional);
    }
    this.extrasSel.set(extras);
    this.noDisponibles.set(viejos);

    const nombre = this.promocionInicial();
    if (nombre) {
      const promo = this.opciones().promociones.find((p) => p.nombre === nombre) ?? null;
      if (promo) this.promoSel.set(promo);
      else {
        this.promoActualNoVigente.set(nombre);
        this.mantenerPromo.set(true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Selección
  // ---------------------------------------------------------------------------

  /** Pan: selección única; tocar el elegido lo quita */
  protected elegirPan(a: OpcionAdicional): void {
    if (this.panSel()?.id_adicional === a.id_adicional) {
      this.panSel.set(null);
      return;
    }
    if (this.bloqueado({ pan: a })) return;
    this.panSel.set(a);
  }

  protected elegirAderezo(a: OpcionAdicional): void {
    if (this.aderezoSel()?.id_adicional === a.id_adicional) {
      this.aderezoSel.set(null);
      return;
    }
    if (this.bloqueado({ aderezo: a })) return;
    this.aderezoSel.set(a);
  }

  protected alternarExtra(a: OpcionAdicional): void {
    const marcados = this.extrasSel();
    if (marcados.includes(a.id_adicional)) {
      this.extrasSel.set(marcados.filter((id) => id !== a.id_adicional));
      return;
    }
    if (this.bloqueado({ extras: [...marcados, a.id_adicional] })) return;
    this.extrasSel.set([...marcados, a.id_adicional]);
  }

  protected extraMarcado(a: OpcionAdicional): boolean {
    return this.extrasSel().includes(a.id_adicional);
  }

  /** Formato: Individual (null), un combo vigente o conservar el actual */
  protected elegirFormato(promo: OpcionPromocion | null): void {
    if (promo && this.bloqueado({ promo })) return;
    this.mantenerPromo.set(false);
    this.promoSel.set(promo);
  }

  protected conservarFormatoActual(): void {
    this.alertaStock.set(null);
    this.promoSel.set(null);
    this.mantenerPromo.set(true);
  }

  protected formatoIndividualActivo = computed(() => !this.mantenerPromo() && !this.promoSel());

  protected precioFormato(promo: OpcionPromocion | null): number {
    return precioConPromocion(this.producto().precio_venta, promo);
  }

  protected quitarNoDisponible(id: number): void {
    this.noDisponibles.update((ls) => ls.filter((a) => a.id_adicional !== id));
  }

  /** ¿Alcanza el stock si se aplica este cambio? Si no, tarjeta del prototipo 21 */
  private bloqueado(cambio: {
    pan?: OpcionAdicional;
    aderezo?: OpcionAdicional;
    extras?: number[];
    promo?: OpcionPromocion;
  }): boolean {
    const extrasIds = cambio.extras ?? this.extrasSel();
    const consumidores: ConsumidorInsumo[] = [
      cambio.pan ?? this.panSel(),
      cambio.aderezo ?? this.aderezoSel(),
      ...this.extras().filter((e) => extrasIds.includes(e.id_adicional)),
    ]
      .filter((a): a is OpcionAdicional => a !== null)
      .map((a) => ({ ...a, cantidad: this.cantidades.get(a.id_adicional) ?? 1 }));
    const promo = cambio.promo ?? (this.mantenerPromo() ? null : this.promoSel());
    if (promo) consumidores.push({ ...promo, cantidad: 1 });

    const faltante = faltanteStock([...this.otrasLineas(), { cantidad: this.cantidad(), consumidores }]);
    this.alertaStock.set(faltante);
    return faltante !== null;
  }

  /** Tarjeta de stock: "Quitar producto" -> se quita lo que usa ese insumo */
  protected quitarSinStock(): void {
    const f = this.alertaStock();
    this.alertaStock.set(null);
    if (!f) return;
    if (this.panSel()?.id_insumo === f.id_insumo) this.panSel.set(null);
    if (this.aderezoSel()?.id_insumo === f.id_insumo) this.aderezoSel.set(null);
    this.extrasSel.update((ids) =>
      ids.filter((id) => this.extras().find((e) => e.id_adicional === id)?.id_insumo !== f.id_insumo),
    );
    if (this.promoSel()?.id_insumo === f.id_insumo) this.promoSel.set(null);
  }

  protected confirmar(): void {
    this.aplicar.emit({
      adicionales: this.seleccion(),
      promocion: this.mantenerPromo() ? null : this.promoSel(),
      mantenerPromocion: this.mantenerPromo(),
      precioUnitario: this.precioUnitario(),
    });
  }
}
