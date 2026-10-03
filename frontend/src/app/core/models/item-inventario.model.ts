/** Tabla categoria */
export interface Categoria {
  id_categoria: number;
  nombre: string;
}

/** PRODUCTO = se vende · INSUMO = materia prima */
export type TipoItem = 'PRODUCTO' | 'INSUMO';

/** Tabla item_inventario (productos e insumos) */
export interface ItemInventario {
  id_item: number;
  id_categoria: number;
  nombre: string;
  tipo_item: TipoItem;
  cantidad_stock: number;
  stock_minimo: number;
  costo_fabricacion: number;
  precio_venta: number;
  estado_activo: boolean;
}

/** Datos que se envían al registrar (el id y el estado los pone el backend) */
export type CrearItem = Omit<ItemInventario, 'id_item' | 'estado_activo'>;

/** true si el stock actual llegó al mínimo -> etiqueta "Bajo" */
export const tieneStockBajo = (i: ItemInventario) => i.cantidad_stock <= i.stock_minimo;
