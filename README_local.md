# NexoFood — Sistema Integral de Gestión de Ventas, Inventario y Comandas

> **Solución integral de punto de venta (POS) y control operacional gastronómico para el restaurante Chori Company.**  
> Desarrollado por el equipo **CORVSOFT** para la asignatura **Proyecto 1 (Semestre 8)**, Universidad del Cauca.

---

## 1. Nombre del Proyecto

**NexoFood** (denominado técnicamente en el repositorio como *sistema-gestion* y comercialmente adaptado para *Chori Company*).

---

## 2. Descripción General

En el sector gastronómico, los restaurantes de comida rápida y tradicional enfrentan dificultades críticas asociadas a la gestión manual o desarticulada: desfases entre los pedidos tomados en salón y la producción en cocina, pérdida de stock por falta de trazabilidad en las recetas, errores en los cobros de caja, descontrol en mermas o desperdicios y ausencia de indicadores financieros consolidados en tiempo real.

**NexoFood** es una plataforma tecnológica integral diseñada para centralizar, automatizar y asegurar el flujo operativo de un restaurante. Conecta en tiempo real la toma de pedidos en mesa por parte de los meseros, la gestión y despacho de comandas en cocina (incorporando impresión térmica silenciosa desatendida), el control de inventario automatizado por recetas e insumos, el cobro en caja con múltiples medios de pago y el monitoreo financiero y gerencial para la toma de decisiones.

---

## 3. Objetivo del Proyecto

Desarrollar e implementar un sistema de software robusto, seguro y escalable que optimice el ciclo completo de atención gastronómica en **Chori Company**, garantizando:
- La sincronización atómica entre la sala de atención (mesas), cocina y caja.
- El control estricto del inventario mediante el descuento automático de existencias tras cada venta y el registro de ingresos y mermas.
- La automatización de la impresión de comandas en cocina con formato de ticket térmico estándar de 72mm.
- El resguardo de la información financiera y de costos mediante control de acceso basado en roles (RBAC).
- La disponibilidad de reportes analíticos para evaluar el rendimiento comercial y operativo del establecimiento.

---

## 4. Funcionalidades Principales

El sistema se encuentra estructurado en módulos operacionales basados en **7 Épicas (HE-01 a HE-07)** y **28 Historias de Usuario (HU)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MÓDULOS DE NEXOFOOD                             │
├───────────────────┬───────────────────┬────────────────────────────────┤
│  Autenticación &  │   Productos &     │   Pedidos, Ventas &            │
│  Usuarios (RBAC)  │   Inventario      │   Mesa Concurrente             │
├───────────────────┼───────────────────┼────────────────────────────────┤
│  Cocina &         │   Historial &     │   Reportes, Ventas &           │
│  Comandas Térmicas│   Auditoría       │   Control Financiero           │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

### 4.1. Módulo de Autenticación, Usuarios y Permisos (HE-01)
- **HU-1.1 a HU-1.3:** Autenticación mediante tokens JWT firmados con expiración a 8 horas, cierre de sesión seguro y registro controlado de personal.
- **HU-1.4 y HU-1.5:** Matriz de control de acceso basada en roles (**RBAC**):
  - **Administrador:** Acceso irrestricto, configuración, auditoría, márgenes de costos y módulos financieros.
  - **Cajero:** Cobro de pedidos, arqueo de caja y consulta de balances financieros.
  - **Mesero:** Apertura de mesas, toma de pedidos y visualización de pedidos asignados.
  - **Cocinero:** Visualización de cola de pedidos y cambio de estado de preparación.
- **Protección de Rutas y Guards:** Protección tanto en frontend (`authGuard`, `adminGuard`, `rolGuard`, `permisoGuard`) como en backend (`JwtAuthGuard`, `RolesGuard`).

### 4.2. Módulo de Productos e Inventario (HE-02)
- **HU-2.1:** Catálogo unificado de productos para venta directa (ej. choripanes, bebidas) e insumos/materias primas para cocina.
- **HU-2.2 (SCRUM-193/194):** Confidencialidad de costos de fabricación. Mediante un interceptor global (`ConfidencialidadInterceptor`), el costo unitario de los productos solo es expuesto a usuarios con rol Administrador; los meseros y cocineros reciben el catálogo con costos ofuscados.
- **HU-2.3:** Registro de entradas de inventario por compras a proveedores o producción interna, sumando existencias atómicamente.
- **HU-2.4:** Registro de salidas manuales justificadas por concepto de merma, desperdicio, vencimiento o ajuste de stock.
- **HU-2.5:** Alertas automáticas visuales de *Stock Bajo* cuando la cantidad disponible alcanza o cruza el umbral de stock mínimo.
- **HU-2.6:** Búsqueda, filtrado y vista rápida de existencias consolidadas.

### 4.3. Módulo de Pedidos, Salón y Ventas (HE-03)
- **HU-3.1:** Interfaz de salón para meseros ("Mis Mesas") con estado en tiempo real (Disponible, Ocupada). Bloqueo atómico de mesas con rechazo de condiciones de carrera (`HTTP 409 Conflict` ante aperturas simultáneas - DEF-005).
- **HU-3.2:** Selección ágil de productos con soporte para combos, modificadores y adicionales dinámicos con recálculo de subtotal.
- **HU-3.3:** Modificación y edición de pedidos activos previo a su despacho.
- **HU-3.4:** Máquina de estados finita del pedido:  
  $$\text{PENDIENTE} \longrightarrow \text{EN\_PREPARACION} \longrightarrow \text{LISTO} \longrightarrow \text{ENTREGADO} \longrightarrow \text{PAGADO} \text{ (o } \text{ANULADO)}$$  
  *Restricción estricta:* Se prohíben saltos directos no autorizados a `PAGADO` sin registro formal de cobro (DEF-003).
- **HU-3.5:** Cobro de pedidos exclusivo para Cajero y Administrador (DEF-004 / DEF-010). Soporte para Efectivo, Tarjeta y Transferencia. Descuento automático de existencias del inventario (CP-3.5-06) e inserción del movimiento en la caja financiera.
- **HU-3.6:** Anulación de pedidos restringida al Administrador con captura obligatoria de justificación/motivo de auditoría (DEF-004).

### 4.4. Módulo de Cocina, Comandas e Impresión Térmica (HE-04)
- **HU-4.1:** Generación automática de comandas de cocina tan pronto el mesero confirma el pedido en sala. Identificación explícita del mesero responsable en el encabezado del ticket (DEF-008).
- **HU-4.2:** Gestión de cola de impresión térmica en formato estándar POS de 72mm/80mm (o 48mm/58mm). Control de reimpresión de comandas con bloqueo estricto sobre pedidos en estado `ANULADO` (DEF-007).
- **HU-4.3:** Versionado incremental de comandas: cuando un mesero modifica un pedido ya enviado a cocina, se genera una comanda de actualización destacando los ítems agregados o modificados.

### 4.5. Módulo de Consulta e Historial de Operaciones (HE-05)
- **HU-5.1 a HU-5.4:** Auditoría histórica de pedidos con vista tabular, filtrado multicriterio (por estado del pedido, rango de fechas y producto) y visualización detallada del ticket de venta.

### 4.6. Módulo de Reportes y Estadísticas (HE-06)
- **HU-6.1:** Reporte consolidado de inventario en tiempo real con scroll vertical continuo y cabeceras fijas para catálogos extensos.
- **HU-6.2:** Reporte de ventas con desglose por medio de pago y tarjeta destacada de **Mayor Venta** del período (indicando monto, ID de pedido y mesa).
- **HU-6.3:** Ranking dinámico de productos más vendidos ordenados por volumen y recaudación.
- **HU-6.4:** Resumen del período con cálculo consolidado de pedidos totales, volumen facturado, pedidos anulados y ticket financiero.
- **HU-6.5:** Reporte financiero con balance neto de caja.
- **HU-6.6 y HU-6.7:** Utilidad global de exportación a formato **PDF** e impresión directa sin diálogos intrusivos.

### 4.7. Módulo de Control Financiero (HE-07)
- **HU-7.1:** Registro de egresos y gastos operacionales (compras menores, servicios, pago a personal) clasificados por categoría.
- **HU-7.2:** Registro de ingresos extraordinarios no provenientes de la venta de comidas (inyecciones de capital, ajustes a favor) sin alterar las métricas comerciales de cocina.
- **HU-7.3:** Historial financiero unificado con cálculo del saldo neto en caja y desglose del balance disponible por medio de pago (Efectivo, Transferencia, Tarjeta).

### 4.8. Agente de Impresión de Escritorio (`electron/nexofood-printer`)
- Aplicación de escritorio en segundo plano para el PC conectado físicamente a la impresora térmica de cocina.
- Almacenamiento seguro de credenciales con cifrado nativo del sistema operativo Windows mediante la API **DPAPI / safeStorage** (sin contraseñas en texto plano).
- Auto-reautenticación invisible: renueva el token JWT automáticamente antes de su expiración sin interrumpir el servicio.
- Consulta periódica (polling) de comandas pendientes e impresión silenciosa hacia impresoras como la **SAT SAT38TUSE**.
- Menú en la bandeja del sistema (System Tray) con opción de *Imprimir comanda de prueba*.

---

## 5. Tecnologías Utilizadas

| Componente | Tecnología | Versión | Propósito |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Node.js | `>= 22.x` | Entorno de ejecución en servidor |
| **Backend Framework** | NestJS | `^12.0.1` | Arquitectura modular orientada a servicios, DTOs y controladores |
| **Lenguaje Backend** | TypeScript | `~6.0.2` | Tipado estático y compilación estructurada |
| **ORM / Acceso a BD** | TypeORM | `^1.1.1` | Mapeo objeto-relacional y migraciones transaccionales |
| **Base de Datos** | PostgreSQL | `^8.23.0` (`pg`) | Motor relacional ACID con soporte transaccional |
| **Seguridad Backend** | Passport-JWT & Bcrypt | `^4.0.1` / `^6.0.0` | Autenticación basada en tokens y hasheo de contraseñas |
| **Validación Backend** | Class-Validator & Class-Transformer | `^0.15.1` / `^0.5.1` | Validación de contratos de entrada en DTOs |
| **Frontend Framework** | Angular | `^22.2.0` | Arquitectura SPA con Standalone Components |
| **Librería Reactiva** | RxJS | `~7.8.0` | Manejo de flujos de eventos asíncronos y llamadas HTTP |
| **Estilos Frontend** | SCSS / CSS Modules | Moderno | Diseño responsivo con paleta de marca y variables CSS |
| **Agente de Escritorio** | Electron | `^33.0.0` | Aplicación de bandeja del sistema para impresión silenciosa |
| **Testing Backend** | Jest & Supertest | `^30.0.0` / `^7.0.0` | Pruebas unitarias, de integración y E2E |
| **Testing Frontend** | Vitest & Jsdom | `^5.0.0` / `^30.0.0` | Pruebas unitarias rápidas de componentes y servicios |
| **Linter / Formatter** | Oxlint & Prettier | `^1.58.0` / `^3.4.2` | Análisis estático de código de alto rendimiento |

---

## 6. Arquitectura del Sistema

El sistema implementa una **arquitectura por capas desacoplada** con tres componentes principales y una base de datos centralizada:

```
                      ┌──────────────────────────────────────┐
                      │          Navegador Web / POS         │
                      │         (Angular v22 - SPA)          │
                      └──────────────────┬───────────────────┘
                                         │  HTTPS / JSON (JWT)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │             API RESTful              │
                      │           (NestJS Backend)           │
                      │  Controllers -> Services -> Entities │
                      └──────────┬──────────────────┬────────┘
                                 │                  │ Polling / JSON
          TypeORM / SQL Pooling  │                  ▼
                                 │     ┌─────────────────────────────┐
                                 │     │    NexoFood Printer App     │
                                 │     │   (Electron v33 - Desktop)  │
                                 │     └────────────┬────────────────┘
                                 │                  │ RAW Print
                                 ▼                  ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │ Base de Datos    │  │ Impresora POS    │
                    │ PostgreSQL 14+   │  │ SAT SAT38TUSE    │
                    └──────────────────┘  └──────────────────┘
```

1. **Capa de Presentación (Frontend):** Desarrollada en Angular v22 con enfoque *standalone*, organizada por características (`features/`), protegida por interceptores de autenticación (`auth.interceptor.ts`) y controlada por Guards funcionales.
2. **Capa de Servicios y Lógica de Negocio (Backend):** Desarrollada con NestJS, encapsulando las reglas en servicios desacoplados con inyección de dependencias. Garantiza atomicidad transaccional mediante `QueryRunner` de TypeORM para operaciones críticas (descuento de stock en cobro, anulación y bloqueo de concurrencia).
3. **Capa de Agente Periférico (Desktop):** Agente desacoplado en Electron v33 que ejecuta un bucle de sondeo seguro para descargar e imprimir comandas sin interacción de usuario.
4. **Capa de Persistencia (PostgreSQL):** Esquema relacional normalizado con integridad referencial, índices en claves foráneas y disparadores de control.

---

## 7. Estructura de Carpetas

```text
sistema-gestion/
│
├── backend/                               # Servidor de API RESTful (NestJS)
│   ├── database/                          # Scripts SQL DDL y pruebas de migración
│   │   ├── 000_esquema_completo.sql       # Esquema integral de tablas y relaciones
│   │   ├── 001_productos_insumos.sql a 012_tablas_viejas_sprint2.sql
│   │   └── tests/                         # Scripts de verificación de flujos
│   ├── src/
│   │   ├── auth/                          # Autenticación, JWT, Guards y decoradores
│   │   ├── common/                        # Interceptores (Confidencialidad), DTOs comunes
│   │   ├── finance/                       # Ingresos, egresos y movimientos de caja
│   │   ├── inventory/                     # Control de existencias, compras y mermas
│   │   ├── kitchen/                       # Gestión de comandas y cola de impresión
│   │   ├── orders/                        # Pedidos, mesas, cobro y anulación
│   │   ├── products/                      # Catálogo de productos e ingredientes
│   │   ├── queries-reports/               # Reportes analíticos de ventas e inventario
│   │   ├── users/                         # Gestión de usuarios y perfiles
│   │   ├── app.module.ts                  # Módulo raíz del backend
│   │   └── main.ts                        # Punto de entrada de la aplicación NestJS
│   ├── test/                              # Pruebas automatizadas de Sistema y E2E
│   │   ├── app.e2e-spec.ts                # Verificación de disponibilidad de API
│   │   ├── flujo-pedidos-cocina-cobro.e2e-spec.ts # Ciclo de vida completo del pedido
│   │   ├── concurrencia-mesas.e2e-spec.ts # Bloqueo mutuo y exclusión de mesas
│   │   ├── anulacion-comanda.e2e-spec.ts  # Anulación de pedidos y bloqueo de reimpresión
│   │   ├── inventario-flujo.e2e-spec.ts   # Entradas, mermas y alertas de stock
│   │   └── jest-e2e.json                  # Configuración de Jest para E2E
│   ├── .env.example                       # Plantilla de variables de entorno
│   ├── package.json                       # Dependencias y scripts de backend
│   └── typeorm.config.ts                  # Configuración del CLI de TypeORM
│
├── frontend/                              # Aplicación de Usuario / SPA (Angular v22)
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/                      # Pantallas de Login y Registro
│   │   │   ├── core/                      # Guards, interceptores HTTP, servicios base
│   │   │   ├── features/                  # Módulos funcionales de la UI
│   │   │   │   ├── financiero/            # Historial de caja, egresos e ingresos
│   │   │   │   ├── historial/             # Auditoría de pedidos
│   │   │   │   ├── inventario/            # Formularios de ingresos y mermas
│   │   │   │   ├── pedidos/               # Detalle de pedido y comanda
│   │   │   │   ├── productos/             # Catálogo y formulario de ítems
│   │   │   │   ├── reportes/              # Dashboard de ventas, inventario y exportación PDF
│   │   │   │   ├── usuarios/              # Asignación de roles y permisos
│   │   │   │   └── ventas/                # Mis mesas, nuevo pedido y cobro en caja
│   │   │   ├── layout/                    # Layout principal con menú de navegación
│   │   │   ├── shared/                    # Componentes reutilizables (alertas, badges, modales)
│   │   │   ├── app.config.ts              # Configuración y providers de Angular
│   │   │   └── app.routes.ts              # Enrutamiento de la aplicación y guards
│   │   └── environments/                  # Variables de entorno del cliente
│   ├── package.json                       # Dependencias y scripts de frontend
│   └── tsconfig.json                      # Configuración de TypeScript
│
├── electron/                              # Agente de Impresión Térmica de Cocina
│   ├── main.js                            # Proceso principal, polling e impresión silenciosa
│   ├── login.html                         # Ventana de autenticación segura inicial
│   ├── ticket.html                        # Plantilla de renderizado de comanda térmica
│   ├── config.json                        # Configuración externa de impresora y backend
│   ├── package.json                       # Dependencias del agente Electron
│   └── README.md                          # Manual técnico del agente de impresión
│
├── esquema_completo.txt                   # Esquema de base de datos de referencia rápida
└── .gitignore                             # Reglas de exclusión de Git
```

---

## 8. Requisitos Previos

Antes de ejecutar el proyecto, asegúrate de contar con el siguiente software instalado en tu entorno local:

1. **Node.js:** Versión `>= 22.0.0` (recomendado: Node.js `v22.22.x` administrado con NVM).
2. **NPM:** Versión `>= 10.0.0` (incluido con Node.js).
3. **PostgreSQL:** Versión `14.x` o superior (servidor local o instancia en la nube como Render, Neon o Supabase).
4. **Git:** Para control de versiones.
5. **(Opcional) Impresora Térmica:** Modelo de 58mm o 80mm (ej. *SAT SAT38TUSE*) con driver USB instalado en Windows si se desea probar la impresión física del agente Electron.

---

## 9. Instalación y Configuración

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/Alejandra-Pinto/Nexofood-gestion-inventario.git
cd Nexofood-gestion-inventario
```

### Paso 2: Configurar la Base de Datos
1. Inicia sesión en tu motor PostgreSQL y crea una base de datos limpia:
   ```sql
   CREATE DATABASE nexofood_db;
   ```
2. Ejecuta el script del esquema principal ubicado en `backend/database/000_esquema_completo.sql` utilizando `psql`, pgAdmin o DBeaver.

### Paso 3: Configurar e Instalar Dependencias del Backend
```bash
cd backend

# 1. Crear el archivo de entorno a partir de la plantilla
cp .env.example .env

# 2. Editar el archivo .env con las credenciales de tu base de datos
# (Consulta la sección 10 para ver la explicación detallada)

# 3. Instalar las dependencias de Node.js
npm install

cd ..
```

### Paso 4: Instalar Dependencias del Frontend
```bash
cd frontend

# Instalar dependencias del cliente Angular
npm install

cd ..
```

### Paso 5: Configurar e Instalar el Agente de Impresión (Opcional)
```bash
cd electron

# Instalar dependencias de Electron
npm install

# Verificar o ajustar config.json según el nombre de tu impresora en Windows
cd ..
```

---

## 10. Variables de Entorno

> ⚠️ **Importante de Seguridad:** Nunca compartas ni subas archivos `.env` a repositorios públicos o privados. Utiliza únicamente variables de entorno de ejemplo.

### Backend (`backend/.env`)

Crea el archivo `backend/.env` utilizando la siguiente estructura base:

```env
# Configuración del servidor de base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres_user
DB_PASSWORD=tu_contrasena_segura
DB_DATABASE=nexofood_db

# Seguridad de conexión SSL (true para bases de datos en la nube como Render/Neon; false para local)
DB_SSL=false

# Puerto en el que escucha la API NestJS (por defecto: 3000)
PORT=3000

# URL permitida para peticiones CORS desde el frontend
FRONTEND_URL=http://localhost:4200
```

### Frontend (`frontend/src/environments/environment.ts`)

Define la URL de comunicación con el backend:

```typescript
export const environment = {
  apiUrl: 'http://localhost:3000',
};
```

### Agente de Impresión (`electron/config.json`)

Define los parámetros de conexión y hardware:

```json
{
  "URL_BACKEND": "http://localhost:3000",
  "NOMBRE_IMPRESORA": "SAT SAT38TUSE",
  "ANCHO_TICKET": "72mm",
  "INTERVALO_POLLING_MS": 4000
}
```
*Si `NOMBRE_IMPRESORA` se deja vacío (`""`), el agente utilizará automáticamente la impresora predeterminada del sistema operativo.*

---

## 11. Ejecución del Proyecto

Para levantar el sistema de manera completa en un entorno de desarrollo local, abre terminales independientes para cada componente:

### Terminal 1: Iniciar el Backend (NestJS)
```bash
cd backend
npm run start:dev
```
> La API estará disponible en: `http://localhost:3000`

### Terminal 2: Iniciar el Frontend (Angular)
```bash
cd frontend
npm start
```
> La aplicación web se abrirá automáticamente o estará accesible en: `http://localhost:4200`

### Terminal 3: Iniciar el Agente de Impresión (Electron - Opcional)
```bash
cd electron
npm start
```
> Se abrirá la ventana para iniciar sesión en el agente. Al autenticarse, se minimizará en la bandeja del sistema (System Tray) para vigilar e imprimir en silencio las comandas entrantes.

---

## 12. Pruebas de Software

El proyecto cuenta con una cobertura integral a lo largo de todos los niveles de la **Pirámide de Pruebas**, respaldada por suites automatizadas y una matriz de casos de aceptación formal:

```
                      ▲
                     / \     Nivel 5: Aceptación (110 casos en Excel - IEEE 829)
                    /   \
                   /     \    Niveles 3 & 4: Sistema y E2E (5 suites / 17 tests - Supertest)
                  /───────\
                 /         \   Nivel 2: Integración (60+ tests - Controladores, DTOs, Guards)
                /           \
               /─────────────\  Nivel 1: Unitarias (58 suites / 649 tests - Jest & Vitest)
              └───────────────┘
```

### Ejecutar Pruebas de Sistema y End-to-End (E2E)
Validan flujos completos de negocio, exclusión mutua de mesas, anulaciones y transacciones de caja:
```bash
cd backend
npm run test:e2e
```

### Ejecutar Pruebas Unitarias e Integración del Backend (Jest)
Validan servicios, repositorios, entidades, guards e interceptores:
```bash
cd backend

# Ejecutar todas las pruebas unitarias
npm test

# Ejecutar con reporte de cobertura de código
npm run test:cov
```

### Ejecutar Pruebas Unitarias del Frontend (Vitest)
Validan componentes visuales, pipes, servicios de Angular e interceptores HTTP:
```bash
cd frontend
npm test -- --watch=false
```

### Resumen de Métricas de Calidad de Software:
- **Suites Automatizadas en Código:** 63 suites (Backend Jest + Frontend Vitest + Backend E2E).
- **Pruebas Automatizadas:** 666 pruebas aprobadas con un **100% de tasa de éxito**.
- **Pruebas de Aceptación:** 110 casos documentados y ejecutados en la matriz formal de QA.
- **Defectos Corregidos y Verificados:** 10 defectos críticos (DEF-001 al DEF-010) con pruebas de regresión asociadas.

---

## 13. Equipo de Desarrollo

El desarrollo del proyecto es llevado a cabo por el equipo **CORVSOFT** de la **Universidad del Cauca** (Facultad de Ingeniería Electrónica y Telecomunicaciones):

| Integrante | Correo Electrónico Institucional | Rol / Participación Identificada |
| :--- | :--- | :--- |
| **Alejandra Pinto Beltrán** | `alejandrapinto@unicauca.edu.co` | Desarrollo Full-Stack, Coordinación y Diseño de Pruebas de Software (QA) |
| **Anyi Katherine Sánchez Yasnó** | `aksanchez@unicauca.edu.co` | Desarrollo de Software |
| **Juan Esteban M.** | `juanestebanm@unicauca.edu.co` | Desarrollo de Software |
| **Jhonatan Palacios G.** | `jpalaciosg19@gmail.com` | Desarrollo de Software |
| **Vivian Vargas** | `vvargas@unicauca.edu.co` | Desarrollo de Software |
| **Yezid Esteban H. G.** | `yezidesteban5@gmail.com` | Desarrollo de Software |

*Nota: La distribución detallada de tareas por módulo y sprint se encuentra registrada en los historiales de commits y en las actas de gestión del equipo.*

---

## 14. Gestión del Proyecto

- **Control de Versiones (GitHub):**  
  Repositorio oficial: [https://github.com/Alejandra-Pinto/Nexofood-gestion-inventario.git](https://github.com/Alejandra-Pinto/Nexofood-gestion-inventario.git)
- **Metodología Ágil:** Scrum, organizado en Sprints (Sprint 1: Fundación y Auth; Sprint 2: Catálogo e Inventario; Sprint 3: Pedidos, Cocina, Caja, Reportes y Financiero).
- **Seguimiento de Tareas (Jira):**  
  Las historias de usuario, requerimientos funcionales y tareas de desarrollo se gestionan mediante tickets con la convención `SCRUM-XXX` (ej. `SCRUM-121` a `SCRUM-252`).  
  *(La URL privada de acceso a la instancia de Atlassian Cloud depende de la organización académica del proyecto).*
- **Documentación de Pruebas Formal:**  
  - Matriz de casos de prueba y ciclo de vida de defectos: `CORVSOFT_Documentacion_de_Pruebas_vrs2.2.xlsx`.
  - Documento exhaustivo de pruebas bajo estándares IEEE 829 / ISO 29119: `Documentacion_Exhaustiva_Pruebas_Software_NexoFood.docx` y `.pdf`.

---

## 15. Licencia

Este proyecto fue desarrollado con fines estrictamente académicos e institucionales en el marco de la asignatura **Proyecto 1** del programa de Ingeniería de la **Universidad del Cauca**.
