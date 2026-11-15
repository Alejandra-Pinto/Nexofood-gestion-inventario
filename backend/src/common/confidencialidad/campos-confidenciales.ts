/**
 * HU-2.2 · Confidencialidad del costo de fabricación (SCRUM-193)
 * ------------------------------------------------------------------
 * Reglas y utilidades para que el costo de fabricación de productos e
 * insumos NUNCA salga en una respuesta HTTP hacia un rol que no sea
 * Administrador.
 *
 * Por qué un filtro sobre la respuesta y no `@Exclude()` de class-transformer:
 *   - Muchos servicios devuelven objetos planos o copias (`{ ...item }`,
 *     `{ pedido, movimiento, cambio }`, mapeos a DTO). `@Exclude` solo se
 *     aplica a INSTANCIAS de la clase decorada: un `{ ...item }` pierde el
 *     prototipo y el campo se colaría sin aviso.
 *   - Este filtro trabaja por NOMBRE de propiedad, a cualquier profundidad,
 *     sin importar si el objeto es una entidad, un plano o un array.
 *
 * LISTA BLANCA: solo los roles de ROLES_CON_ACCESO_A_COSTOS ven el costo.
 * Un rol nuevo (p. ej. "Cocinero") o un usuario sin rol NO lo ve por defecto.
 */
import { RolUsuario } from '../../users/entities/user.entity';

/** Campos que se ocultan SIEMPRE a los roles sin acceso, en cualquier endpoint */
export const CAMPOS_COSTO_CONFIDENCIALES: readonly string[] = ['costo_fabricacion'];

/** Únicos roles que pueden ver costos. Lista blanca: lo que no está aquí no ve. */
export const ROLES_CON_ACCESO_A_COSTOS: ReadonlySet<string> = new Set<string>([
  RolUsuario.ADMINISTRADOR,
]);

/** true solo si el usuario existe y su rol está en la lista blanca */
export function puedeVerCostos(usuario?: { rol?: unknown } | null): boolean {
  return typeof usuario?.rol === 'string' && ROLES_CON_ACCESO_A_COSTOS.has(usuario.rol);
}

/**
 * Devuelve una COPIA de `valor` sin las propiedades listadas en `campos`,
 * a cualquier profundidad (objetos anidados y arrays).
 *
 * - Respeta la semántica de JSON.stringify: usa `toJSON()` si existe
 *   (Date -> string) y solo recorre propiedades propias enumerables, que es
 *   exactamente lo que termina en el body de la respuesta.
 * - No muta el original (las entidades pueden seguir usándose en memoria).
 * - Tolera referencias circulares: un objeto ya visitado se reutiliza.
 */
export function quitarCampos<T>(
  valor: T,
  campos: ReadonlySet<string>,
  vistos: WeakMap<object, unknown> = new WeakMap(),
): T {
  if (valor === null || typeof valor !== 'object') return valor;
  if (Buffer.isBuffer(valor) || ArrayBuffer.isView(valor)) return valor;

  const obj = valor as unknown as Record<string, unknown> & { toJSON?: () => unknown };
  if (vistos.has(obj)) return vistos.get(obj) as T;

  if (typeof obj.toJSON === 'function') {
    const json = obj.toJSON();
    if (json !== obj) return quitarCampos(json, campos, vistos) as T;
  }

  if (Array.isArray(obj)) {
    const copia: unknown[] = [];
    vistos.set(obj, copia);
    for (const elemento of obj) copia.push(quitarCampos(elemento, campos, vistos));
    return copia as T;
  }

  const copia: Record<string, unknown> = {};
  vistos.set(obj, copia);
  for (const clave of Object.keys(obj)) {
    if (campos.has(clave)) continue;
    copia[clave] = quitarCampos(obj[clave], campos, vistos);
  }
  return copia as T;
}
