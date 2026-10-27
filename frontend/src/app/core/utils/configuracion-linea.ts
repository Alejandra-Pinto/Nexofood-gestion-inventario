/**
 * Reglas de una línea configurada del pedido (HU-3.2)
 * ------------------------------------------------------------------
 * Mismas reglas que backend/src/orders/configuracion-linea.ts. Aquí solo se usan
 * para mostrar el subtotal en vivo y avisar de stock; el backend SIEMPRE
 * recalcula el precio al cotizar y al registrar el pedido.
 *
 *   SCRUM-152  Precio unitario = precio base (o con promoción) + Σ adicionales
 *              Subtotal        = precio unitario × cantidad
 *   SCRUM-153  Combo: base + recargo (Individual $16.000 -> Combo $19.000)
 *   SCRUM-154  Nota para cocina: "sin cebolla" -> "** SIN CEBOLLA **"
 *   SCRUM-155  Stock de los insumos que consumen adicionales y combos
 */
import { OpcionPromocion } from '../models/pedido.model';

/** SCRUM-154: opciones rápidas de nota para cocina */
export const NOTAS_RAPIDAS = ['Sin cebolla', 'Sin picante', 'Bien cocido', 'Salsa aparte', 'Sin aderezo'] as const;

/** Largo máximo de la nota (igual que el backend) */
export const MAX_NOTA = 255;

type PromocionPrecio = Pick<OpcionPromocion, 'tipo' | 'precio_final' | 'recargo' | 'porcentaje_descuento'>;

/** Precio de UNA unidad con la promoción, antes de adicionales */
export function precioConPromocion(precioBase: number, promo?: PromocionPrecio | null): number {
  const base = Math.max(0, Math.round(Number(precioBase) || 0));
  if (!promo) return base;
  if (promo.precio_final !== null && promo.precio_final !== undefined) {
    return Math.max(0, Math.round(Number(promo.precio_final)));
  }
  if (promo.tipo === 'COMBO') return base + Math.max(0, Math.round(Number(promo.recargo) || 0));
  const porcentaje = Math.min(100, Math.max(0, Number(promo.porcentaje_descuento) || 0));
  return Math.round(base * (1 - porcentaje / 100));
}

/** SCRUM-152: precio de UNA unidad = precio con promoción + Σ adicionales */
export function calcularPrecioUnitario(
  precioBase: number,
  adicionales: { precio_unitario: number; cantidad: number }[] = [],
  promo?: PromocionPrecio | null,
): number {
  const extras = adicionales.reduce(
    (s, a) => s + Math.max(0, Number(a.precio_unitario) || 0) * Math.max(0, Number(a.cantidad) || 0),
    0,
  );
  return precioConPromocion(precioBase, promo) + extras;
}

export function calcularSubtotal(precioUnitario: number, cantidad: number): number {
  return precioUnitario * cantidad;
}

/** Limpia espacios sobrantes; vacía = null */
export function normalizarNota(nota?: string | null): string | null {
  if (typeof nota !== 'string') return null;
  const limpia = nota.replace(/\s+/g, ' ').trim();
  return limpia === '' ? null : limpia;
}

/** Une las notas rápidas elegidas y el texto libre: "Sin cebolla, salsa aparte" */
export function componerNota(rapidas: readonly string[], libre?: string | null): string | null {
  return normalizarNota([...rapidas, libre ?? ''].map((t) => t.trim()).filter(Boolean).join(', '));
}

/** Mayúsculas sin tildes (como sale en la impresora térmica) */
export function textoTermico(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** SCRUM-154: "sin cebolla" -> "** SIN CEBOLLA **" */
export function formatearNotaCocina(nota?: string | null): string | null {
  const limpia = normalizarNota(nota);
  return limpia ? `** ${textoTermico(limpia)} **` : null;
}

/** Datos mínimos de una línea para la comanda */
export interface LineaParaCocina {
  cantidad: number;
  item?: { nombre?: string } | null;
  notas_especiales?: string | null;
  promocion_aplicada?: string | null;
  adicionales?: { cantidad?: number | null; nombre_adicional?: string | null; nombre?: string | null }[] | null;
}

/**
 * Líneas de la comanda (prototipo 14):
 *   2x CHORIPAN PAMPERO / + Chimi Rojo / + Combo con papa / ** SIN CEBOLLA **
 */
export function lineasCocina(d: LineaParaCocina): string[] {
  const lineas = [`${Number(d.cantidad)}x ${textoTermico(d.item?.nombre ?? 'Producto')}`];
  for (const a of d.adicionales ?? []) {
    const n = a.nombre_adicional ?? a.nombre;
    if (!n) continue;
    const cant = Number(a.cantidad ?? 1);
    lineas.push(cant > 1 ? `+ ${n} x${cant}` : `+ ${n}`);
  }
  if (d.promocion_aplicada) lineas.push(`+ ${d.promocion_aplicada}`);
  const nota = formatearNotaCocina(d.notas_especiales);
  if (nota) lineas.push(nota);
  return lineas;
}

/** Línea con adicionales o promoción (no se edita como línea simple en HU-3.3) */
export function esLineaConfigurada(d: { adicionales?: unknown[] | null; promocion_aplicada?: string | null }): boolean {
  return (d.adicionales?.length ?? 0) > 0 || !!d.promocion_aplicada;
}

/** Misma clave que el backend: mismo producto + adicionales + promo + nota = misma línea */
export function claveLinea(
  idItem: number,
  adicionales: { id_adicional: number; cantidad?: number }[] = [],
  idPromocion?: number | null,
  notas?: string | null,
): string {
  const ads = [...adicionales]
    .map((a) => `${a.id_adicional}x${a.cantidad ?? 1}`)
    .sort()
    .join(',');
  return `${idItem}|${ads}|${idPromocion ?? ''}|${(normalizarNota(notas) ?? '').toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// SCRUM-155 · Stock de insumos (prototipo 21 "Stock insuficiente")
// ---------------------------------------------------------------------------

/** Algo que consume un insumo: un adicional o el combo */
export interface ConsumidorInsumo {
  nombre: string;
  id_insumo: number | null;
  insumo: string | null;
  cantidad_insumo: number;
  stock_disponible: number | null;
  /** Unidades del adicional por producto (el combo siempre 1) */
  cantidad?: number;
}

/** Una línea (actual o candidata) con lo que consume */
export interface LineaConsumo {
  cantidad: number;
  consumidores: ConsumidorInsumo[];
}

export interface FaltanteStock {
  id_insumo: number;
  insumo: string;
  disponible: number;
  requerido: number;
  /** Adicionales o combos que usan ese insumo */
  usado_por: string[];
}

/**
 * Suma lo que piden TODAS las líneas por insumo y devuelve el primero que no
 * alcanza (null si todo alcanza). Los que no controlan stock se ignoran.
 */
export function faltanteStock(lineas: LineaConsumo[]): FaltanteStock | null {
  const porInsumo = new Map<number, FaltanteStock>();
  for (const l of lineas) {
    for (const c of l.consumidores) {
      if (c.id_insumo === null || c.stock_disponible === null) continue;
      const actual = porInsumo.get(c.id_insumo) ?? {
        id_insumo: c.id_insumo,
        insumo: c.insumo ?? c.nombre,
        disponible: c.stock_disponible,
        requerido: 0,
        usado_por: [],
      };
      actual.requerido += Number(c.cantidad_insumo) * (c.cantidad ?? 1) * l.cantidad;
      if (!actual.usado_por.includes(c.nombre)) actual.usado_por.push(c.nombre);
      porInsumo.set(c.id_insumo, actual);
    }
  }
  for (const f of porInsumo.values()) {
    if (f.requerido > f.disponible) return { ...f, requerido: Math.round(f.requerido * 1000) / 1000 };
  }
  return null;
}
