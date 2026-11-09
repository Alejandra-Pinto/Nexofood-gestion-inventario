/**
 * Servicio: ReportesService
 * HU-6.1 · Consulta consolidada de existencias de inventario
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReporteInventarioResultado } from '../models/reporte.model';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/queries-reports`;

  obtenerReporteInventario(): Observable<ReporteInventarioResultado> {
    return this.http.get<ReporteInventarioResultado>(`${this.api}/reportes/inventario`);
  }
}
