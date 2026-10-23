/**
 * Componente: MisMesas
 * ------------------------------------------------------------------
 * HU-3.1 · SCRUM-146 Diseñar interfaz de selección de productos y cantidades
 *
 * Primera pantalla del mesero (prototipo "Mis mesas"): muestra las 8 mesas
 * con su estado (Libre, Pendiente u Ocupada). Al tocar una mesa se abre
 * su pedido en /ventas/mesa/:numero.
 */
import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PedidosService } from '../../../core/services/pedidos.service';
import { BorradorPedidoService } from '../../../core/services/borrador-pedido.service';
import { AuthService } from '../../../core/services/auth.service';
import { ETIQUETA_MESA, MesaResumen } from '../../../core/models/pedido.model';

@Component({
  selector: 'app-mis-mesas',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './mis-mesas.html',
  styleUrl: './mis-mesas.scss',
})
export class MisMesas {
  private pedidos = inject(PedidosService);
  private borradores = inject(BorradorPedidoService);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly etiqueta = ETIQUETA_MESA;
  protected mesas = signal<MesaResumen[]>([]);
  protected cargando = signal(true);
  protected errorCarga = signal(false);

  protected nombreUsuario = computed(() => this.auth.usuarioActual()?.nombre ?? 'Mesero');
  /** El cajero y el administrador también pueden tomar pedidos para llevar */
  protected puedeParaLlevar = computed(() => this.auth.usuarioActual()?.rol !== 'Mesero');

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.pedidos.mesas().subscribe({
      next: (m) => {
        this.mesas.set(m);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  /** true si el mesero empezó a elegir productos en una mesa libre sin enviarlos */
  protected enCurso(m: MesaResumen): boolean {
    return m.estado === 'LIBRE' && this.borradores.tieneBorrador(`mesa-${m.numero}`);
  }

  protected abrir(m: MesaResumen): void {
    this.router.navigate(['/ventas/mesa', m.numero]);
  }
}
