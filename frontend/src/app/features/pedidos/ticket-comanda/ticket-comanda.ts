import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetallePedido, Pedido } from '../../../core/models/pedido.model';
import { lineasCocina } from '../../../core/utils/configuracion-linea';

export interface ItemTicketAdicional {
  cantidad: number;
  nombre: string;
  notas_especiales?: string;
  promocion_aplicada?: string;
}

@Component({
  selector: 'app-ticket-comanda',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-comanda.html',
  styleUrl: './ticket-comanda.scss'
})
export class TicketComandaComponent {
  @Input() pedido!: Pedido;
  @Input() visible: boolean = false;
  @Input() titulo: string = 'COMANDA DE COCINA';
  @Input() itemsAdicionales?: ItemTicketAdicional[];
  @Input() imprimiendo: boolean = false;
  
  // Evento para avisarle al padre que se debe cerrar
  @Output() cerrar = new EventEmitter<void>();

  // Evento para solicitar la reimpresión silenciosa a través de Electron
  @Output() reimprimir = new EventEmitter<void>();

  solicitarReimpresion() {
    this.reimprimir.emit();
  }

  cerrarModal() {
    this.cerrar.emit();
  }

  /**
   * HU-3.2 · SCRUM-154: líneas impresas de un producto (prototipo 14):
   *   2x CHORIPAN PAMPERO / + Chimi Rojo / + Combo con papa / ** SIN CEBOLLA **
   */
  lineasDetalle(d: DetallePedido): string[] {
    return lineasCocina(d);
  }

  lineasAdicional(item: ItemTicketAdicional): string[] {
    return lineasCocina({
      cantidad: item.cantidad,
      item: { nombre: item.nombre },
      notas_especiales: item.notas_especiales,
      promocion_aplicada: item.promocion_aplicada,
    });
  }

  /** "+ ..." = adicional o combo · "** ... **" = nota de cocina resaltada */
  tipoLinea(texto: string, i: number): 'producto' | 'adicional' | 'nota' {
    if (i === 0) return 'producto';
    return texto.startsWith('**') ? 'nota' : 'adicional';
  }
}
