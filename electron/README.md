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
  "NOMBRE_IMPRESORA": "",
  "ANCHO_TICKET": "72mm",
  "INTERVALO_POLLING_MS": 4000
}
```

- **`URL_BACKEND`**: Dirección de la API NestJS.
- **`NOMBRE_IMPRESORA`**: Nombre de la impresora en Windows. Si lo dejas vacío (`""`), usa automáticamente la **impresora predeterminada del sistema**.
- **`ANCHO_TICKET`**: Ancho del ticket térmico (`72mm` para rollo de 80mm; `48mm` para rollo de 58mm).
- **`INTERVALO_POLLING_MS`**: Frecuencia de consulta de comandas nuevas (4000 ms = 4s).

## Uso

Para iniciar el agente:

```bash
cd electron
npm start
```

1. La primera vez se abrirá la ventana para ingresar tu usuario y contraseña.
2. Al dar clic en **Iniciar Agente**, las credenciales se guardan protegidas en el almacén seguro de Windows.
3. La ventana se cierra y el agente queda vigilando las comandas e imprimiendo en silencio.
