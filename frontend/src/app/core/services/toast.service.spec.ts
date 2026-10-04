/**
 * Pruebas unitarias: ToastService
 * HU-2.3 · SCRUM-126 (feedback visual con toasts)
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('agrega un toast de éxito y uno de error', () => {
    service.exito('Todo bien');
    service.error('Algo falló');

    expect(service.toasts().map((t) => [t.tipo, t.mensaje])).toEqual([
      ['exito', 'Todo bien'],
      ['error', 'Algo falló'],
    ]);
  });

  it('cada toast tiene un id distinto', () => {
    const a = service.exito('uno');
    const b = service.exito('dos');

    expect(a).not.toBe(b);
  });

  it('el toast de éxito se descarta solo a los 4 segundos', () => {
    service.exito('Se va solo');

    vi.advanceTimersByTime(3999);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(service.toasts().length).toBe(0);
  });

  it('el toast de error dura más que el de éxito', () => {
    service.error('Ups');

    vi.advanceTimersByTime(4000);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(3000);
    expect(service.toasts().length).toBe(0);
  });

  it('con duración 0 no se descarta solo', () => {
    service.mostrar('info', 'Fijo', 0);

    vi.advanceTimersByTime(60_000);
    expect(service.toasts().length).toBe(1);
  });

  it('descartar() quita solo el toast indicado', () => {
    const a = service.exito('uno', 0);
    service.exito('dos', 0);

    service.descartar(a);

    expect(service.toasts().map((t) => t.mensaje)).toEqual(['dos']);
  });
});
