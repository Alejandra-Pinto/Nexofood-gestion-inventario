/**
 * Modelos de datos para Reportes
 * HU-6.1 · Reporte de inventario consolidado
 */

export type EstadoStock = 'NORMAL' | 'BAJO' | 'AGOTADO';

export interface ItemReporteInventario {
  id_item: number;
  nombre: string;
  tipo_item: 'PRODUCTO' | 'INSUMO';
  id_categoria: number;
  categoria: string;
  cantidad_stock: number;
  stock_minimo: number;
  precio_venta: number;
  estado_activo: boolean;
  estado_stock: EstadoStock;
}

export interface ReporteInventarioResultado {
  resumen: {
    total_items: number;
    total_productos: number;
    total_insumos: number;
    items_bajo_stock: number;
    items_agotados: number;
  };
  items: ItemReporteInventario[];
  fecha_generacion: string;
}

export type ResumenInventarioReporte = ReporteInventarioResultado['resumen'];
