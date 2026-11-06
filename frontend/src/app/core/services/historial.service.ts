import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FiltrosHistorial, ResultadoHistorial } from '../models/historial.model';

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/queries-reports`;

  /** GET /queries-reports/historial (HU-5.2). Solo se envían los filtros con valor. */
  buscar(filtros: FiltrosHistorial = {}) {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.http.get<ResultadoHistorial>(`${this.api}/historial`, { params });
  }
}
