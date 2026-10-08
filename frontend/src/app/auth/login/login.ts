import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  // Angular sin zone.js: hay que avisar que la vista cambió tras la respuesta HTTP
  private cdr = inject(ChangeDetectorRef);

  loginForm: FormGroup = this.fb.group({
    credencial: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  showPassword = false;
  isLoading = false;
  errorMessage = '';

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.isLoading = false;
        // Redirige según el rol (eliminando la pantalla blanca)
        const ruta = this.authService.obtenerRutaInicial();
        this.router.navigate([ruta]);
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 401 || err.status === 400) {
          this.errorMessage = err.error?.message || 'Usuario o contraseña incorrectos.';
        } else {
          this.errorMessage = 'Error de conexión con el servidor.';
        }
        this.cdr.markForCheck();
      },
    });
  }
}
