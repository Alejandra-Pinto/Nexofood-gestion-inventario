export type EstadoPedido = 
  | 'Pendiente' 
  | 'En preparación' 
  | 'Listo' 
  | 'Entregado' 
  | 'Pagado' 
  | 'Anulado';

export interface DetallePedido {
  id_detalle: number;
  id_pedido: number;
  id_item: number;
  cantidad: number;
  precio_unitario: number;
  notas_especiales: string | null;
  promocion_aplicada: string | null;
  item?: {
    nombre: string;
  };
}

export interface Pedido {
  id_pedido: number;
  id_mesero: number;
  numero_mesa: number | null;
  nombre_cliente: string | null;
  fecha_hora: string;
  estado_pedido: EstadoPedido;
  total_calculado: number;
  detalles?: DetallePedido[];
  mesero?: {
    nombre: string;
  };
}