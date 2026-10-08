import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermisoUsuario, RolUsuario } from '../models/usuario.model';

export interface UsuarioSesion {
  nombre: string;
  rol: RolUsuario;
  permisos: PermisoUsuario[];
}

export interface LoginResponse {
  access_token: string;
  usuario: UsuarioSesion;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiUrl;

  readonly usuarioActual = signal<UsuarioSesion | null>(this.obtenerSesionGuardada());

  private obtenerSesionGuardada(): UsuarioSesion | null {
    try {
      const data = localStorage.getItem('usuario');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  login(credenciales: { credencial: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.api}/auth/login`, credenciales).pipe(
      tap((res) => {
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('usuario', JSON.stringify(res.usuario));
        this.usuarioActual.set(res.usuario);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('usuario');
    this.usuarioActual.set(null);
    this.router.navigate(['/login']);
  }

  estaAutenticado(): boolean {
    return !!localStorage.getItem('access_token');
  }

  obtenerRutaInicial(): string {
    const usuario = this.usuarioActual();
    if (!usuario) return '/login';

    // En Sprint 1: Administrador y Cajero ingresan a Productos
    if (usuario.rol === 'Administrador' || usuario.rol === 'Cajero') {
      return '/productos';
    }

    // Mesero: si tiene permiso productos va a /productos, sino inventario
    if (usuario.permisos?.includes('productos')) {
      return '/productos';
    }

    return '/productos';
  }
}

