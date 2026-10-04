/**
 * Componente: IngresoForm
 * ------------------------------------------------------------------
 * HU-2.3 · SCRUM-126 Diseñar e implementar interfaz de ajuste de stock (ingresos)
 * Prototipo: "13. Registrar ingreso de inventario"
 *
 * Formulario para registrar un ingreso de inventario. Tiene dos tipos:
 *   - COMPRA (Compra a proveedor): exige proveedor y costo unitario.
 *   - PRODUCCION (Producción propia): sin proveedor; el costo es opcional
 *     (si se deja vacío el backend usa el costo de fabricación del ítem).
 *
 * El "Total del ingreso" se calcula en pantalla (cantidad x costo unitario)
 * solo como referencia: el valor oficial lo calcula el backend.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventarioService } from '../../../core/services/inventario.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  ItemInventario,
  tieneStockBajo,
} from '../../../core/models/item-inventario.model';
import {
  CrearIngreso,
  ETIQUETA_INGRESO,
  MotivoIngreso,
  Proveedor,
} from '../../../core/models/movimiento-inventario.model';

/** Solo números enteros positivos */
const ENTERO = /^\d+$/;

/** Fecha local en formato AAAA-MM-DD (el valor que usa <input type="date">) */
function fechaLocalISO(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** La fecha de ingreso no puede ser posterior a hoy (las AAAA-MM-DD se comparan como texto) */
function noFutura(control: AbstractControl): ValidationErrors | null {
  const valor = control.value as string | null;
  return valor && valor > fechaLocalISO(new Date()) ? { fechaFutura: true } : null;
}

@Component({
  selector: 'app-ingreso-form',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './ingreso-form.html',
  styleUrl: './ingreso-form.scss',
})
export class IngresoForm {
  private fb = inject(FormBuilder);
  private service = inject(InventarioService);
  private toast = inject(ToastService);

  /** Datos de los selectores */
  protected items = signal<ItemInventario[]>([]);
  protected proveedores = signal<Proveedor[]>([]);

  /** true mientras se espera la respuesta del backend (deshabilita los botones) */
  protected enviando = signal(false);

  protected readonly tipos: MotivoIngreso[] = ['COMPRA', 'PRODUCCION'];
  protected readonly etiquetaTipo = ETIQUETA_INGRESO;
  protected readonly hoy = fechaLocalISO(new Date());

  /** Formulario reactivo */
  protected form = this.fb.group({
    motivo: this.fb.nonNullable.control<MotivoIngreso>('COMPRA'),
    id_proveedor: this.fb.control<number | null>(null),
    id_item: this.fb.control<number | null>(null, [Validators.required]),
    cantidad: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.pattern(ENTERO),
    ]),
    costo_unitario: this.fb.control<number | null>(null),
    fecha_ingreso: this.fb.nonNullable.control(this.hoy, [Validators.required, noFutura]),
    observaciones: this.fb.nonNullable.control('', [Validators.maxLength(255)]),
  });

  // ---------- Valores del formulario como signals (para los computed) ----------
  protected motivoSel = toSignal(this.form.controls.motivo.valueChanges, {
    initialValue: this.form.controls.motivo.value,
  });
  private itemSel = toSignal(this.form.controls.id_item.valueChanges, {
    initialValue: this.form.controls.id_item.value,
  });
  private cantidadSel = toSignal(this.form.controls.cantidad.valueChanges, {
    initialValue: this.form.controls.cantidad.value,
  });
  private costoSel = toSignal(this.form.controls.costo_unitario.valueChanges, {
    initialValue: this.form.controls.costo_unitario.value,
  });

  /** ¿Está seleccionada "Compra a proveedor"? Controla qué campos se muestran */
  protected esCompra = computed(() => this.motivoSel() === 'COMPRA');

  protected itemSeleccionado = computed<ItemInventario | undefined>(() =>
    this.items().find((i) => i.id_item === this.itemSel()),
  );

  protected stockBajo = computed(() => {
    const item = this.itemSeleccionado();
    return item ? tieneStockBajo(item) : false;
  });

  /** Costo con el que se calcula el total: el digitado o, en producción, el del ítem */
  private costoEfectivo = computed(() => {
    const costo = this.costoSel();
    if (costo && costo > 0) return costo;
    return this.esCompra() ? 0 : (this.itemSeleccionado()?.costo_fabricacion ?? 0);
  });

  /** Total del ingreso = cantidad x costo unitario (solo referencia visual) */
  protected total = computed(() => {
    const cantidad = this.cantidadSel() ?? 0;
    return cantidad > 0 ? cantidad * this.costoEfectivo() : 0;
  });

  constructor() {
    this.cargarDatos();

    // Al cambiar el tipo de ingreso cambian los campos obligatorios
    this.form.controls.motivo.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((motivo) => this.aplicarReglasPorTipo(motivo));
    this.aplicarReglasPorTipo(this.form.controls.motivo.value);
  }

  /** Carga productos/insumos activos (GET /products) y proveedores (GET /inventory/proveedores) */
  private cargarDatos(): void {
    this.cargarItems();
    this.service.proveedores().subscribe({
      next: (lista) => this.proveedores.set(lista),
      error: () => {
        this.proveedores.set([]);
        this.toast.error('No se pudieron cargar los proveedores.');
      },
    });
  }

  /** Se vuelve a llamar tras cada ingreso para reflejar el nuevo stock */
  private cargarItems(): void {
    this.service.listar().subscribe({
      next: (lista) => this.items.set(lista.filter((i) => i.estado_activo)),
      error: () => {
        this.items.set([]);
        this.toast.error('No se pudieron cargar los productos.');
      },
    });
  }

  /**
   * COMPRA:     proveedor y costo unitario obligatorios.
   * PRODUCCION: sin proveedor (se limpia) y costo opcional.
   */
  private aplicarReglasPorTipo(motivo: MotivoIngreso): void {
    const { id_proveedor, costo_unitario } = this.form.controls;

    if (motivo === 'COMPRA') {
      id_proveedor.setValidators([Validators.required]);
      costo_unitario.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.pattern(ENTERO),
      ]);
    } else {
      id_proveedor.clearValidators();
      id_proveedor.setValue(null, { emitEvent: false });
      costo_unitario.setValidators([Validators.min(1), Validators.pattern(ENTERO)]);
    }
    id_proveedor.updateValueAndValidity({ emitEvent: false });
    costo_unitario.updateValueAndValidity({ emitEvent: false });
  }

  /** true si el campo fue tocado y tiene error (opcionalmente uno en concreto) */
  protected invalido(
    campo: keyof typeof this.form.controls,
    error?: string,
  ): boolean {
    const c = this.form.controls[campo];
    return c.touched && (error ? c.hasError(error) : c.invalid);
  }

  /** Envía el ingreso al backend */
  registrar(): void {
    if (this.enviando()) return; // evita doble envío

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Revisa los campos marcados en rojo.');
      return;
    }

    const v = this.form.getRawValue();
    const dto: CrearIngreso = {
      id_item: v.id_item as number,
      motivo: v.motivo,
      cantidad: v.cantidad as number,
      fecha_ingreso: v.fecha_ingreso,
    };
    if (v.motivo === 'COMPRA') dto.id_proveedor = v.id_proveedor as number;
    if (v.costo_unitario) dto.costo_unitario = v.costo_unitario;
    const observaciones = v.observaciones.trim();
    if (observaciones) dto.observaciones = observaciones;

    const nombre = this.itemSeleccionado()?.nombre ?? 'El ítem';

    this.enviando.set(true);
    this.service.registrarIngreso(dto).subscribe({
      next: (mov) => {
        this.enviando.set(false);
        this.toast.exito(
          `Ingreso registrado. ${nombre}: ${mov.stock_anterior} → ${mov.stock_nuevo} unidades.`,
        );
        this.limpiar();
        this.cargarItems();
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.toast.error(this.mensajeDeError(e));
      },
    });
  }

  /** Botón "Cancelar": descarta lo digitado */
  cancelar(): void {
    if (this.enviando()) return;
    this.limpiar();
  }

  /** Deja el formulario vacío conservando el tipo de ingreso elegido (útil para registrar varios seguidos) */
  private limpiar(): void {
    this.form.reset({
      motivo: this.form.controls.motivo.value,
      id_proveedor: null,
      id_item: null,
      cantidad: null,
      costo_unitario: null,
      fecha_ingreso: this.hoy,
      observaciones: '',
    });
  }

  /** Traduce el error HTTP a un mensaje para el usuario */
  private mensajeDeError(e: HttpErrorResponse): string {
    const mensaje = e.error?.message;
    switch (e.status) {
      case 400:
        return Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? 'Datos inválidos.');
      case 401:
        return 'Sesión expirada. Vuelva a iniciar sesión.';
      case 403:
        return 'No tiene permisos para registrar ingresos de inventario.';
      case 404:
        return mensaje ?? 'El producto o el proveedor seleccionado no existe.';
      case 0:
        return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
      default:
        return 'No se pudo registrar el ingreso. Intente de nuevo.';
    }
  }
}
