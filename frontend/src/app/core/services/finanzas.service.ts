/** Servicio: FinanzasService - Se comunica con el módulo Finance del backend. */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CrearIngreso, IngresoFinanciero, ListaIngresos } from '../models/finanzas.model';

@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/finance`;

  /** POST /finance/ingresos */
  registrarIngreso(dto: CrearIngreso) {
    return this.http.post<IngresoFinanciero>(`${this.api}/ingresos`, dto);
  }

  /** GET /finance/ingresos?desde=&hasta= (sin fechas: el mes actual) */
  listarIngresos(desde?: string, hasta?: string) {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<ListaIngresos>(`${this.api}/ingresos`, { params }).pipe(
      map((r) => ({
        ...r,
        total: Number(r.total),
        ingresos: r.ingresos.map((i) => ({ ...i, monto: Number(i.monto) })),
      })),
    );
  }
}
