/**
 * Cambios de un pedido para la comanda de cocina (HU-4.3 · SCRUM-182)
 * ------------------------------------------------------------------
 * Funciones puras (sin BD): comparan cómo estaba el pedido y cómo queda tras
 * la modificación, y describen cada cambio con un texto para cocina y para el
 * aviso "Pedido modificado" del prototipo 14:
 *
 *   AGREGADO           "Se agregó 1x Cerveza"
 *   QUITADO            "Se quitó 2x Choripán Azteca"
 *   CANTIDAD_AUMENTADA "Se agregó 1x Cerveza (ahora 3)"
 *   CANTIDAD_REDUCIDA  "Se quitó 1x Cerveza (ahora 1)"
 *   NOTA               "Se modificó la nota de Choripán Pampero: "sin cebolla""
 *   ADICIONAL_AGREGADO "Se agregó adicional + Queso fundido en Choripán Pampero"
 *   ADICIONAL_QUITADO  "Se quitó adicional + Chimi Rojo en Choripán Pampero"
 *   FORMATO            "Se cambió a formato Combo con papa en Choripán Pampero"
 *
 * La hora ("a las 12:48") la agrega el frontend con fecha_creacion de la
 * comanda, en la zona horaria del local.
 */
import { normalizarNota } from './configuracion-linea';

export type TipoCambio =
  | 'AGREGADO'
  | 'QUITADO'
  | 'CANTIDAD_AUMENTADA'
  | 'CANTIDAD_REDUCIDA'
  | 'NOTA'
  | 'ADICIONAL_AGREGADO'
  | 'ADICIONAL_QUITADO'
  | 'FORMATO';

export interface CambioComanda {
  tipo: TipoCambio;
  id_item: number;
  /** Línea con adicionales o combo a la que se refiere el cambio */
  id_detalle?: number;
  producto: string;
  /** Unidades agregadas o quitadas (no aplica a NOTA) */
  cantidad?: number;
  antes?: number | string | null;
  despues?: number | string | null;
  texto: string;
}

/**
 * Estado de una línea del pedido para comparar antes/después:
 *   - líneas simples: agrupadas por producto (clave "item:<id_item>")
 *   - líneas con adicionales o combo: una por fila (clave "det:<id_detalle>"),
 *     con producto = "choripan clasico (+ Orégano, + Combo con papa)"
 */
export interface LineaResumen {
  id_item: number;
  producto: string;
  cantidad: number;
  nota: string | null;
  clave?: string;
  id_detalle?: number;
  configurada?: boolean;
  /** Líneas configuradas: nombre del producto sin adicionales ("Choripán Pampero") */
  nombre?: string;
  /** Líneas configuradas: adicionales ("Queso fundido", "Chimi Rojo x2") */
  adicionales?: string[];
  /** Líneas configuradas: promoción/combo aplicado (null = Individual) */
  formato?: string | null;
}

/** Nombre de cada adicional de la línea ("Chimi Rojo", "Queso fundido x2") */
const nombresAdicionales = (
  adicionales?: { nombre_adicional?: string | null; cantidad?: number | null }[] | null,
): string[] =>
  (adicionales ?? [])
    .filter((a) => a.nombre_adicional)
    .map((a) => `${a.nombre_adicional}${Number(a.cantidad ?? 1) > 1 ? ` x${a.cantidad}` : ''}`);

const claveDe = (l: LineaResumen) => l.clave ?? `item:${l.id_item}`;

/** "choripan clasico (+ Orégano, + Combo con papa)" */
export function etiquetaLineaConfigurada(d: {
  item?: { nombre?: string } | null;
  id_item: number;
  promocion_aplicada?: string | null;
  adicionales?: { nombre_adicional?: string | null; cantidad?: number | null }[] | null;
}): string {
  const extras = [
    ...nombresAdicionales(d.adicionales).map((n) => `+ ${n}`),
    ...(d.promocion_aplicada ? [`+ ${d.promocion_aplicada}`] : []),
  ];
  const nombre = d.item?.nombre ?? `Producto #${d.id_item}`;
  return extras.length ? `${nombre} (${extras.join(', ')})` : nombre;
}

/** Resumen de una línea con adicionales o combo (se compara por id_detalle) */
export function resumirLineaConfigurada(d: {
  id_detalle: number;
  id_item: number;
  cantidad: number | string;
  notas_especiales?: string | null;
  item?: { nombre?: string } | null;
  promocion_aplicada?: string | null;
  adicionales?: { nombre_adicional?: string | null; cantidad?: number | null }[] | null;
}): LineaResumen {
  return {
    clave: `det:${d.id_detalle}`,
    id_detalle: d.id_detalle,
    id_item: d.id_item,
    producto: etiquetaLineaConfigurada(d),
    cantidad: Number(d.cantidad),
    nota: normalizarNota(d.notas_especiales),
    configurada: true,
    nombre: d.item?.nombre ?? `Producto #${d.id_item}`,
    adicionales: nombresAdicionales(d.adicionales),
    formato: d.promocion_aplicada ?? null,
  };
}

/** Agrupa filas de detalle por producto: suma cantidades y une notas distintas con "; " */
export function resumirLineas(
  filas: { id_item: number; cantidad: number | string; notas_especiales?: string | null; item?: { nombre?: string } | null }[],
): LineaResumen[] {
  const porItem = new Map<number, LineaResumen>();
  for (const f of filas) {
    const nota = normalizarNota(f.notas_especiales);
    const actual = porItem.get(f.id_item);
    if (actual) {
      actual.cantidad += Number(f.cantidad);
      if (nota && !(actual.nota ?? '').split('; ').includes(nota)) {
        actual.nota = actual.nota ? `${actual.nota}; ${nota}` : nota;
      }
    } else {
      porItem.set(f.id_item, {
        id_item: f.id_item,
        producto: f.item?.nombre ?? `Producto #${f.id_item}`,
        cantidad: Number(f.cantidad),
        nota,
      });
    }
  }
  return [...porItem.values()];
}

const mismaNota = (a: string | null, b: string | null) =>
  (normalizarNota(a) ?? '').toLowerCase() === (normalizarNota(b) ?? '').toLowerCase();

/**
 * Diferencias entre el pedido antes y después de la modificación.
 * Primero los productos que quedan (en su orden), luego los que se quitaron.
 */
export function calcularCambios(antes: LineaResumen[], despues: LineaResumen[]): CambioComanda[] {
  const cambios: CambioComanda[] = [];
  const previo = new Map(antes.map((l) => [claveDe(l), l]));
  const final = new Map(despues.map((l) => [claveDe(l), l]));
  const ref = (l: LineaResumen) => ({ id_item: l.id_item, ...(l.id_detalle ? { id_detalle: l.id_detalle } : {}) });

  for (const d of despues) {
    const a = previo.get(claveDe(d));
    const nota = normalizarNota(d.nota);

    if (!a) {
      cambios.push({
        tipo: 'AGREGADO',
        ...ref(d),
        producto: d.producto,
        cantidad: d.cantidad,
        antes: 0,
        despues: d.cantidad,
        texto: `Se agregó ${d.cantidad}x ${d.producto}${nota ? ` (${nota})` : ''}`,
      });
      continue;
    }

    // Adicionales y formato de una línea configurada (misma id_detalle)
    if (a.configurada || d.configurada) {
      const nombre = d.nombre ?? a.nombre ?? d.producto;
      const formatoAntes = a.formato ?? null;
      const formatoDespues = d.formato ?? null;
      if (formatoAntes !== formatoDespues) {
        cambios.push({
          tipo: 'FORMATO',
          ...ref(d),
          producto: nombre,
          antes: formatoAntes ?? 'Individual',
          despues: formatoDespues ?? 'Individual',
          texto: `Se cambió a formato ${formatoDespues ?? 'Individual'} en ${nombre}`,
        });
      }
      const previos = a.adicionales ?? [];
      const nuevos = d.adicionales ?? [];
      for (const ad of nuevos.filter((x) => !previos.includes(x))) {
        cambios.push({
          tipo: 'ADICIONAL_AGREGADO',
          ...ref(d),
          producto: nombre,
          despues: ad,
          texto: `Se agregó adicional + ${ad} en ${nombre}`,
        });
      }
      for (const ad of previos.filter((x) => !nuevos.includes(x))) {
        cambios.push({
          tipo: 'ADICIONAL_QUITADO',
          ...ref(d),
          producto: nombre,
          antes: ad,
          texto: `Se quitó adicional + ${ad} en ${nombre}`,
        });
      }
    }

    if (d.cantidad > a.cantidad) {
      const n = d.cantidad - a.cantidad;
      cambios.push({
        tipo: 'CANTIDAD_AUMENTADA',
        ...ref(d),
        producto: d.producto,
        cantidad: n,
        antes: a.cantidad,
        despues: d.cantidad,
        texto: d.configurada
          ? `Se incrementó ${n}x ${d.producto} (ahora ${d.cantidad})`
          : `Se agregó ${n}x ${d.producto} (ahora ${d.cantidad})`,
      });
    } else if (d.cantidad < a.cantidad) {
      const n = a.cantidad - d.cantidad;
      cambios.push({
        tipo: 'CANTIDAD_REDUCIDA',
        ...ref(d),
        producto: d.producto,
        cantidad: n,
        antes: a.cantidad,
        despues: d.cantidad,
        texto: `Se quitó ${n}x ${d.producto} (ahora ${d.cantidad})`,
      });
    }

    if (!mismaNota(a.nota, d.nota)) {
      const anterior = normalizarNota(a.nota);
      cambios.push({
        tipo: 'NOTA',
        ...ref(d),
        producto: d.producto,
        antes: anterior,
        despues: nota,
        texto: !nota
          ? `Se quitó la nota de ${d.producto}`
          : anterior
            ? `Se modificó la nota de ${d.producto}: "${nota}"`
            : `Se agregó la nota "${nota}" en ${d.producto}`,
      });
    }
  }

  for (const a of antes) {
    if (final.has(claveDe(a))) continue;
    cambios.push({
      tipo: 'QUITADO',
      ...ref(a),
      producto: a.producto,
      cantidad: a.cantidad,
      antes: a.cantidad,
      despues: 0,
      texto: `Se quitó ${a.cantidad}x ${a.producto}`,
    });
  }

  return cambios;
}
