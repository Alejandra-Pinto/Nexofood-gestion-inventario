/**
 * NexoFood Printer — Agente de impresión silenciosa de comandas
 * =============================================================
 * Corre en el PC conectado a la impresora térmica.
 *
 * Características:
 *  - Ícono en la bandeja del sistema (System Tray junto al reloj de Windows).
 *  - Indicador de estado en tiempo real (Conectado / Desconectado).
 *  - Notificaciones nativas de Windows para informar al cajero sin necesidad de terminal.
 *  - Auto-inicio con Windows (openAtLogin).
 *  - Cifrado seguro de credenciales con safeStorage (DPAPI nativo).
 *  - Auto-reautenticación transparente.
 *  - Impresión silenciosa y desacoplada de la impresora térmica.
 */

const { app, BrowserWindow, Menu, Tray, ipcMain, Notification, safeStorage, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Fijar identidad y ruta de datos de la app ──────────────────────
app.name = 'nexofood-printer';
app.setAppUserModelId('com.nexofood.printer');
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'nexofood-printer'));
} catch (e) {
  // Ignorar si ya fue inicializado
}

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

function obtenerRutaBoveda() {
  return path.join(app.getPath('userData'), 'session.vault');
}

// ─── Manejo de Sesión Segura (safeStorage / DPAPI) ───────────────────
function guardarCredencialesSeguras(credencial, password) {
  const ruta = obtenerRutaBoveda();
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const payload = JSON.stringify({ credencial, password });
  let buffer;
  if (safeStorage.isEncryptionAvailable()) {
    buffer = safeStorage.encryptString(payload);
  } else {
    buffer = Buffer.from(payload, 'utf-8');
  }
  fs.writeFileSync(ruta, buffer);
  console.log('[AUTH] Credenciales guardadas en bóveda segura:', ruta);
}

function leerCredencialesSeguras() {
  const ruta = obtenerRutaBoveda();
  if (!fs.existsSync(ruta)) {
    console.log('[AUTH] No existe archivo de sesión guardada.');
    return null;
  }

  try {
    const buffer = fs.readFileSync(ruta);
    let texto;
    if (safeStorage.isEncryptionAvailable()) {
      try {
        texto = safeStorage.decryptString(buffer);
      } catch (decErr) {
        console.warn('[AUTH] safeStorage no pudo descifrar con la clave actual, intentando fallback:', decErr.message);
        texto = buffer.toString('utf-8');
      }
    } else {
      texto = buffer.toString('utf-8');
    }

    const parsed = JSON.parse(texto);
    if (parsed && parsed.credencial && parsed.password) {
      console.log(`[AUTH] Sesión guardada encontrada para: ${parsed.credencial}`);
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('[AUTH] No se pudieron leer las credenciales guardadas:', err.message);
    return null;
  }
}

function borrarCredencialesSeguras() {
  const ruta = obtenerRutaBoveda();
  try {
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
  } catch (err) {
    console.warn('[AUTH] Error al limpiar bóveda de sesión:', err.message);
  }
}

// ─── Estado en Memoria y Tray ───────────────────────────────────────
let tokenActual = null;
let printWindow = null;
let loginWindow = null;
let tray = null;
let pollingInterval = null;
let procesando = false;
let estadoConexion = 'Iniciando...'; // 'Conectado' | 'Desconectado' | 'Iniciando...'
let ultimoErrorNotificado = false;

// ─── Notificaciones Nativas ─────────────────────────────────────────
function notificar(titulo, cuerpo) {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: titulo,
        body: cuerpo,
        icon: path.join(__dirname, 'tray-icon.ico'),
      }).show();
    }
  } catch (err) {
    console.warn('[NOTIF] No se pudo mostrar notificación:', err.message);
  }
}

// ─── System Tray (Bandeja del Sistema) ──────────────────────────────
function actualizarTray() {
  if (!tray) return;

  const tooltip = `NexoFood Printer: ${estadoConexion}`;
  tray.setToolTip(tooltip);

  const creds = leerCredencialesSeguras();
  const usuarioInfo = creds ? `Usuario: ${creds.credencial}` : 'Sin sesión iniciada';

  const menu = Menu.buildFromTemplate([
    {
      label: `● Estado: ${estadoConexion}`,
      enabled: false,
    },
    {
      label: usuarioInfo,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '🔄 Reintentar conexión',
      click: () => {
        procesarPendientes();
      },
    },
    {
      label: '👤 Cambiar usuario...',
      click: () => {
        borrarCredencialesSeguras();
        tokenActual = null;
        mostrarVentanaLogin();
      },
    },
    { type: 'separator' },
    {
      label: '🚪 Salir del agente',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function crearTray() {
  const iconoRuta = path.join(__dirname, 'tray-icon.ico');
  const icono = fs.existsSync(iconoRuta)
    ? nativeImage.createFromPath(iconoRuta)
    : nativeImage.createEmpty();

  tray = new Tray(icono);
  tray.on('double-click', () => {
    const creds = leerCredencialesSeguras();
    if (!creds || !tokenActual) {
      mostrarVentanaLogin();
    } else {
      notificar('NexoFood Printer', `El agente está activo y funcionando en segundo plano (${estadoConexion}).`);
    }
  });

  actualizarTray();
}

// ─── Autenticación con el Backend ───────────────────────────────────
async function loginBackend(credencial, password) {
  let res;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credencial, password }),
    });
  } catch (netErr) {
    const errorRed = new Error(`No se pudo conectar con el backend (${API_URL}).`);
    errorRed.esErrorRed = true;
    throw errorRed;
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const mensaje = errorBody.message || `Error de autenticación (HTTP ${res.status})`;
    const errorHttp = new Error(Array.isArray(mensaje) ? mensaje.join('. ') : mensaje);
    errorHttp.status = res.status;
    throw errorHttp;
  }

  const data = await res.json();
  const token = data.access_token || data.token;
  if (!token) throw new Error('El servidor no retornó un token válido');
  return token;
}

async function renovarTokenInvisible() {
  const creds = leerCredencialesSeguras();
  if (!creds) throw new Error('No hay credenciales almacenadas');
  tokenActual = await loginBackend(creds.credencial, creds.password);
  return tokenActual;
}

// ─── Peticiones HTTP Autenticadas ───────────────────────────────────
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

  // Si el token expiró (401), se renueva una sola vez y reintenta
  if (res.status === 401) {
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

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Ticket HTML ────────────────────────────────────────────────────
function generarTicketHTML(comanda) {
  const p = comanda.pedido || {};
  const detalles = p.detalles || [];
  const mesero = p.mesero?.nombre || 'N/A';
  const mesa = p.numero_mesa ? `MESA ${p.numero_mesa}` : 'PARA LLEVAR';
  const hora = p.fecha_hora
    ? new Date(p.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '';

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

// ─── Ciclo de Sondeo (Polling) ──────────────────────────────────────
async function procesarPendientes() {
  if (procesando) return;
  procesando = true;

  try {
    const pendientes = await fetchPendientes();

    // Si la petición fue exitosa, actualizamos estado
    if (estadoConexion !== 'Conectado') {
      estadoConexion = 'Conectado';
      actualizarTray();
      if (ultimoErrorNotificado) {
        notificar('NexoFood Printer', 'Conexión con el servidor restablecida. Listo para imprimir.');
        ultimoErrorNotificado = false;
      }
    }

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
    if (err.status === 401 || err.status === 403) {
      estadoConexion = 'Credenciales rechazadas';
      actualizarTray();
      borrarCredencialesSeguras();
      if (pollingInterval) clearInterval(pollingInterval);
      notificar('NexoFood Printer', 'La sesión fue cerrada o expiró. Inicie sesión nuevamente.');
      mostrarVentanaLogin();
    } else {
      estadoConexion = 'Sin conexión con el servidor';
      actualizarTray();
      console.warn(`[WARN] Polling: ${err.message}`);
      if (!ultimoErrorNotificado) {
        notificar('NexoFood Printer', 'Esperando conexión con el servidor backend...');
        ultimoErrorNotificado = true;
      }
    }
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
    icon: path.join(__dirname, 'tray-icon.ico'),
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

ipcMain.handle('login', async (_event, { credencial, password }) => {
  try {
    const token = await loginBackend(credencial, password);
    tokenActual = token;

    guardarCredencialesSeguras(credencial, password);

    if (loginWindow) {
      loginWindow.close();
      loginWindow = null;
    }

    estadoConexion = 'Conectado';
    actualizarTray();
    iniciarAgenteImpresion();
    notificar('NexoFood Printer', 'Agente de impresión conectado y activo.');
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err.message };
  }
});

// ─── Ciclo de Vida de Electron ──────────────────────────────────────
app.whenReady().then(async () => {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: 'NexoFood Printer',
    });
  } catch (err) {
    console.warn('[WARN] No se pudo configurar auto-inicio:', err.message);
  }

  // Crear el ícono junto al reloj de Windows
  crearTray();

  printWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 600,
    webPreferences: {
      contextIsolation: true,
    },
  });

  const credsGuardadas = leerCredencialesSeguras();
  if (credsGuardadas) {
    try {
      console.log(`[AUTH] Intentando login automático para: ${credsGuardadas.credencial}...`);
      tokenActual = await loginBackend(credsGuardadas.credencial, credsGuardadas.password);
      console.log('[AUTH] Autenticación automática exitosa.');
      estadoConexion = 'Conectado';
      actualizarTray();
      notificar('NexoFood Printer', 'Agente de impresión activo y conectado.');
      iniciarAgenteImpresion();
      return;
    } catch (err) {
      console.error('[AUTH] Error en auto-login:', err.message);
      if (err.esErrorRed) {
        console.warn('[AUTH] Servidor aún no disponible. Iniciando agente en segundo plano...');
        estadoConexion = 'Esperando servidor';
        actualizarTray();
        iniciarAgenteImpresion();
        return;
      }
      if (err.status === 401 || err.status === 403) {
        console.warn('[AUTH] Credenciales guardadas rechazadas por el servidor.');
        borrarCredencialesSeguras();
      }
    }
  } else {
    console.log('[AUTH] No hay sesión guardada previa.');
  }

  console.log('[AUTH] Mostrando ventana de inicio de sesión...');
  mostrarVentanaLogin();
});

app.on('window-all-closed', (e) => {
  // Mantener vivo en el System Tray si no se ha pedido salir expresamente
  if (!app.isQuitting) {
    e.preventDefault();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (pollingInterval) clearInterval(pollingInterval);
  if (tray) tray.destroy();
});
