import { Component, inject, signal, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from '../../../core/services/toast.service';
import { FinanzasService, EgresoFinanciero } from '../../../core/services/finanzas.service';

@Component({
  selector: 'app-egreso-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './egreso-form.html',
  styleUrl: './egreso-form.scss'
})
export class EgresoFormComponent implements OnInit {
  // 1. Inyección de dependencias usando la práctica moderna de Angular (inject)
  private fb = inject(FormBuilder);
  private finanzasService = inject(FinanzasService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  // 2. Signals para manejar el estado reactivo de la vista
  public isSaving = signal(false);
  public totalEgresosMes = signal<number>(0); 
  public listaEgresos = signal<EgresoFinanciero[]>([]);

  // 3. Catálogos para los selectores
  public categorias = [
    { valor: 'compra_proveedores', texto: 'Compra a proveedores' },
    { valor: 'servicios', texto: 'Servicios públicos' },
    { valor: 'arriendo', texto: 'Arriendo' },
    { valor: 'nomina', texto: 'Nómina' },
    { valor: 'mantenimiento', texto: 'Mantenimiento' },
    { valor: 'otros', texto: 'Otros gastos' },
  ];

  public mediosPago = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA'];

  // 4. Definición del formulario reactivo fuertemente tipado
  public form = this.fb.nonNullable.group({
    concepto: ['', [Validators.required, Validators.maxLength(120)]],
    monto: [0, [Validators.required, Validators.min(1)]],
    medio_pago: ['EFECTIVO', Validators.required],
    categoria: ['otros'],
    observaciones: ['', Validators.maxLength(255)]
  });

  // 5. Al iniciar el componente, cargamos los datos del panel derecho
  ngOnInit() {
    this.cargarResumen();
  }

  // Helper para saber si un campo está inválido y mostrar el error rojo en el HTML
  campoInvalido(campo: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[campo];
    return control.invalid && control.touched;
  }

  // Consulta al backend para traer el total y la lista de egresos del mes
  cargarResumen() {
    this.finanzasService.listarEgresos()
      .pipe(takeUntilDestroyed(this.destroyRef)) // Previene fugas de memoria si el usuario sale de la pantalla
      .subscribe({
        next: (res) => {
          this.totalEgresosMes.set(res.total);
          this.listaEgresos.set(res.egresos); // Usamos res.egresos según adaptamos la interfaz
        },
        error: (err) => {
          console.error('Error al cargar el resumen de egresos', err);
        }
      });
  }

  // Función que se ejecuta al enviar el formulario
  guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // Marca todos los campos para que se pinten de rojo
      return;
    }

    this.isSaving.set(true);
    this.finanzasService.registrarEgreso(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.exito('Egreso registrado correctamente');
          this.isSaving.set(false);
          
          // Limpiamos el formulario dejando los valores por defecto
          this.form.reset({
            concepto: '',
            monto: 0,
            medio_pago: 'EFECTIVO',
            categoria: 'otros',
            observaciones: ''
          });

          // Volvemos a consultar la base de datos para actualizar el panel derecho
          this.cargarResumen(); 
        },
        error: (err: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.toastService.error(err.error?.message || 'Error al registrar el egreso');
        }
      });
  }
}