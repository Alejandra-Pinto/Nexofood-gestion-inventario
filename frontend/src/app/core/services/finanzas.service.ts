import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CrearIngreso, IngresoFinanciero, ListaIngresos } from '../models/finanzas.model';

export interface CrearEgreso {
  concepto: string;
  monto: number;
  medio_pago: string;
  categoria?: string;
  observaciones?: string;
}

export interface EgresoFinanciero {
  id_movimiento: number;
  fecha_hora: string;
  concepto: string;
  categoria: string;
  monto: number;
  medio_pago: string;
  observaciones: string | null;
  registrado_por: string | null;
}

export interface ListaEgresos {
  desde: string;
  hasta: string;
  total: number;
  egresos: EgresoFinanciero[];
}

@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/finance`;

  registrarIngreso(dto: CrearIngreso) {
    return this.http.post<IngresoFinanciero>(`${this.api}/ingresos`, dto);
  }

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

  registrarEgreso(dto: CrearEgreso) {
    return this.http.post<EgresoFinanciero>(`${this.api}/egresos`, dto);
  }

  listarEgresos(desde?: string, hasta?: string) {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<ListaEgresos>(`${this.api}/egresos`, { params }).pipe(
      map((r) => ({
        ...r,
        total: Number(r.total),
        egresos: r.egresos.map((i) => ({ ...i, monto: Number(i.monto) })),
      })),
    );
  }
}