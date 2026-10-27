/**
 * HU-4.3 · SCRUM-182 Texto del aviso "Pedido modificado" (prototipo 14)
 * ------------------------------------------------------------------
 *   ["Se agregó 1x Cerveza"]                        -> "Se agregó 1x Cerveza"
 *   ["Se agregó 1x Cerveza", "Se quitó la nota…"]   -> "Se agregó 1x Cerveza y se quitó la nota…"
 *   3 o más                                         -> "A, b y c"
 */
export function resumirCambios(textos: string[]): string {
  const partes = textos.map((t) => t.trim()).filter(Boolean);
  if (partes.length === 0) return 'Se modificó el pedido';
  const [primero, ...resto] = partes;
  const siguientes = resto.map((t) => t.charAt(0).toLowerCase() + t.slice(1));
  if (siguientes.length === 0) return primero;
  const ultimo = siguientes.pop()!;
  return [primero, ...siguientes].join(', ') + ' y ' + ultimo;
}
