/**
 * Reglas de los ingresos no provenientes de ventas
 * ------------------------------------------------------------------
 * HU-7.2 · SCRUM-247 Validar monto inválido
 */

/** Monto máximo de un ingreso manual (cien millones de pesos) */
export const MONTO_MAXIMO = 100_000_000;

/** Categorías de ingreso del prototipo "Registrar movimiento" */
export const CATEGORIAS_INGRESO = {
  APORTE_SOCIOS: 'Aporte de socios',
  BASE_CAJA: 'Base de caja',
  PRESTAMO: 'Préstamo',
  DEVOLUCION_PROVEEDOR: 'Devolución de proveedor',
  OTRO: 'Otro ingreso',
} as const;

export type CategoriaIngreso = keyof typeof CATEGORIAS_INGRESO;

/** Las fechas del negocio se cuentan en la hora de Colombia */
export const ZONA_HORARIA = 'America/Bogota';

/** Fecha de hoy en Colombia como AAAA-MM-DD */
export function hoyColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora);
}

/** true si la fecha no existe en el calendario (ej. 2026-02-30) */
export function fechaInexistente(valor: string): boolean {
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d;
}

/**
 * Mensaje de error del monto, o null si es válido (SCRUM-247).
 * Inválido: vacío, no numérico, decimal, cero, negativo o mayor al máximo.
 */
export function errorMonto(monto: unknown): string | null {
  if (monto === undefined || monto === null || monto === '') return 'El monto es obligatorio';
  if (typeof monto !== 'number' || Number.isNaN(monto)) return 'El monto debe ser un número';
  if (!Number.isInteger(monto)) return 'El monto debe ser un valor entero en pesos (sin decimales)';
  if (monto <= 0) return 'El monto debe ser mayor a cero';
  if (monto > MONTO_MAXIMO) return 'El monto supera el máximo permitido ($100.000.000)';
  return null;
}
