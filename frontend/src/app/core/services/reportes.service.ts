/** Servicio: ReportesService - Resumen de operaciones por período · Reporte general de ventas */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ReporteVentas, ResumenPeriodo } from '../models/reportes.model';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/queries-reports`;

  /** GET /queries-reports/resumen?desde=&hasta= (HU-6.7) */
  resumen(desde: string, hasta: string) {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<ResumenPeriodo>(`${this.api}/resumen`, { params });
  }

  /** GET /queries-reports/ventas?desde=&hasta= (HU-6.2) */
  ventas(desde: string, hasta: string) {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<ReporteVentas>(`${this.api}/ventas`, { params });
  }
}
