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
