/**
 * Componente: CobrarPedido
 * ------------------------------------------------------------------
 * HU-3.5 · SCRUM-167 Diseñar interfaz para seleccionar el método de pago
 *
 * El cajero elige un pedido pendiente de pago, selecciona el medio de pago
 * (Efectivo, Transferencia, Nequi, Daviplata o Tarjeta) y lo registra.
 * En efectivo se ingresa el valor recibido y se calcula el cambio.
 */
import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ETIQUETA_ESTADO,
  MEDIOS_PAGO,
  MedioPago,
  Pedido,
  ResultadoPago,
} from '../../../core/models/pedido.model';

@Component({
  selector: 'app-cobrar-pedido',
  imports: [CurrencyPipe, DatePipe, TitleCasePipe, RouterLink, RouterLinkActive],
  templateUrl: './cobrar-pedido.html',
  styleUrl: './cobrar-pedido.scss',
})
export class CobrarPedido {
  private pedidosService = inject(PedidosService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  protected readonly medios = MEDIOS_PAGO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;

  /** El Mesero no puede cobrar (el backend también lo bloquea) */
  protected puedeCobrar = computed(() => this.auth.usuarioActual()?.rol !== 'Mesero');

  /** Pedidos que aún no se han pagado ni anulado */
  protected pedidos = signal<Pedido[]>([]);
  protected cargando = signal(true);
  protected errorCarga = signal(false);

  protected seleccionado = signal<Pedido | null>(null);
  protected medio = signal<MedioPago | null>(null);
  /** Valor recibido en efectivo (texto del input) */
  protected recibido = signal('');
  protected intento = signal(false);
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected resultado = signal<ResultadoPago | null>(null);

  protected esEfectivo = computed(() => this.medio() === 'EFECTIVO');

  /** Valor recibido como número (null si está vacío o no es válido) */
  protected recibidoNum = computed(() => {
    const t = this.recibido().trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 ? n : NaN;
  });

  /** Cambio a devolver (solo efectivo) */
  protected cambio = computed(() => {
    const p = this.seleccionado();
    const r = this.recibidoNum();
    if (!p || r === null || Number.isNaN(r)) return null;
    return r - p.total_calculado;
  });

  /** Mensaje de error del efectivo, o null si está bien */
  protected errorEfectivo = computed(() => {
    if (!this.esEfectivo()) return null;
    const r = this.recibidoNum();
    if (r === null) return 'Ingrese el valor recibido.';
    if (Number.isNaN(r)) return 'Ingrese un valor entero mayor a 0.';
    if ((this.cambio() ?? 0) < 0) return 'El valor recibido es menor al total del pedido.';
    return null;
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.pedidosService.listar().subscribe({
      next: (lista) => {
        const porCobrar = lista.filter((p) => p.estado_pedido !== 'PAGADO' && p.estado_pedido !== 'ANULADO');
        this.pedidos.set(porCobrar);
        // Si el seleccionado ya no está pendiente, se quita
        const sel = this.seleccionado();
        if (sel && !porCobrar.some((p) => p.id_pedido === sel.id_pedido)) this.seleccionado.set(null);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  protected seleccionar(p: Pedido): void {
    this.seleccionado.set(p);
    this.medio.set(null);
    this.recibido.set('');
    this.intento.set(false);
    this.errorGeneral.set(null);
    this.resultado.set(null);
  }

  protected elegirMedio(m: MedioPago): void {
    this.medio.set(m);
    this.errorGeneral.set(null);
  }

  /** Registra el pago (SCRUM-168 en el backend) */
  protected registrar(): void {
    this.intento.set(true);
    this.errorGeneral.set(null);
    const pedido = this.seleccionado();
    const medio = this.medio();
    if (!pedido || !medio || this.errorEfectivo()) return;

    this.enviando.set(true);
    const dto = this.esEfectivo()
      ? { medio_pago: medio, monto_recibido: this.recibidoNum() as number }
      : { medio_pago: medio };

    this.pedidosService.registrarPago(pedido.id_pedido, dto).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.resultado.set(r);
        this.seleccionado.set(null);
        this.medio.set(null);
        this.recibido.set('');
        this.intento.set(false);
        this.toast.exito(`Pago del pedido #${r.pedido.id_pedido} registrado`);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        const m = e.error?.message;
        const texto = Array.isArray(m) ? m.join('. ') : m;
        if (e.status === 409) this.cargar(); // ya estaba pagado: se refresca la lista
        this.errorGeneral.set(
          e.status === 0
            ? 'No hay conexión con el servidor. ¿Está corriendo el backend?'
            : e.status === 401
              ? 'Sesión expirada. Vuelva a iniciar sesión.'
              : e.status === 403
                ? 'Solo el cajero o el administrador pueden registrar pagos.'
                : (texto ?? 'No se pudo registrar el pago. Intente de nuevo.'),
        );
      },
    });
  }
}
