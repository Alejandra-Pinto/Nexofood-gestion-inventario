import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './register.html',
  styleUrls: ['./register.scss']
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  registerForm: FormGroup = this.fb.group({
    nombre_completo: ['', Validators.required],
    idNumber: ['', Validators.required], 
    credencial: ['', [Validators.required, Validators.email]],
    phone: [''], 
    rol: ['', Validators.required],
    status: ['activo'],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
    sendCredentials: [true],
    forceReset: [true]
  }, { validators: this.passwordMatchValidator });

  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    if (password && confirmPassword && password !== confirmPassword) {
      control.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  goBack() {
    this.router.navigate(['/login']);
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const payload = {
      nombre_completo: this.registerForm.value.nombre_completo,
      credencial: this.registerForm.value.credencial,
      password: this.registerForm.value.password,
      rol: this.registerForm.value.rol
    };

    this.http.post('http://localhost:3000/users/register', payload)
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.successMessage = 'Colaborador registrado exitosamente.';
          this.registerForm.reset({ status: 'activo', sendCredentials: true, forceReset: true, rol: '' });
        },
        error: (err) => {
          this.isLoading = false; // Liberamos el botón
          console.error("Error completo del servidor:", err);
          
          if (err.status === 409) {
            this.errorMessage = 'La credencial ingresada ya está registrada.';
          } else if (err.status === 0) {
            this.errorMessage = 'Error de conexión. Verifica que el backend esté encendido y CORS habilitado.';
          } else {
            this.errorMessage = 'Error al registrar el usuario en el servidor.';
          }
        }
      });
  }
}