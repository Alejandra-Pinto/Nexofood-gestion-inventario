import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { PedidosService } from '../../../core/services/pedidos.service';
import { Pedido, EstadoPedido } from '../../../core/models/pedido.model';
import { ToastService } from '../../../core/services/toast.service';
import { TicketComandaComponent } from '../ticket-comanda/ticket-comanda';

@Component({
  selector: 'app-pedido-detalle',
  standalone: true,
  imports: [CommonModule, TicketComandaComponent],
  templateUrl: './pedido-detalle.html',
  styleUrl: './pedido-detalle.scss'
})
export class PedidoDetalleComponent implements OnInit {
  private pedidosService = inject(PedidosService);
  private toastService = inject(ToastService);

  public pedido = signal<Pedido | null>(null);
  public isLoading = signal<boolean>(false);
  public mostrarTicket = signal<boolean>(false);

  ngOnInit() {
    this.cargarPedido(1);
  }

  cargarPedido(id: number) {
    this.pedidosService.obtener(id).subscribe({
      next: (data: Pedido) => this.pedido.set(data),
      error: (err: HttpErrorResponse) => this.toastService.error('Error al cargar el pedido.')
    });
  }

  cambiarEstado(nuevoEstado: EstadoPedido) {
    if (this.isLoading()) return; 
    const pedidoActual = this.pedido();
    if (!pedidoActual) return;

    this.isLoading.set(true); 

    this.pedidosService.cambiarEstado(pedidoActual.id_pedido, nuevoEstado).subscribe({
      next: (pedidoActualizado: Pedido) => {
        this.pedido.set(pedidoActualizado);
        this.isLoading.set(false);
        
        // Comparación ajustada a mayúsculas
        if (nuevoEstado === 'EN_PREPARACION') {
          this.toastService.exito('Pedido en preparación. ¡Comanda generada!');
          this.mostrarTicket.set(true); 
        } else {
          this.toastService.exito('Estado actualizado correctamente');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false); 
        const mensaje = err.error?.message || 'Error al cambiar el estado';
        this.toastService.error(mensaje);
      }
    });
  }
}