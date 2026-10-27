/**
 * NexoFood Printer — Agente de impresión silenciosa de comandas
 * =============================================================
 * Corre en el PC conectado a la impresora térmica.
 *
 * Características:
 *  - Auto-inicio con Windows (openAtLogin).
 *  - Login gráfico inicial una sola vez (si no hay sesión previa).
 *  - Cifrado de credenciales en disco mediante safeStorage nativo (DPAPI en Windows).
 *  - Auto-reautenticación transparente e invisible si el JWT de 8h expira (cero interrupción al cajero).
 *  - Consulta periódica de comandas pendientes (polling) e impresión 100% silenciosa.
 *  - Configuración externa de impresora y ancho en electron/config.json.
 */

const { app, BrowserWindow, ipcMain, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Cargar configuración ───────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  URL_BACKEND: 'http://localhost:3000',
  NOMBRE_IMPRESORA: '',
  ANCHO_TICKET: '72mm',
  INTERVALO_POLLING_MS: 4000,
};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
  }
} catch (err) {
  console.warn('[WARN] No se pudo leer config.json; usando valores por defecto.', err.message);
}

const API_URL = config.URL_BACKEND;
const PRINTER_NAME = config.NOMBRE_IMPRESORA;
const TICKET_WIDTH = config.ANCHO_TICKET;
const POLL_INTERVAL = config.INTERVALO_POLLING_MS;

// Archivo donde se guardan las credenciales cifradas (en userData del sistema)
function obtenerRutaBoveda() {
  return path.join(app.getPath('userData'), 'session.vault');
}

// ─── Manejo de Sesión Segura (safeStorage / DPAPI) ───────────────────
function guardarCredencialesSeguras(credencial, password) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado seguro del sistema no está disponible en este equipo.');
  }
  const payload = JSON.stringify({ credencial, password });
  const bufferCifrado = safeStorage.encryptString(payload);
  fs.writeFileSync(obtenerRutaBoveda(), bufferCifrado);
}

function leerCredencialesSeguras() {
  const ruta = obtenerRutaBoveda();
  if (!fs.existsSync(ruta)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const bufferCifrado = fs.readFileSync(ruta);
    const textoDescifrado = safeStorage.decryptString(bufferCifrado);
    return JSON.parse(textoDescifrado);
  } catch (err) {
    console.error('[AUTH] No se pudieron descifrar las credenciales guardadas:', err.message);
    return null;
  }
}

// ─── Estado en Memoria ──────────────────────────────────────────────
let tokenActual = null;
let printWindow = null;
let loginWindow = null;
let pollingInterval = null;
let procesando = false;

// ─── Autenticación con el Backend ───────────────────────────────────
async function loginBackend(credencial, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credencial, password }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const mensaje = errorBody.message || `Error de autenticación (HTTP ${res.status})`;
    throw new Error(Array.isArray(mensaje) ? mensaje.join('. ') : mensaje);
  }

  const data = await res.json();
  const token = data.access_token || data.token;
  if (!token) throw new Error('El servidor no retornó un token válido');
  return token;
}

/**
 * Intenta renovar el token automáticamente de forma transparente
 */
async function renovarTokenInvisible() {
  const creds = leerCredencialesSeguras();
  if (!creds) throw new Error('No hay credenciales almacenadas');
  console.log('[AUTH] Renovando token JWT de 8h de forma invisible...');
  tokenActual = await loginBackend(creds.credencial, creds.password);
  console.log('[AUTH] Token renovado con éxito');
  return tokenActual;
}

// ─── Peticiones HTTP Autenticadas (con reintento ante 401) ──────────
async function fetchAutenticado(endpoint, opciones = {}) {
  if (!tokenActual) {
    await renovarTokenInvisible();
  }

  const url = `${API_URL}${endpoint}`;
  let res = await fetch(url, {
    ...opciones,
    headers: {
      ...opciones.headers,
      'Authorization': `Bearer ${tokenActual}`,
      'Content-Type': 'application/json',
    },
  });

  // Si el token expiró (401), se renueva solo una vez y reintenta
  if (res.status === 401) {
    console.warn('[AUTH] Token expirado (401). Autenticando automáticamente...');
    await renovarTokenInvisible();
    res = await fetch(url, {
      ...opciones,
      headers: {
        ...opciones.headers,
        'Authorization': `Bearer ${tokenActual}`,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

async function fetchPendientes() {
  return fetchAutenticado('/kitchen/comandas/pendientes');
}

async function reportarEstado(idComanda, estado) {
  return fetchAutenticado(`/kitchen/comandas/${idComanda}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado_impresion: estado }),
  });
}

// Las notas las escribe el mesero: se escapan antes de insertarlas en el HTML del ticket
function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Generación del Ticket HTML (Tipografía monoespaciada) ──────────
function generarTicketHTML(comanda) {
  const p = comanda.pedido || {};
  const detalles = p.detalles || [];
  const mesero = p.mesero?.nombre || 'N/A';
  const mesa = p.numero_mesa ? `MESA ${p.numero_mesa}` : 'PARA LLEVAR';
  const hora = p.fecha_hora
    ? new Date(p.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '';

  // HU-3.2: el backend envía `lineas_cocina` ya formateadas:
  //   ["2x CHORIPAN PAMPERO", "+ Chimi Rojo", "+ Combo con papa", "** SIN CEBOLLA **"]
  // La primera línea es el producto; las que empiezan con "+" son adicionales/combos
  // y las que van entre "**" son notas de cocina (resaltadas).
  // HU-4.3: versión de la comanda y cambios respecto a la versión anterior
  const version = Number(comanda.version) || 1;
  const cambios = Array.isArray(comanda.cambios) ? comanda.cambios : [];
  const bloqueCambios = version > 1 && cambios.length > 0
    ? `<div class="cambios">
    <div class="bold">*** CAMBIOS v${version} ***</div>
    ${cambios.map((c) => `<div class="adicional">${escaparHtml(c.texto || '')}</div>`).join('')}
  </div>
  <hr>`
    : '';

  const lineasProductos = detalles.map((d) => {
    const lineas = Array.isArray(d.lineas_cocina) && d.lineas_cocina.length > 0
      ? d.lineas_cocina
      : [
          `${d.cantidad}x ${d.item?.nombre || 'Producto'}`,
          ...(d.promocion_aplicada ? [`+ ${d.promocion_aplicada}`] : []),
          ...(d.notas_especiales ? [`** ${String(d.notas_especiales).toUpperCase()} **`] : []),
        ];
    return lineas.map((texto, i) => {
      if (i === 0) return `<div class="fila bold"><span>${escaparHtml(texto)}</span></div>`;
      if (texto.startsWith('**')) return `<div class="nota-cocina">${escaparHtml(texto)}</div>`;
      return `<div class="adicional">${escaparHtml(texto)}</div>`;
    }).join('');
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${TICKET_WIDTH};
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.25;
      color: #000000;
      padding: 4px;
    }
    .centrado { text-align: center; }
    .bold { font-weight: bold; }
    .small { font-size: 11px; }
    .fila { display: flex; justify-content: space-between; margin: 3px 0; word-break: break-word; }
    .nota { font-size: 11px; margin-left: 8px; font-style: italic; }
    .adicional { font-size: 12px; margin: 1px 0 1px 10px; }
    .cambios { border: 1px dashed #000000; padding: 4px; }
    .nota-cocina { font-size: 13px; font-weight: bold; margin: 2px 0 2px 10px; }
    hr { border: none; border-top: 1px dashed #000000; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="centrado bold">CHORI COMPANY</div>
  <div class="centrado">${version > 1 ? `COMANDA ACTUALIZADA v${version}` : 'COMANDA DE COCINA'}</div>
  <hr>
  <div class="fila"><span>PEDIDO</span><span>#${p.id_pedido || '?'}</span></div>
  <div class="fila"><span>UBICACIÓN</span><span>${mesa}</span></div>
  <div class="fila"><span>MESERO</span><span>${mesero}</span></div>
  <div class="fila"><span>HORA</span><span>${hora}</span></div>
  <hr>
  ${bloqueCambios}
  ${lineasProductos}
  <hr>
  <div class="centrado small">Impreso ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} · v${version}</div>
</body>
</html>`;
}

// ─── Impresión Silenciosa ───────────────────────────────────────────
function imprimirComanda(comanda) {
  return new Promise((resolve, reject) => {
    const html = generarTicketHTML(comanda);

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .then(() => {
        const printOptions = {
          silent: true,
          printBackground: false,
          margins: { marginType: 'none' },
        };
        if (PRINTER_NAME) {
          printOptions.deviceName = PRINTER_NAME;
        }

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'Error al enviar a la impresora'));
          }
        });
      })
      .catch(reject);
  });
}

function notificar(titulo, cuerpo) {
  if (Notification.isSupported()) {
    new Notification({ title, body: cuerpo }).show();
  }
}

// ─── Ciclo de Sondeo (Polling) ──────────────────────────────────────
async function procesarPendientes() {
  if (procesando || !tokenActual) return;
  procesando = true;

  try {
    const pendientes = await fetchPendientes();

    for (const comanda of pendientes) {
      try {
        await imprimirComanda(comanda);
        await reportarEstado(comanda.id_comanda, 'IMPRESA');
        console.log(`[OK] Comanda #${comanda.id_comanda} (Pedido #${comanda.id_pedido}) impresa silenciosamente`);
      } catch (err) {
        await reportarEstado(comanda.id_comanda, 'ERROR').catch(() => {});
        const errDesc = `Pedido #${comanda.id_pedido}: ${err.message}`;
        console.error(`[ERROR] ${errDesc}`);
        notificar('NexoFood — Error de Impresión', errDesc);
      }
    }
  } catch (err) {
    console.warn(`[WARN] Polling: ${err.message}`);
  }

  procesando = false;
}

function iniciarAgenteImpresion() {
  if (pollingInterval) clearInterval(pollingInterval);

  console.log('══════════════════════════════════════════════════');
  console.log('  NexoFood Printer — Agente de impresión activo');
  console.log(`  Backend:   ${API_URL}`);
  console.log(`  Impresora: ${PRINTER_NAME || '(predeterminada del sistema)'}`);
  console.log(`  Ancho:     ${TICKET_WIDTH}`);
  console.log(`  Intervalo: ${POLL_INTERVAL / 1000}s`);
  console.log('══════════════════════════════════════════════════');

  procesarPendientes();
  pollingInterval = setInterval(procesarPendientes, POLL_INTERVAL);
}

// ─── Ventana de Login ───────────────────────────────────────────────
function mostrarVentanaLogin() {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 380,
    height: 480,
    resizable: false,
    maximizable: false,
    minimizable: true,
    title: 'NexoFood — Agente de Impresión',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loginWindow.setMenuBarVisibility(false);
  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

// IPC: Recibe login desde la pantalla HTML
ipcMain.handle('login', async (_event, { credencial, password }) => {
  try {
    const token = await loginBackend(credencial, password);
    tokenActual = token;

    // Guardar credenciales cifradas con DPAPI en disco
    guardarCredencialesSeguras(credencial, password);

    // Cerrar la ventana de login y arrancar el agente silencioso
    if (loginWindow) {
      loginWindow.close();
      loginWindow = null;
    }

    iniciarAgenteImpresion();
    notificar('NexoFood Printer', 'Agente de impresión conectado y activo.');
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err.message };
  }
});

// ─── Ciclo de Vida de Electron ──────────────────────────────────────
app.whenReady().then(async () => {
  // Configurar auto-inicio con Windows al encender el PC
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: 'NexoFood Printer',
    });
  } catch (err) {
    console.warn('[WARN] No se pudo configurar auto-inicio:', err.message);
  }

  // Ventana oculta para renderizar tickets HTML e imprimir silenciosamente
  printWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 600,
    webPreferences: {
      contextIsolation: true,
    },
  });

  // Intentar arranque automático si ya hay sesión previa guardada
  const credsGuardadas = leerCredencialesSeguras();
  if (credsGuardadas) {
    try {
      console.log('[AUTH] Sesión guardada encontrada. Autenticando con safeStorage...');
      tokenActual = await loginBackend(credsGuardadas.credencial, credsGuardadas.password);
      console.log('[AUTH] Autenticación automática exitosa.');
      iniciarAgenteImpresion();
      return;
    } catch (err) {
      console.warn('[AUTH] La sesión guardada falló o cambió la contraseña:', err.message);
    }
  }

  // Si no hay sesión previa o falló, mostrar la ventana de login por única vez
  mostrarVentanaLogin();
});

app.on('window-all-closed', (e) => {
  // Mantener el proceso vivo en segundo plano aunque se cierre la ventana de login
  e.preventDefault();
});

app.on('before-quit', () => {
  if (pollingInterval) clearInterval(pollingInterval);
});
