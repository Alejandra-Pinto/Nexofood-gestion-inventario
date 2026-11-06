/** Pantalla: IngresoFinanciero - Registrar ingresos no provenientes de ventas */
import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FinanzasService } from '../../../core/services/finanzas.service';
import { ToastService } from '../../../core/services/toast.service';
import { MEDIOS_PAGO, MedioPago } from '../../../core/models/pedido.model';
import {
  CATEGORIAS_INGRESO,
  CategoriaIngreso,
  errorMonto,
  hoyColombia,
  ListaIngresos,
} from '../../../core/models/finanzas.model';

@Component({
  selector: 'app-ingreso-financiero',
  imports: [CurrencyPipe, DatePipe, TitleCasePipe],
  templateUrl: './ingreso-financiero.html',
  styleUrl: './ingreso-financiero.scss',
})
export class IngresoFinanciero {
  private finanzas = inject(FinanzasService);
  private toast = inject(ToastService);

  protected readonly medios = MEDIOS_PAGO;
  protected readonly categorias = CATEGORIAS_INGRESO;
  protected readonly hoy = hoyColombia();

  // Formulario
  protected concepto = signal('');
  protected monto = signal('');
  protected fecha = signal(this.hoy);
  protected medio = signal<MedioPago | null>(null);
  protected categoria = signal<CategoriaIngreso | ''>('');
  protected observaciones = signal('');
  /** True después del primer intento de registrar: muestra los errores */
  protected intento = signal(false);
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);

  // Validaciones en pantalla
  protected errorConcepto = computed(() => {
    const t = this.concepto().trim();
    if (!t) return 'El concepto es obligatorio.';
    if (t.length < 3) return 'El concepto debe tener al menos 3 caracteres.';
    return null;
  });
  /** SCRUM-247 */
  protected errorMonto = computed(() => errorMonto(this.monto()));
  protected errorFecha = computed(() => {
    const f = this.fecha();
    if (!f) return 'La fecha es obligatoria.';
    if (f > this.hoy) return 'La fecha no puede ser posterior a hoy.';
    return null;
  });
  protected errorMedio = computed(() => (this.medio() ? null : 'Seleccione el medio de pago.'));
  protected errorCategoria = computed(() => (this.categoria() ? null : 'Seleccione una categoría.'));
  protected formularioValido = computed(
    () => !this.errorConcepto() && !this.errorMonto() && !this.errorFecha() && !this.errorMedio() && !this.errorCategoria(),
  );

  // Ingresos del mes
  protected lista = signal<ListaIngresos | null>(null);
  protected cargando = signal(true);
  protected errorCarga = signal(false);
  protected textoCategoria = (c: string) => CATEGORIAS_INGRESO.find((x) => x.valor === c)?.texto ?? c;

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.finanzas.listarIngresos().subscribe({
      next: (l) => {
        this.lista.set(l);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set(true);
        this.cargando.set(false);
      },
    });
  }

  protected limpiar(): void {
    this.concepto.set('');
    this.monto.set('');
    this.fecha.set(this.hoy);
    this.medio.set(null);
    this.categoria.set('');
    this.observaciones.set('');
    this.intento.set(false);
    this.errorGeneral.set(null);
  }

  /** SCRUM-246: registra el ingreso (no se suma a las ventas) */
  protected registrar(): void {
    this.intento.set(true);
    this.errorGeneral.set(null);
    if (!this.formularioValido()) return;

    this.enviando.set(true);
    const obs = this.observaciones().trim();
    this.finanzas
      .registrarIngreso({
        concepto: this.concepto().trim(),
        categoria: this.categoria() as CategoriaIngreso,
        monto: Number(this.monto()),
        medio_pago: this.medio()!,
        fecha: this.fecha(),
        ...(obs ? { observaciones: obs } : {}),
      })
      .subscribe({
        next: (i) => {
          this.enviando.set(false);
          this.toast.exito(`Ingreso registrado por $${i.monto.toLocaleString('es-CO')}`);
          this.limpiar();
          this.cargar();
        },
        error: (e: HttpErrorResponse) => {
          this.enviando.set(false);
          const m = e.error?.message;
          const texto = Array.isArray(m) ? m.join('. ') : m;
          this.errorGeneral.set(
            e.status === 0
              ? 'No hay conexión con el servidor. ¿Está corriendo el backend?'
              : e.status === 403
                ? 'Solo el administrador puede registrar ingresos.'
                : (texto ?? 'No se pudo registrar el ingreso. Intente de nuevo.'),
          );
        },
      });
  }
}
