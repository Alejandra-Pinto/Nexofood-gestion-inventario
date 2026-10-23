import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Pedido } from '../../../core/models/pedido.model';

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
  
  // Evento para avisarle al padre que se debe cerrar
  @Output() cerrar = new EventEmitter<void>();

  imprimir() {
    window.print(); 
  }

  cerrarModal() {
    this.cerrar.emit(); // Avisa al padre
  }
}