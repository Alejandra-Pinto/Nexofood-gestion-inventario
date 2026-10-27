/**
 * Reglas de una línea del pedido configurada (HU-3.2)
 * ------------------------------------------------------------------
 * Funciones puras (sin BD) para que se puedan probar de forma aislada:
 *
 *   SCRUM-152  Precio con adicionales:
 *              Precio unitario = precio base (o con promoción) + Σ (precio adicional × cantidad)
 *              Subtotal        = precio unitario × cantidad
 *   SCRUM-153  Precio con promoción/combo y vigencia de la promoción.
 *   SCRUM-154  Formato de la nota para cocina: "sin cebolla" -> "** SIN CEBOLLA **".
 *   Comanda    Líneas impresas: "2x CHORIPAN PAMPERO", "+ Chimi Rojo",
 *              "+ Combo con papa", "** SIN CEBOLLA **" (prototipo 14).
 *
 * El frontend replica estas mismas reglas en
 * frontend/src/app/core/utils/configuracion-linea.ts (solo para mostrar el
 * subtotal en vivo); el backend SIEMPRE recalcula el precio al guardar.
 */
import { TipoPromocion } from './entities/promocion.entity';

/** Datos de la promoción que intervienen en el precio */
export interface PromocionPrecio {
  tipo: TipoPromocion | `${TipoPromocion}`;
  precio_final?: number | null;
  recargo?: number | null;
  porcentaje_descuento?: number | string | null;
}

/** Datos de la promoción que intervienen en la vigencia */
export interface PromocionVigencia {
  estado_activo: boolean;
  vigente_desde: Date | string;
  vigente_hasta: Date | string;
}

export interface AdicionalPrecio {
  precio_unitario: number;
  cantidad: number;
}

/**
 * Precio de UNA unidad del producto con la promoción, antes de adicionales.
 *   precio_final (si viene) -> precio fijo
 *   COMBO                   -> base + recargo        (Pampero $16.000 + $3.000 = $19.000)
 *   DESCUENTO               -> base - porcentaje %   (redondeado al peso)
 */
export function precioConPromocion(
  precioBase: number,
  promo?: PromocionPrecio | null,
): number {
  const base = Math.max(0, Math.round(Number(precioBase) || 0));
  if (!promo) return base;

  if (promo.precio_final !== null && promo.precio_final !== undefined) {
    return Math.max(0, Math.round(Number(promo.precio_final)));
  }

  if (promo.tipo === TipoPromocion.COMBO) {
    return base + Math.max(0, Math.round(Number(promo.recargo) || 0));
  }

  const porcentaje = Math.min(
    100,
    Math.max(0, Number(promo.porcentaje_descuento) || 0),
  );
  return Math.round(base * (1 - porcentaje / 100));
}

/** SCRUM-152: precio de UNA unidad = precio con promoción + Σ adicionales */
export function calcularPrecioUnitario(
  precioBase: number,
  adicionales: AdicionalPrecio[] = [],
  promo?: PromocionPrecio | null,
): number {
  const extras = adicionales.reduce(
    (s, a) =>
      s +
      Math.max(0, Number(a.precio_unitario) || 0) *
        Math.max(0, Number(a.cantidad) || 0),
    0,
  );
  return precioConPromocion(precioBase, promo) + extras;
}

/** SCRUM-152: subtotal de la línea */
export function calcularSubtotal(
  precioUnitario: number,
  cantidad: number,
): number {
  return precioUnitario * cantidad;
}

/** SCRUM-155: una promoción se puede aplicar solo si está activa y dentro de su vigencia */
export function promocionVigente(
  p: PromocionVigencia,
  ahora: Date = new Date(),
): boolean {
  if (!p?.estado_activo) return false;
  const desde = new Date(p.vigente_desde).getTime();
  const hasta = new Date(p.vigente_hasta).getTime();
  const t = ahora.getTime();
  return (
    !Number.isNaN(desde) && !Number.isNaN(hasta) && desde <= t && t <= hasta
  );
}

/** SCRUM-154: limpia la nota (espacios sobrantes); vacía = null */
export function normalizarNota(nota?: string | null): string | null {
  if (typeof nota !== 'string') return null;
  const limpia = nota.replace(/\s+/g, ' ').trim();
  return limpia === '' ? null : limpia;
}

/** Mayúsculas sin tildes (las impresoras térmicas ESC/POS no siempre las soportan) */
export function textoTermico(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** SCRUM-154: "sin cebolla" -> "** SIN CEBOLLA **" (null si no hay nota) */
export function formatearNotaCocina(nota?: string | null): string | null {
  const limpia = normalizarNota(nota);
  return limpia ? `** ${textoTermico(limpia)} **` : null;
}

/** Datos mínimos de una línea para imprimir la comanda */
export interface LineaParaCocina {
  cantidad: number | string;
  item?: { nombre?: string } | null;
  notas_especiales?: string | null;
  promocion_aplicada?: string | null;
  adicionales?:
    | {
        cantidad?: number | null;
        nombre_adicional?: string | null;
        adicional?: { nombre?: string } | null;
      }[]
    | null;
}

/**
 * Líneas que se imprimen en la comanda de cocina para un producto (prototipo 14):
 *   2x CHORIPAN PAMPERO
 *     + Ciabatta
 *     + Chimi Rojo
 *     + Combo con papa
 *     ** SIN CEBOLLA **
 */
export function lineasCocina(d: LineaParaCocina): string[] {
  const nombre = textoTermico(d.item?.nombre ?? 'Producto');
  const lineas = [`${Number(d.cantidad)}x ${nombre}`];

  for (const a of d.adicionales ?? []) {
    const n = a.nombre_adicional ?? a.adicional?.nombre;
    if (!n) continue;
    const cant = Number(a.cantidad ?? 1);
    lineas.push(cant > 1 ? `+ ${n} x${cant}` : `+ ${n}`);
  }

  if (d.promocion_aplicada) lineas.push(`+ ${d.promocion_aplicada}`);

  const nota = formatearNotaCocina(d.notas_especiales);
  if (nota) lineas.push(nota);

  return lineas;
}

/**
 * Una línea es "configurada" (HU-3.2) si lleva adicionales o una promoción.
 * La modificación de pedidos (HU-3.3) no la fusiona con otras líneas del
 * mismo producto: se conserva tal cual con su precio.
 */
export function esLineaConfigurada(d: {
  adicionales?: unknown[] | null;
  promocion_aplicada?: string | null;
}): boolean {
  return (d.adicionales?.length ?? 0) > 0 || !!d.promocion_aplicada;
}

/**
 * Clave que identifica una línea configurada: el mismo producto con distintos
 * adicionales, promoción o nota son líneas DIFERENTES del pedido (y de la comanda).
 */
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
  const nota = (normalizarNota(notas) ?? '').toLowerCase();
  return `${idItem}|${ads}|${idPromocion ?? ''}|${nota}`;
}
