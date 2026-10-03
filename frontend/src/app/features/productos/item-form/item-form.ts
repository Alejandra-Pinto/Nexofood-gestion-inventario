/**
 * Componente: ItemForm (formulario "Nuevo producto")
 * ------------------------------------------------------------------
 * Permite registrar un PRODUCTO (se vende) o un INSUMO (materia prima)
 * con su stock inicial. Diseño basado en el prototipo
 * "18. Registrar movimiento" (botones de tipo, campos con *, ayudas).
 *
 * HU-2.1 · SCRUM-121 Diseñar formulario de registro de ítems
 *        · SCRUM-123 Creación de ítem e inicialización de stock
 *        · SCRUM-124 Validar duplicados y campos obligatorios
 */
import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { InventarioService } from '../../../core/services/inventario.service';
import { CrearItem, ItemInventario, TipoItem } from '../../../core/models/item-inventario.model';

/** Validador propio: rechaza textos que solo tienen espacios ("   ") */
const noSoloEspacios = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.length > 0 && c.value.trim().length === 0 ? { required: true } : null;

/** Solo números enteros (sin decimales), porque los valores son en pesos/unidades */
const ENTERO = /^\d+$/;

@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule],
  templateUrl: './item-form.html',
  styleUrl: './item-form.scss',
})
export class ItemForm {
  private fb = inject(FormBuilder);
  private service = inject(InventarioService);

  /** Evento hacia la pantalla padre cuando se registra un ítem */
  readonly creado = output<ItemInventario>();
  /** Evento hacia la pantalla padre cuando se da clic en "Cancelar" */
  readonly cancelado = output<void>();

  /** Categorías para el selector (se cargan del backend: GET /categories) */
  protected categorias = toSignal(this.service.categorias(), { initialValue: [] });

  // Estado de la pantalla (signals)
  protected guardando = signal(false);
  protected errorGeneral = signal<string | null>(null);
  protected exito = signal<string | null>(null);

  /** Formulario reactivo: cada campo con sus reglas de validación */
  protected form = this.fb.nonNullable.group({
    tipo_item: ['PRODUCTO' as TipoItem, Validators.required],
    nombre: ['', [Validators.required, noSoloEspacios, Validators.maxLength(80)]],
    id_categoria: [0, Validators.min(1)], // 0 = "Seleccione…"
    cantidad_stock: [0, [Validators.required, Validators.min(0), Validators.pattern(ENTERO)]],
    stock_minimo: [0, [Validators.required, Validators.min(0), Validators.pattern(ENTERO)]],
    costo_fabricacion: [0, [Validators.required, Validators.min(0), Validators.pattern(ENTERO)]],
    precio_venta: [0, [Validators.required, Validators.min(1), Validators.pattern(ENTERO)]],
  });

  /** Tipo seleccionado, como signal, para mostrar/ocultar el precio de venta */
  private tipo = toSignal(this.form.controls.tipo_item.valueChanges, {
    initialValue: this.form.controls.tipo_item.value,
  });
  protected esProducto = computed(() => this.tipo() === 'PRODUCTO');

  constructor() {
    // Los INSUMOS no se venden: se desactiva el precio de venta y queda en 0
    this.form.controls.tipo_item.valueChanges.subscribe((tipo) => {
      const precio = this.form.controls.precio_venta;
      if (tipo === 'INSUMO') {
        precio.setValue(0);
        precio.disable();
      } else {
        precio.enable();
      }
    });
  }

  /** Cambia el tipo con los botones "Producto / Insumo" */
  seleccionarTipo(tipo: TipoItem): void {
    this.form.controls.tipo_item.setValue(tipo);
  }

  /** true si el campo ya fue tocado y tiene el error indicado (o cualquier error) */
  protected invalido(campo: keyof typeof this.form.controls, error?: string): boolean {
    const c = this.form.controls[campo];
    return c.touched && (error ? c.hasError(error) : c.invalid);
  }

  /** Envía el formulario al backend (POST /products) */
  guardar(): void {
    this.exito.set(null);
    this.errorGeneral.set(null);

    // Si hay campos inválidos, se marcan todos para mostrar los mensajes en rojo
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() incluye también los campos deshabilitados (precio del insumo)
    const valores = this.form.getRawValue();
    const item: CrearItem = {
      ...valores,
      nombre: valores.nombre.trim().replace(/\s+/g, ' '), // limpia espacios extra
      precio_venta: valores.tipo_item === 'INSUMO' ? 0 : valores.precio_venta,
    };

    this.guardando.set(true);
    this.service.crear(item).subscribe({
      next: (nuevo) => {
        this.guardando.set(false);
        this.exito.set(`"${nuevo.nombre}" se registró con ${nuevo.cantidad_stock} unidades en stock.`);
        this.creado.emit(nuevo);
        this.limpiar();
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.mostrarError(e);
      },
    });
  }

  /** Deja el formulario como nuevo (tipo PRODUCTO, campos vacíos) */
  limpiar(): void {
    this.form.reset();
    this.form.controls.precio_venta.enable();
  }

  /** Traduce la respuesta de error del backend a un mensaje para el usuario */
  private mostrarError(e: HttpErrorResponse): void {
    const mensaje = e.error?.message;
    if (e.status === 409) {
      // SCRUM-124: nombre duplicado -> el error se muestra debajo del campo Nombre
      this.form.controls.nombre.setErrors({ duplicado: mensaje ?? 'Ya existe un ítem con ese nombre' });
      this.form.controls.nombre.markAsTouched();
    } else if (e.status === 400) {
      // Errores de validación del backend (puede venir una lista de mensajes)
      this.errorGeneral.set(Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? 'Datos inválidos'));
    } else if (e.status === 0) {
      this.errorGeneral.set('No hay conexión con el servidor. ¿Está corriendo el backend?');
    } else {
      this.errorGeneral.set('No se pudo registrar el ítem. Intente de nuevo.');
    }
  }
}
