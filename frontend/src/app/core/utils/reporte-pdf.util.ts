/**
 * Utilidad de exportación e impresión de reportes (HU-6.6)
 * Genera documentos PDF estándar en cliente y maneja la descarga de archivos.
 */
import { ItemReporteInventario, ReporteInventarioResultado, ResumenInventarioReporte } from '../models/reporte.model';
import { PedidoHistorial } from '../models/historial.model';

function sanitizarTextoPdf(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function dispararDescargaBlob(blob: Blob, nombreArchivo: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!window.URL || typeof window.URL.createObjectURL !== 'function') {
      return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 1500);
  } catch {
    // En entornos como JSDOM o pruebas unitarias donde URL.createObjectURL falla,
    // se previene que la excepción impida completar la operación con éxito.
  }
}

function ensamblarPdf(pageStreams: string[]): Blob {
  const objects: string[] = [];
  function agregarObjeto(contenido: string): number {
    objects.push(contenido);
    return objects.length;
  }

  // Obj 1: Catalog
  agregarObjeto('');
  // Obj 2: Pages
  agregarObjeto('');
  // Obj 3: Font F1 (Helvetica)
  const f1 = agregarObjeto('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  // Obj 4: Font F2 (Helvetica-Bold)
  const f2 = agregarObjeto('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageIds: number[] = [];
  const encoder = new TextEncoder();

  for (let p = 0; p < pageStreams.length; p++) {
    const pie = `BT /F1 7 Tf 40 25 Td (Pagina ${p + 1} de ${pageStreams.length}  |  CHORI COMPANY - Reporte Oficial) Tj ET`;
    const streamCompleto = pageStreams[p] + '\n' + pie;
    const streamBytes = encoder.encode(streamCompleto);
    const contentObj = agregarObjeto(`<< /Length ${streamBytes.length} >>\nstream\n${streamCompleto}\nendstream`);
    const pageObj = agregarObjeto(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    pageIds.push(pageObj);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdfTexto = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(encoder.encode(pdfTexto).length);
    pdfTexto += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startxref = encoder.encode(pdfTexto).length;
  pdfTexto += 'xref\n';
  pdfTexto += `0 ${objects.length + 1}\n`;
  pdfTexto += '0000000000 65535 f \n';
  for (let i = 0; i < offsets.length; i++) {
    pdfTexto += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfTexto += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return new Blob([encoder.encode(pdfTexto)], { type: 'application/pdf' });
}

/**
 * Descarga el reporte consolidado de existencias en formato PDF estándar (HU-6.6).
 * Respeta exactamente los ítems visibles en pantalla y los criterios/filtros aplicados.
 * Devuelve false si no hay registros para prevenir descargas inconsistentes.
 */
export function descargarReporteInventarioPdf(
  dataOItems: ReporteInventarioResultado | ItemReporteInventario[],
  resumenOFiltro?: ResumenInventarioReporte | string | null,
  filtroTextoParam?: string,
  nombreArchivo?: string,
): boolean {
  let items: ItemReporteInventario[] = [];
  let filtroTexto = 'Todos los registros';

  if (Array.isArray(dataOItems)) {
    items = dataOItems;
    if (typeof resumenOFiltro === 'string') {
      filtroTexto = resumenOFiltro;
    } else if (typeof filtroTextoParam === 'string') {
      filtroTexto = filtroTextoParam;
    }
  } else if (dataOItems && Array.isArray(dataOItems.items)) {
    items = dataOItems.items;
    if (typeof resumenOFiltro === 'string') {
      filtroTexto = resumenOFiltro;
    } else if (typeof filtroTextoParam === 'string') {
      filtroTexto = filtroTextoParam;
    }
  }

  if (!items || items.length === 0) {
    return false;
  }

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;

  function write(cmd: string) {
    currentStream.push(cmd);
  }

  function startPage(isFirst = false) {
    if (!isFirst) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      y = 740;
    }

    // Encabezado corporativo
    write('0.42 0.12 0.13 rg'); // #6b1f22
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (REPORTE CONSOLIDADO DE INVENTARIO) Tj ET');
    write('0.4 0.4 0.4 rg');
    const ahora = new Date().toLocaleString('es-CO');
    write(`BT /F1 8 Tf 40 722 Td (Generado el: ${sanitizarTextoPdf(ahora)} | Criterio: ${sanitizarTextoPdf(filtroTexto)}) Tj ET`);
    write('0 0 0 rg');

    if (isFirst) {
      write('0.95 0.95 0.95 rg');
      write('40 680 532 30 re f');
      write('0.8 0.8 0.8 RG 0.5 w');
      write('40 680 532 30 re s');
      write('0 0 0 rg');
      const total = items.length;
      const prods = items.filter((i) => i.tipo_item === 'PRODUCTO').length;
      const insumos = items.filter((i) => i.tipo_item === 'INSUMO').length;
      const bajos = items.filter((i) => i.estado_stock === 'BAJO').length;
      const agotados = items.filter((i) => i.estado_stock === 'AGOTADO').length;
      const resTxt = `Registros mostrados: ${total}  |  Productos: ${prods}  |  Insumos: ${insumos}  |  Bajo stock: ${bajos}  |  Agotados: ${agotados}`;
      write(`BT /F2 8.5 Tf 48 692 Td (${sanitizarTextoPdf(resTxt)}) Tj ET`);
      y = 665;
    } else {
      y = 705;
    }

    // Cabecera de tabla
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.7 0.7 0.7 RG 0.5 w');
    write(`40 ${y - 14} 532 16 re s`);
    write('0.2 0.2 0.2 rg');
    write(`BT /F2 7.5 Tf 44 ${y - 10} Td (ID) Tj ET`);
    write(`BT /F2 7.5 Tf 75 ${y - 10} Td (NOMBRE) Tj ET`);
    write(`BT /F2 7.5 Tf 250 ${y - 10} Td (TIPO) Tj ET`);
    write(`BT /F2 7.5 Tf 315 ${y - 10} Td (CATEGORIA) Tj ET`);
    write(`BT /F2 7.5 Tf 405 ${y - 10} Td (STOCK) Tj ET`);
    write(`BT /F2 7.5 Tf 445 ${y - 10} Td (MIN) Tj ET`);
    write(`BT /F2 7.5 Tf 480 ${y - 10} Td (ESTADO) Tj ET`);
    write(`BT /F2 7.5 Tf 525 ${y - 10} Td (P. VENTA) Tj ET`);
    write('0 0 0 rg');
    y -= 26;
  }

  startPage(true);

  for (let i = 0; i < items.length; i++) {
    const item: ItemReporteInventario = items[i];
    if (y < 55) {
      startPage(false);
    }

    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }

    write('0.9 0.9 0.9 RG 0.3 w');
    write(`40 ${y - 3} m 572 ${y - 3} l S`);

    write(`BT /F1 7.5 Tf 44 ${y} Td (#${item.id_item}) Tj ET`);
    const nombre = item.nombre.length > 32 ? item.nombre.substring(0, 30) + '..' : item.nombre;
    write(`BT /F2 7.5 Tf 75 ${y} Td (${sanitizarTextoPdf(nombre)}) Tj ET`);
    write(`BT /F1 7.5 Tf 250 ${y} Td (${sanitizarTextoPdf(item.tipo_item)}) Tj ET`);
    const cat = (item.categoria || '-').substring(0, 16);
    write(`BT /F1 7.5 Tf 315 ${y} Td (${sanitizarTextoPdf(cat)}) Tj ET`);
    write(`BT /F2 7.5 Tf 405 ${y} Td (${item.cantidad_stock}) Tj ET`);
    write(`BT /F1 7.5 Tf 445 ${y} Td (${item.stock_minimo}) Tj ET`);

    if (item.estado_stock === 'AGOTADO') {
      write('0.85 0.1 0.1 rg');
    } else if (item.estado_stock === 'BAJO') {
      write('0.8 0.5 0.0 rg');
    } else {
      write('0.1 0.6 0.2 rg');
    }
    write(`BT /F2 7.5 Tf 480 ${y} Td (${sanitizarTextoPdf(item.estado_stock)}) Tj ET`);
    write('0 0 0 rg');

    const pVenta = item.tipo_item === 'PRODUCTO' ? `$${Number(item.precio_venta).toLocaleString('es-CO')}` : '-';
    write(`BT /F1 7.5 Tf 525 ${y} Td (${sanitizarTextoPdf(pVenta)}) Tj ET`);

    y -= 14;
  }

  pageStreams.push(currentStream.join('\n'));
  const blob = ensamblarPdf(pageStreams);

  const hoy = new Date().toISOString().split('T')[0];
  const nombreFinal = nombreArchivo || `reporte-inventario-${hoy}.pdf`;
  dispararDescargaBlob(blob, nombreFinal);
  return true;
}

/**
 * Descarga el historial de pedidos en formato PDF estándar (HU-6.6 integrado en reportes existentes).
 * Devuelve false si la lista está vacía para evitar inconsistencias.
 */
export function descargarHistorialPedidosPdf(
  pedidos: PedidoHistorial[],
  resumen: { pedidos: number; ventas: number; total_vendido: number },
  filtrosTexto = 'Todos los pedidos',
  nombreArchivo?: string,
): boolean {
  if (!pedidos || pedidos.length === 0) {
    return false;
  }

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;

  function write(cmd: string) {
    currentStream.push(cmd);
  }

  function startPage(isFirst = false) {
    if (!isFirst) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      y = 740;
    }

    // Encabezado corporativo
    write('0.42 0.12 0.13 rg'); // #6b1f22
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (HISTORIAL DE PEDIDOS Y VENTAS) Tj ET');
    write('0.4 0.4 0.4 rg');
    const ahora = new Date().toLocaleString('es-CO');
    write(`BT /F1 8 Tf 40 722 Td (Generado el: ${sanitizarTextoPdf(ahora)} | Criterio: ${sanitizarTextoPdf(filtrosTexto)}) Tj ET`);
    write('0 0 0 rg');

    if (isFirst && resumen) {
      write('0.95 0.95 0.95 rg');
      write('40 680 532 30 re f');
      write('0.8 0.8 0.8 RG 0.5 w');
      write('40 680 532 30 re s');
      write('0 0 0 rg');
      const resTxt = `Pedidos: ${resumen.pedidos}  |  Ventas concretadas: ${resumen.ventas}  |  Total vendido: $${resumen.total_vendido.toLocaleString('es-CO')}`;
      write(`BT /F2 8.5 Tf 48 692 Td (${sanitizarTextoPdf(resTxt)}) Tj ET`);
      y = 665;
    } else {
      y = 705;
    }

    // Cabecera de tabla
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.7 0.7 0.7 RG 0.5 w');
    write(`40 ${y - 14} 532 16 re s`);
    write('0.2 0.2 0.2 rg');
    write(`BT /F2 7.5 Tf 44 ${y - 10} Td (PEDIDO) Tj ET`);
    write(`BT /F2 7.5 Tf 85 ${y - 10} Td (FECHA / HORA) Tj ET`);
    write(`BT /F2 7.5 Tf 170 ${y - 10} Td (MESA) Tj ET`);
    write(`BT /F2 7.5 Tf 225 ${y - 10} Td (PRODUCTOS) Tj ET`);
    write(`BT /F2 7.5 Tf 435 ${y - 10} Td (ESTADO) Tj ET`);
    write(`BT /F2 7.5 Tf 505 ${y - 10} Td (TOTAL) Tj ET`);
    write('0 0 0 rg');
    y -= 26;
  }

  startPage(true);

  for (let i = 0; i < pedidos.length; i++) {
    const p: PedidoHistorial = pedidos[i];
    if (y < 55) {
      startPage(false);
    }

    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }

    write('0.9 0.9 0.9 RG 0.3 w');
    write(`40 ${y - 3} m 572 ${y - 3} l S`);

    write(`BT /F2 7.5 Tf 44 ${y} Td (#${p.id_pedido}) Tj ET`);
    const fh = new Date(p.fecha_hora).toLocaleDateString('es-CO');
    write(`BT /F1 7.5 Tf 85 ${y} Td (${sanitizarTextoPdf(fh)}) Tj ET`);
    const mesa = p.numero_mesa ? `Mesa ${p.numero_mesa}` : 'Para llevar';
    write(`BT /F1 7.5 Tf 170 ${y} Td (${sanitizarTextoPdf(mesa)}) Tj ET`);
    const prods = p.productos.map((x) => `${x.cantidad}x ${x.nombre}`).join(', ');
    const prodsTxt = prods.length > 38 ? prods.substring(0, 36) + '..' : prods;
    write(`BT /F1 7.5 Tf 225 ${y} Td (${sanitizarTextoPdf(prodsTxt)}) Tj ET`);
    write(`BT /F2 7.5 Tf 435 ${y} Td (${sanitizarTextoPdf(p.estado_pedido)}) Tj ET`);
    const tot = `$${Number(p.total_calculado).toLocaleString('es-CO')}`;
    write(`BT /F2 7.5 Tf 505 ${y} Td (${sanitizarTextoPdf(tot)}) Tj ET`);

    y -= 14;
  }

  pageStreams.push(currentStream.join('\n'));
  const blob = ensamblarPdf(pageStreams);

  const hoy = new Date().toISOString().split('T')[0];
  const nombreFinal = nombreArchivo || `historial-pedidos-${hoy}.pdf`;
  dispararDescargaBlob(blob, nombreFinal);
  return true;
}


import {
  formatoCop,
  ReporteFinanciero,
  ReporteProductosMasVendidos,
  ReporteVentas,
  ResumenPeriodo,
  TEXTO_MEDIO,
} from '../models/reportes.model';

/**
 * Descarga el resumen de operaciones por período en formato PDF estándar.
 */
export function descargarReporteResumenPdf(
  resumen: ResumenPeriodo,
  rangoTexto = '',
  nombreArchivo?: string,
): boolean {
  if (!resumen || resumen.sin_operaciones) {
    return false;
  }

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;

  function write(cmd: string) {
    currentStream.push(cmd);
  }

  function startPage(isFirst = false) {
    if (!isFirst) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      y = 740;
    }

    // Encabezado corporativo
    write('0.42 0.12 0.13 rg'); // #6b1f22
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (REPORTE RESUMEN DE OPERACIONES POR PERIODO) Tj ET');
    write('0.4 0.4 0.4 rg');
    const ahora = new Date().toLocaleString('es-CO');
    const periodoTxt = rangoTexto || `${resumen.desde} a ${resumen.hasta}`;
    write(`BT /F1 8 Tf 40 722 Td (Generado el: ${sanitizarTextoPdf(ahora)} | Periodo: ${sanitizarTextoPdf(periodoTxt)}) Tj ET`);
    write('0 0 0 rg');

    if (isFirst) {
      // Caja de cifras clave
      write('0.95 0.95 0.95 rg');
      write('40 660 532 50 re f');
      write('0.8 0.8 0.8 RG 0.5 w');
      write('40 660 532 50 re s');
      write('0 0 0 rg');

      const fila1 = `Ventas Acumuladas: $${resumen.ventas.total.toLocaleString('es-CO')} (${resumen.ventas.cantidad} pedidos)  |  Ticket Promedio: $${resumen.ventas.ticket_promedio.toLocaleString('es-CO')}`;
      const fila2 = `Pedidos Registrados: ${resumen.pedidos.total} (${resumen.pedidos.en_curso} en curso)  |  Pedidos Anulados: ${resumen.anulados.cantidad} ($${resumen.anulados.total.toLocaleString('es-CO')})`;
      const fila3 = resumen.otros_ingresos.cantidad > 0
        ? `Otros Ingresos: $${resumen.otros_ingresos.total.toLocaleString('es-CO')} (${resumen.otros_ingresos.cantidad} movimientos manuales)`
        : '';

      write(`BT /F2 8.5 Tf 48 694 Td (${sanitizarTextoPdf(fila1)}) Tj ET`);
      write(`BT /F2 8.5 Tf 48 678 Td (${sanitizarTextoPdf(fila2)}) Tj ET`);
      if (fila3) {
        write(`BT /F1 8 Tf 48 664 Td (${sanitizarTextoPdf(fila3)}) Tj ET`);
      }
      y = 635;
    } else {
      y = 705;
    }

    // Cabecera de tabla
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.7 0.7 0.7 RG 0.5 w');
    write(`40 ${y - 14} 532 16 re s`);
    write('0.2 0.2 0.2 rg');
    write(`BT /F2 7.5 Tf 44 ${y - 10} Td (FECHA) Tj ET`);
    write(`BT /F2 7.5 Tf 170 ${y - 10} Td (PEDIDOS) Tj ET`);
    write(`BT /F2 7.5 Tf 260 ${y - 10} Td (VENTAS COBRADAS) Tj ET`);
    write(`BT /F2 7.5 Tf 380 ${y - 10} Td (TOTAL VENDIDO) Tj ET`);
    write(`BT /F2 7.5 Tf 490 ${y - 10} Td (ANULADOS) Tj ET`);
    write('0 0 0 rg');
    y -= 26;
  }

  startPage(true);

  const dias = (resumen.por_dia || []).filter((d) => d.pedidos > 0);
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    if (y < 55) {
      startPage(false);
    }

    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }

    write('0.9 0.9 0.9 RG 0.3 w');
    write(`40 ${y - 3} m 572 ${y - 3} l S`);

    write(`BT /F2 7.5 Tf 44 ${y} Td (${sanitizarTextoPdf(d.fecha)}) Tj ET`);
    write(`BT /F1 7.5 Tf 170 ${y} Td (${d.pedidos}) Tj ET`);
    write(`BT /F1 7.5 Tf 260 ${y} Td (${d.ventas}) Tj ET`);
    write(`BT /F2 7.5 Tf 380 ${y} Td ($${Number(d.total_vendido).toLocaleString('es-CO')}) Tj ET`);
    write(`BT /F1 7.5 Tf 490 ${y} Td (${d.anulados}) Tj ET`);

    y -= 14;
  }

  pageStreams.push(currentStream.join('\n'));
  const blob = ensamblarPdf(pageStreams);
  const nombreFinal = nombreArchivo || `reporte-resumen-${resumen.desde}-al-${resumen.hasta}.pdf`;
  dispararDescargaBlob(blob, nombreFinal);
  return true;
}

/**
 * Descarga el reporte general de ventas en formato PDF estándar.
 */
export function descargarReporteVentasPdf(
  reporte: ReporteVentas,
  rangoTexto = '',
  nombreArchivo?: string,
): boolean {
  if (!reporte || reporte.sin_ventas || !reporte.ventas || reporte.ventas.length === 0) {
    return false;
  }

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;

  function write(cmd: string) {
    currentStream.push(cmd);
  }

  function startPage(isFirst = false) {
    if (!isFirst) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      y = 740;
    }

    // Encabezado corporativo
    write('0.42 0.12 0.13 rg'); // #6b1f22
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (REPORTE GENERAL DE VENTAS FINALIZADAS) Tj ET');
    write('0.4 0.4 0.4 rg');
    const ahora = new Date().toLocaleString('es-CO');
    const periodoTxt = rangoTexto || `${reporte.desde} a ${reporte.hasta}`;
    write(`BT /F1 8 Tf 40 722 Td (Generado el: ${sanitizarTextoPdf(ahora)} | Periodo: ${sanitizarTextoPdf(periodoTxt)}) Tj ET`);
    write('0 0 0 rg');

    if (isFirst) {
      write('0.95 0.95 0.95 rg');
      write('40 660 532 50 re f');
      write('0.8 0.8 0.8 RG 0.5 w');
      write('40 660 532 50 re s');
      write('0 0 0 rg');

      const resTxt = `Total Vendido: $${reporte.resumen.total_vendido.toLocaleString('es-CO')}  |  Ventas Pagadas: ${reporte.resumen.ventas}  |  Ticket Promedio: $${reporte.resumen.ticket_promedio.toLocaleString('es-CO')}`;
      write(`BT /F2 8.5 Tf 48 692 Td (${sanitizarTextoPdf(resTxt)}) Tj ET`);

      const mediosTxt = (reporte.por_medio_pago || [])
        .map((m) => `${TEXTO_MEDIO[m.medio_pago] || m.medio_pago}: $${m.total.toLocaleString('es-CO')} (${m.ventas})`)
        .join('  |  ');
      if (mediosTxt) {
        const mediosSafe = mediosTxt.length > 95 ? mediosTxt.substring(0, 92) + '...' : mediosTxt;
        write(`BT /F1 7.5 Tf 48 672 Td (Por medio: ${sanitizarTextoPdf(mediosSafe)}) Tj ET`);
      }
      y = 635;
    } else {
      y = 705;
    }

    // Cabecera de tabla
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.7 0.7 0.7 RG 0.5 w');
    write(`40 ${y - 14} 532 16 re s`);
    write('0.2 0.2 0.2 rg');
    write(`BT /F2 7.5 Tf 44 ${y - 10} Td (PEDIDO) Tj ET`);
    write(`BT /F2 7.5 Tf 95 ${y - 10} Td (FECHA / HORA) Tj ET`);
    write(`BT /F2 7.5 Tf 205 ${y - 10} Td (MESA) Tj ET`);
    write(`BT /F2 7.5 Tf 285 ${y - 10} Td (MESERO) Tj ET`);
    write(`BT /F2 7.5 Tf 395 ${y - 10} Td (MEDIO DE PAGO) Tj ET`);
    write(`BT /F2 7.5 Tf 495 ${y - 10} Td (TOTAL) Tj ET`);
    write('0 0 0 rg');
    y -= 26;
  }

  startPage(true);

  for (let i = 0; i < (reporte.ventas || []).length; i++) {
    const v = reporte.ventas[i];
    if (y < 55) {
      startPage(false);
    }

    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }

    write('0.9 0.9 0.9 RG 0.3 w');
    write(`40 ${y - 3} m 572 ${y - 3} l S`);

    write(`BT /F2 7.5 Tf 44 ${y} Td (#${v.id_pedido}) Tj ET`);
    const fh = new Date(v.fecha_hora).toLocaleDateString('es-CO');
    write(`BT /F1 7.5 Tf 95 ${y} Td (${sanitizarTextoPdf(fh)}) Tj ET`);
    const mesa = v.numero_mesa ? `Mesa ${v.numero_mesa}` : 'Para llevar';
    write(`BT /F1 7.5 Tf 205 ${y} Td (${sanitizarTextoPdf(mesa)}) Tj ET`);
    const mesero = (v.mesero || '-').substring(0, 18);
    write(`BT /F1 7.5 Tf 285 ${y} Td (${sanitizarTextoPdf(mesero)}) Tj ET`);
    const medio = TEXTO_MEDIO[v.medio_pago] || v.medio_pago;
    write(`BT /F1 7.5 Tf 395 ${y} Td (${sanitizarTextoPdf(medio)}) Tj ET`);
    const tot = `$${Number(v.total).toLocaleString('es-CO')}`;
    write(`BT /F2 7.5 Tf 495 ${y} Td (${sanitizarTextoPdf(tot)}) Tj ET`);

    y -= 14;
  }

  pageStreams.push(currentStream.join('\n'));
  const blob = ensamblarPdf(pageStreams);
  const nombreFinal = nombreArchivo || `reporte-ventas-${reporte.desde}-al-${reporte.hasta}.pdf`;
  dispararDescargaBlob(blob, nombreFinal);
  return true;
}

/**
 * Descarga el reporte de productos más vendidos en formato PDF estándar (HU-6.3, HU-6.6).
 */
export function descargarReporteProductosPdf(
  reporte: ReporteProductosMasVendidos,
  rangoTexto = '',
  nombreArchivo?: string,
): boolean {
  if (!reporte || reporte.sin_ventas || !reporte.productos || reporte.productos.length === 0) {
    return false;
  }

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;

  function write(cmd: string) {
    currentStream.push(cmd);
  }

  function startPage(isFirst = false) {
    if (!isFirst) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      y = 740;
    }

    // Encabezado corporativo
    write('0.42 0.12 0.13 rg'); // #6b1f22
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (REPORTE DE PRODUCTOS MAS VENDIDOS) Tj ET');
    write('0.4 0.4 0.4 rg');
    const ahora = new Date().toLocaleString('es-CO');
    const periodoTxt = rangoTexto || `${reporte.desde} a ${reporte.hasta}`;
    write(`BT /F1 8 Tf 40 722 Td (Generado el: ${sanitizarTextoPdf(ahora)} | Periodo: ${sanitizarTextoPdf(periodoTxt)}) Tj ET`);
    write('0 0 0 rg');

    if (isFirst) {
      write('0.95 0.95 0.95 rg');
      write('40 665 532 45 re f');
      write('0.8 0.8 0.8 RG 0.5 w');
      write('40 665 532 45 re s');
      write('0 0 0 rg');

      const resTxt = `Total Unidades Vendidas: ${reporte.total_unidades}  |  Total Recaudado: $${reporte.total_recaudado.toLocaleString('es-CO')}  |  Productos en Ranking: ${reporte.productos.length}`;
      write(`BT /F2 8.5 Tf 48 688 Td (${sanitizarTextoPdf(resTxt)}) Tj ET`);
      y = 635;
    } else {
      y = 705;
    }

    // Cabecera de tabla
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.7 0.7 0.7 RG 0.5 w');
    write(`40 ${y - 14} 532 16 re s`);
    write('0.2 0.2 0.2 rg');
    write(`BT /F2 7.5 Tf 44 ${y - 10} Td (POS) Tj ET`);
    write(`BT /F2 7.5 Tf 95 ${y - 10} Td (PRODUCTO) Tj ET`);
    write(`BT /F2 7.5 Tf 370 ${y - 10} Td (UNIDADES VENDIDAS) Tj ET`);
    write(`BT /F2 7.5 Tf 475 ${y - 10} Td (TOTAL RECAUDADO) Tj ET`);
    write('0 0 0 rg');
    y -= 26;
  }

  startPage(true);

  for (let i = 0; i < (reporte.productos || []).length; i++) {
    const p = reporte.productos[i];
    if (y < 55) {
      startPage(false);
    }

    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }

    write('0.9 0.9 0.9 RG 0.3 w');
    write(`40 ${y - 3} m 572 ${y - 3} l S`);

    write(`BT /F2 7.5 Tf 44 ${y} Td (#${p.posicion}) Tj ET`);
    const nombre = (p.nombre || '-').substring(0, 40);
    write(`BT /F1 7.5 Tf 95 ${y} Td (${sanitizarTextoPdf(nombre)}) Tj ET`);
    write(`BT /F2 7.5 Tf 370 ${y} Td (${p.unidades_vendidas}) Tj ET`);
    const tot = `$${Number(p.total_recaudado).toLocaleString('es-CO')}`;
    write(`BT /F2 7.5 Tf 475 ${y} Td (${sanitizarTextoPdf(tot)}) Tj ET`);

    y -= 14;
  }

  pageStreams.push(currentStream.join('\n'));
  const blob = ensamblarPdf(pageStreams);
  const nombreFinal = nombreArchivo || `reporte-productos-${reporte.desde}-al-${reporte.hasta}.pdf`;
  dispararDescargaBlob(blob, nombreFinal);
  return true;
}

/**
 * HU-6.4 · Descarga el reporte financiero (balance, medios de pago y movimientos) en PDF.
 * Usa los totales que calculó el backend; no recalcula nada.
 */
export function descargarReporteFinancieroPdf(
  reporte: ReporteFinanciero,
  rangoTexto = '',
  nombreArchivo?: string,
): boolean {
  if (!reporte || reporte.sin_movimientos) return false;

  const pageStreams: string[] = [];
  let currentStream: string[] = [];
  let y = 740;
  const write = (cmd: string) => currentStream.push(cmd);
  const texto = (fuente: 'F1' | 'F2', tam: number, x: number, yy: number, t: string) =>
    write(`BT /${fuente} ${tam} Tf ${x} ${yy} Td (${sanitizarTextoPdf(t)}) Tj ET`);

  function encabezado() {
    write('0.42 0.12 0.13 rg');
    write('BT /F2 14 Tf 40 750 Td (CHORI COMPANY - SISTEMA DE GESTION) Tj ET');
    write('0 0 0 rg');
    write('BT /F2 10 Tf 40 735 Td (REPORTE FINANCIERO DE INGRESOS Y EGRESOS) Tj ET');
    write('0.4 0.4 0.4 rg');
    const periodoTxt = rangoTexto || `${reporte.desde} a ${reporte.hasta}`;
    texto('F1', 8, 40, 722, `Generado el: ${new Date().toLocaleString('es-CO')} | Periodo: ${periodoTxt}`);
    write('0 0 0 rg');
  }

  function cabeceraTabla() {
    write('0.9 0.9 0.9 rg');
    write(`40 ${y - 14} 532 16 re f`);
    write('0.2 0.2 0.2 rg');
    texto('F2', 7.5, 44, y - 10, 'FECHA');
    texto('F2', 7.5, 110, y - 10, 'CONCEPTO');
    texto('F2', 7.5, 330, y - 10, 'TIPO');
    texto('F2', 7.5, 390, y - 10, 'MEDIO DE PAGO');
    texto('F2', 7.5, 495, y - 10, 'MONTO');
    write('0 0 0 rg');
    y -= 26;
  }

  encabezado();

  // Balance
  write('0.95 0.95 0.95 rg');
  write('40 640 532 70 re f');
  write('0 0 0 rg');
  texto('F2', 9, 48, 692, `Ingresos: ${formatoCop(reporte.ingresos.total)}   |   Egresos: ${formatoCop(reporte.egresos.total)}   |   Saldo neto: ${formatoCop(reporte.saldo_neto)}`);
  texto('F1', 8, 48, 677, `Ventas: ${formatoCop(reporte.ingresos.ventas)}  |  Otros ingresos: ${formatoCop(reporte.ingresos.manuales)}  |  Efectivo: ${formatoCop(reporte.ingresos.efectivo)}  |  No efectivo: ${formatoCop(reporte.ingresos.no_efectivo)}`);
  const medios = reporte.ingresos.por_medio_pago.map((m) => `${TEXTO_MEDIO[m.medio_pago] || m.medio_pago}: ${formatoCop(m.total)}`).join('  |  ');
  texto('F1', 7.5, 48, 663, `Por medio: ${medios}`);
  texto('F1', 7.5, 48, 649, `Consumo interno (no afecta el saldo): ${formatoCop(reporte.consumo_interno.total_valorizado)} - ${reporte.consumo_interno.unidades} unidades a costo actual`);
  y = 620;
  cabeceraTabla();

  reporte.movimientos.forEach((m, i) => {
    if (y < 55) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      encabezado();
      y = 705;
      cabeceraTabla();
    }
    if (i % 2 === 1) {
      write('0.98 0.98 0.98 rg');
      write(`40 ${y - 3} 532 14 re f`);
      write('0 0 0 rg');
    }
    texto('F1', 7.5, 44, y, new Date(m.fecha_hora).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }));
    texto('F1', 7.5, 110, y, m.concepto.substring(0, 42));
    texto('F1', 7.5, 330, y, m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso');
    texto('F1', 7.5, 390, y, TEXTO_MEDIO[m.medio_pago] || m.medio_pago);
    texto('F2', 7.5, 495, y, `${m.tipo === 'EGRESO' ? '-' : ''}${formatoCop(m.monto)}`);
    y -= 14;
  });

  if (reporte.movimientos_truncados) {
    if (y < 55) {
      pageStreams.push(currentStream.join('\n'));
      currentStream = [];
      encabezado();
      y = 705;
    }
    texto('F1', 7, 44, y - 4, `Se muestran ${reporte.movimientos.length} de ${reporte.total_movimientos} movimientos. Los totales incluyen todos.`);
  }

  pageStreams.push(currentStream.join('\n'));
  dispararDescargaBlob(ensamblarPdf(pageStreams), nombreArchivo || `reporte-financiero-${reporte.desde}-al-${reporte.hasta}.pdf`);
  return true;
}

/** Escapa un campo CSV (separador ';') */
function campoCsv(valor: string | number): string {
  const s = String(valor);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * HU-6.4 · "Descargar Excel": CSV UTF-8 con BOM y separador ';' (lo abre bien
 * Excel en español sin librerías). Devuelve el texto generado, o null si no hay datos.
 */
export function descargarReporteFinancieroCsv(reporte: ReporteFinanciero, nombreArchivo?: string): string | null {
  if (!reporte || reporte.sin_movimientos) return null;
  const filas: (string | number)[][] = [
    ['Reporte financiero', `${reporte.desde} a ${reporte.hasta}`],
    [],
    ['Ingresos', reporte.ingresos.total],
    ['  Ventas', reporte.ingresos.ventas],
    ['  Otros ingresos', reporte.ingresos.manuales],
    ...reporte.ingresos.por_medio_pago.map((m) => [`  ${TEXTO_MEDIO[m.medio_pago] || m.medio_pago}`, m.total]),
    ['  Efectivo', reporte.ingresos.efectivo],
    ['  No efectivo', reporte.ingresos.no_efectivo],
    ['Egresos', reporte.egresos.total],
    ...reporte.egresos.por_categoria.map((c) => [`  ${c.etiqueta}`, c.total]),
    ['Saldo neto', reporte.saldo_neto],
    ['Consumo interno (no afecta el saldo)', reporte.consumo_interno.total_valorizado],
    ['Compras de inventario (informativo, no incluido en egresos)', reporte.compras_inventario.total],
    [],
    ['Fecha', 'Concepto', 'Tipo', 'Medio de pago', 'Monto'],
    ...reporte.movimientos.map((m) => [
      new Date(m.fecha_hora).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      m.concepto,
      m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso',
      TEXTO_MEDIO[m.medio_pago] || m.medio_pago,
      m.tipo === 'EGRESO' ? -m.monto : m.monto,
    ]),
  ];
  const csv = filas.map((f) => f.map(campoCsv).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  dispararDescargaBlob(blob, nombreArchivo || `reporte-financiero-${reporte.desde}-al-${reporte.hasta}.csv`);
  return csv;
}
