/** Pestañas Ingresos | Egresos del módulo Financiero (HU-7.1 y HU-7.2) */
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-financiero-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="pestanas" aria-label="Módulo financiero">
      <a routerLink="/financiero/ingresos" routerLinkActive="activa" class="pestana">Ingresos</a>
      <a routerLink="/financiero/egresos" routerLinkActive="activa" class="pestana">Egresos</a>
    </nav>
  `,
  styles: `
    :host { display: block; padding: 16px 32px 0; }
    .pestanas {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 10px;
    }
    .pestana {
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--muted);
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .pestana:hover { background: var(--primario-suave); color: var(--primario); }
    .pestana.activa { background: var(--primario); color: #fff; }
    .pestana:focus-visible { outline: 2px solid var(--dorado); outline-offset: 2px; }
  `,
})
export class FinancieroTabs {}