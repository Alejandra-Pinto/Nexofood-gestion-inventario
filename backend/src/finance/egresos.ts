/** Catálogo de categorías de egreso (para el selector del frontend) */
export const CATEGORIAS_EGRESO = {
  'compra_proveedores': 'Compra a proveedores',
  'servicios': 'Servicios públicos',
  'arriendo': 'Arriendo',
  'nomina': 'Nómina',
  'mantenimiento': 'Mantenimiento',
  'otros': 'Otros gastos',
};

export type CategoriaEgreso = keyof typeof CATEGORIAS_EGRESO;