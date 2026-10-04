/**
 * Componente: SalidaForm
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-131 Diseñar interfaz de salidas (merma/consumo interno)
 *
 * Formulario para registrar una salida manual de inventario.
 * Solo permite los motivos MERMA y CONSUMO_INTERNO.
 * El stock del ítem se valida en el backend (SCRUM-133).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { InventarioService } from '../../../core/services/inventario.service';
import {
  ItemInventario,
  tieneStockBajo,
} from '../../../core/models/item-inventario.model';
import {
  CrearSalida,
  ETIQUETA_MOTIVO,
  MotivoSalida,
  MovimientoInventario,
} from '../../../core/models/movimiento-inventario.model';

/** Solo números enteros positivos (regex de enteros) */
const ENTERO = /^\d+$/;

@Component({
  selector: 'app-salida-form',
  imports: [ReactiveFormsModule],
  templateUrl: './salida-form.html',
  styleUrl: './salida-form.scss',
})
export class SalidaForm {
  private fb = inject(FormBuilder);
  private service = inject(InventarioService);

  /** Lista de ítems disponibles (signal escribible para poder recargar) */
  protected items = signal<ItemInventario[]>([]);

  /** Estado de la pantalla */
  protected enviando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected exito = signal<MovimientoInventario | null>(null);

  /** Motivos permitidos en este formulario */
  protected readonly motivos: MotivoSalida[] = ['MERMA', 'CONSUMO_INTERNO'];
  protected readonly etiquetaMotivo = ETIQUETA_MOTIVO;

  /** Formulario reactivo con validaciones */
  protected form = this.fb.nonNullable.group({
    id_item: [0, [Validators.required, Validators.min(1)]],
    motivo: ['MERMA' as MotivoSalida, [Validators.required]],
    cantidad: [
      1,
      [Validators.required, Validators.min(1), Validators.pattern(ENTERO)],
    ],
    observaciones: ['', [Validators.maxLength(255)]],
  });

  /** Id del ítem seleccionado, como signal (para computar el ítem actual) */
  private idItemSeleccionado = toSignal(
    this.form.controls.id_item.valueChanges,
    { initialValue: this.form.controls.id_item.value },
  );

  /** Ítem seleccionado actualmente */
  protected itemSeleccionado = computed<ItemInventario | undefined>(() =>
    this.items().find((i) => i.id_item === this.idItemSeleccionado()),
  );

  /** ¿El ítem seleccionado tiene stock bajo? */
  protected stockBajo = computed(() => {
    const item = this.itemSeleccionado();
    return item ? tieneStockBajo(item) : false;
  });

  constructor() {
    this.cargarItems();
  }

  /** Carga los ítems desde el backend (GET /products) */
  private cargarItems(): void {
    this.service.listar().subscribe({
      next: (lista) => this.items.set(lista),
      error: () => this.items.set([]),
    });
  }

  /** true si el campo ya fue tocado y tiene el error indicado */
  protected invalido(
    campo: keyof typeof this.form.controls,
    error?: string,
  ): boolean {
    const c = this.form.controls[campo];
    return c.touched && (error ? c.hasError(error) : c.invalid);
  }

  /** Envía el formulario al backend */
  registrar(): void {
    this.exito.set(null);
    this.errorGeneral.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const valores = this.form.getRawValue();
    const dto: CrearSalida = {
      id_item: valores.id_item,
      motivo: valores.motivo,
      cantidad: valores.cantidad,
      observaciones: valores.observaciones?.trim() || undefined,
    };

    this.enviando.set(true);
    this.service.registrarSalida(dto).subscribe({
      next: (mov) => {
        this.enviando.set(false);
        this.exito.set(mov);
        this.form.reset({
          id_item: 0,
          motivo: 'MERMA',
          cantidad: 1,
          observaciones: '',
        });
        // Recargar la lista para reflejar el nuevo stock
        this.cargarItems();
      },
      error: (e: HttpErrorResponse) => {
        this.enviando.set(false);
        this.mostrarError(e);
      },
    });
  }

  /** Traduce el error HTTP a un mensaje para el usuario */
  private mostrarError(e: HttpErrorResponse): void {
    const mensaje = e.error?.message;
    switch (e.status) {
      case 400:
        this.errorGeneral.set(
          Array.isArray(mensaje)
            ? mensaje.join('. ')
            : (mensaje ?? 'Datos inválidos.'),
        );
        break;
      case 401:
        this.errorGeneral.set('Sesión expirada. Vuelva a iniciar sesión.');
        break;
      case 403:
        this.errorGeneral.set(
          'No tiene permisos para registrar salidas de inventario.',
        );
        break;
      case 404:
        this.errorGeneral.set(mensaje ?? 'El ítem seleccionado no existe.');
        break;
      case 0:
        this.errorGeneral.set(
          'No hay conexión con el servidor. ¿Está corriendo el backend?',
        );
        break;
      default:
        this.errorGeneral.set(
          'No se pudo registrar la salida. Intente de nuevo.',
        );
    }
  }
}