import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ActualizarPermisos, Usuario } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** GET /users */
  listar() {
    return this.http.get<Usuario[]>(`${this.api}/users`);
  }

  /** PATCH /users/:id/permisos (HU-1.4) */
  actualizarPermisos(id: number, datos: ActualizarPermisos) {
    return this.http.patch<Usuario>(`${this.api}/users/${id}/permisos`, datos);
  }
}