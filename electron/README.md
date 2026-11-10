# NexoFood Printer — Agente de impresión silenciosa

App de escritorio (Electron) para el PC conectado físicamente a la impresora térmica de cocina en Chori Company.

## Características

- **Seguridad nativa (safeStorage / DPAPI):** Las credenciales se cifran con la clave del sistema operativo Windows. No se guardan contraseñas ni tokens en texto plano.
- **Auto-reautenticación invisible:** El token JWT dura 8 horas. Cuando expira, el agente renueva el token por debajo en milisegundos sin interrumpir la operación del cajero.
- **Auto-inicio con el sistema operativo:** Inicia automáticamente al encender el PC (`openAtLogin`).
- **Ventana de Login inicial:** Si es la primera vez que se ejecuta en el PC, muestra una ventana de inicio de sesión con el estilo de Chori Company. Una vez autenticado, se oculta y trabaja en segundo plano.
- **Impresión silenciosa:** Renderiza las comandas de cocina en una ventana oculta y las imprime sin cuadros de diálogo.
- **Configuración desacoplada:** La URL del backend, la impresora y el ancho del ticket se configuran externamente en `config.json`.

## Requisitos

- Node.js ≥ 22
- Impresora térmica conectada e instalada en Windows
- Backend de NexoFood corriendo en `http://localhost:3000`

## Instalación

```bash
cd electron
npm install
```

## Configuración (`electron/config.json`)

```json
{
  "URL_BACKEND": "http://localhost:3000",
  "NOMBRE_IMPRESORA": "SAT SAT38TUSE",
  "ANCHO_TICKET": "72mm",
  "INTERVALO_POLLING_MS": 4000
}
```

- **`URL_BACKEND`**: Dirección de la API NestJS.
- **`NOMBRE_IMPRESORA`**: Nombre exacto de la impresora en Windows (ej. `"SAT SAT38TUSE"`). Si lo dejas vacío (`""`), usa automáticamente la **impresora predeterminada del sistema**. Si el nombre configurado no existe en Windows, el agente registrará un error en consola y notificación con la lista de todas las impresoras disponibles.
- **`ANCHO_TICKET`**: Ancho del ticket térmico (`72mm` para rollo de 80mm; `48mm` para rollo de 58mm).
- **`INTERVALO_POLLING_MS`**: Frecuencia de consulta de comandas nuevas (4000 ms = 4s).

> **Prioridad:** Si existe la variable de entorno `NOMBRE_IMPRESORA` o `ANCHO_TICKET` en el sistema, esta tendrá prioridad sobre `config.json`.

## Comanda de Prueba (Sin tocar código)

Puedes probar la impresión térmica en cualquier momento con datos ficticios sin necesidad de pedidos reales:

- **Opción 1 (Desde la terminal):**
  ```bash
  cd electron
  npm run test-print
  ```
  Imprime una comanda de prueba con el formato de 72mm y finaliza automáticamente.

- **Opción 2 (Desde la bandeja del sistema / System Tray):**
  Haz clic derecho sobre el ícono de NexoFood junto al reloj de Windows y selecciona:
  `🧾 Imprimir comanda de prueba`.

## Instrucciones de Instalación para el Cliente

1. **Instalar el Driver:**
   - Conectar la impresora térmica **SAT38TUSE** al puerto USB del PC de caja y encenderla.
   - Instalar el driver oficial del fabricante en Windows.
   - Verificar en *Panel de Control > Dispositivos e Impresoras* que figure con el nombre **`SAT SAT38TUSE`** (o anotar el nombre exacto asignado por Windows).
2. **Configuración:**
   - Abrir el archivo `electron/config.json`.
   - Asegurarse de que `"NOMBRE_IMPRESORA": "SAT SAT38TUSE"` coincida exactamente con el nombre en Windows.
3. **Probar la Impresión:**
   - Ejecutar en la terminal `npm run test-print` o iniciar el agente con `npm start` y hacer clic derecho en la bandeja > *🧾 Imprimir comanda de prueba*.
   - El ticket saldrá de inmediato con ancho de 72 mm, tipografía monoespaciada y corte limpio al terminar.

## Uso

Para iniciar el agente:

```bash
cd electron
npm start
```

1. La primera vez se abrirá la ventana para ingresar tu usuario y contraseña.
2. Al dar clic en **Iniciar Agente**, las credenciales se guardan protegidas en el almacén seguro de Windows.
3. La ventana se cierra y el agente queda vigilando las comandas e imprimiendo en silencio.
