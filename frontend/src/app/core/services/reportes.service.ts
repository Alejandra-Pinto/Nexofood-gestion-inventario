/**
 * Servicio: ReportesService
 * HU-6.1 · Consulta consolidada de existencias de inventario
 * HU-6.7 · Resumen de operaciones por período
 * HU-6.2 · Reporte general de ventas
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReporteInventarioResultado } from '../models/reporte.model';
import { ReporteFinanciero, ReporteProductosMasVendidos, ReporteVentas, ResumenPeriodo } from '../models/reportes.model';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/queries-reports`;

  /** HU-6.1 · Consulta consolidada de existencias de inventario */
  obtenerReporteInventario(): Observable<ReporteInventarioResultado> {
    return this.http.get<ReporteInventarioResultado>(`${this.api}/reportes/inventario`);
  }

  /** GET /queries-reports/resumen?desde=&hasta= (HU-6.7) */
  resumen(desde: string, hasta: string): Observable<ResumenPeriodo> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<ResumenPeriodo>(`${this.api}/resumen`, { params });
  }

  /** GET /queries-reports/ventas?desde=&hasta=&id_item= (HU-6.2 · HU-6.5) */
  ventas(desde: string, hasta: string, idItem?: number | ''): Observable<ReporteVentas> {
    let params = new HttpParams().set('desde', desde).set('hasta', hasta);
    if (idItem) {
      params = params.set('id_item', idItem);
    }
    return this.http.get<ReporteVentas>(`${this.api}/ventas`, { params });
  }

  /** GET /queries-reports/productos-mas-vendidos?desde=&hasta=&id_item= (HU-6.3 · HU-6.5) */
  productosMasVendidos(desde: string, hasta: string, idItem?: number | ''): Observable<ReporteProductosMasVendidos> {
    let params = new HttpParams().set('desde', desde).set('hasta', hasta);
    if (idItem) {
      params = params.set('id_item', idItem);
    }
    return this.http.get<ReporteProductosMasVendidos>(`${this.api}/productos-mas-vendidos`, { params });
  }

  /** GET /queries-reports/financiero?desde=&hasta= (HU-6.4) */
  financiero(desde: string, hasta: string): Observable<ReporteFinanciero> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<ReporteFinanciero>(`${this.api}/financiero`, { params });
  }
}
