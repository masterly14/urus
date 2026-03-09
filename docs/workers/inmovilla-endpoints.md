# Inmovilla CRM — Endpoints y flujo de autenticación

Documento de ingeniería inversa a partir de capturas de red (HAR).  
**Fuente:** `crm.inmovilla.com.har` (login + panel cargado).  
**Dominio base:** `https://crm.inmovilla.com`

---

## 1. Resumen ejecutivo

- **Autenticación:** Login en 2 pasos: (1) POST a `comprueba.php` con user/password/clave oficina; (2) POST a API v2 `login2Fa/verifyCode` con código 2FA. El código 2FA llega por correo; puede obtenerse de forma automatizada mediante **Composio** (acción Gmail: obtener último correo de Inmovilla y extraer el código de 6 dígitos).
- **Sesión:** No se usan cookies de sesión visibles en el HAR. El estado se mantiene con un **token opaco** (`l`) que se envía en el body de cada request POST a endpoints PHP.
- **Headers obligatorios:** `X-Requested-With: XMLHttpRequest` en todas las peticiones AJAX/API.
- **APIs:** Mezcla de API v1/v2 (REST JSON) y endpoints PHP legacy (form-urlencoded con token `l`).

---

## 2. Flujo de autenticación

### 2.1 Paso 1 — Login inicial

| Campo | Valor |
|-------|--------|
| **URL** | `POST https://crm.inmovilla.com/new/app/admin/comprueba.php` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |
| **Headers** | `X-Requested-With: XMLHttpRequest`, `Referer: https://crm.inmovilla.com/login/es` |

**Body (form-urlencoded):**

| Parámetro | Descripción | Ejemplo (sanitizado) |
|------------|-------------|----------------------|
| `user` | Usuario | `{{INMOVILLA_USER}}` |
| `ps` | Contraseña | `{{INMOVILLA_PASSWORD}}` |
| `claveofi` | Clave de oficina/agencia | `{{INMOVILLA_OFFICE_KEY}}` |
| `idioma` | Código idioma | `` |
| `seg` | Valor dinámico (timestamp/nonce) | `52320` |
| `alto` | Altura viewport | `678` |
| `anchopan` | Ancho viewport | `1280` |
| `altopan` | Alto pantalla | `800` |
| `isMobile` | 0/1 | `0` |
| `es-ipad` | 0/1 | `0` |

**Respuesta:** `200 OK`, `text/html` (~152 bytes). Tras éxito, la UI muestra la pantalla de **código 2FA**.

---

### 2.2 Paso 2 — Verificación 2FA

| Campo | Valor |
|-------|--------|
| **URL** | `POST https://crm.inmovilla.com/new/app/api/v2/auth/login2Fa/verifyCode` |
| **Content-Type** | `application/json` |
| **Headers** | `X-Requested-With: XMLHttpRequest`, `Referer: https://crm.inmovilla.com/login/es` |

**Body (JSON):**

```json
{
  "user": "{{INMOVILLA_USER}}",
  "claveofi": "{{INMOVILLA_OFFICE_KEY}}",
  "idioma": "",
  "seg": "52320",
  "alto": "678",
  "anchopan": "1280",
  "altopan": "800",
  "isMobile": "0",
  "es-ipad": "0",
  "pass": "{{INMOVILLA_PASSWORD}}",
  "code": "{{2FA_CODE}}",
  "idio": "1"
}
```

**Respuesta:** `200 OK`, `application/json` (~99 bytes). Tras éxito, redirección a `https://crm.inmovilla.com/panel/`.

**CORS:** El endpoint expone `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS, POST, PUT, PATCH, DELETE` y headers `Content-Type, Authorization, X-API-KEY, Origin, X-Requested-With, Accept`.

---

### 2.3 Obtención del código 2FA por correo (Composio)

Inmovilla envía el **código de verificación 2FA por correo electrónico** al buzón asociado al usuario (ej. Gmail). Para automatizar el login completo, el código debe leerse de ese correo y enviarse al endpoint `login2Fa/verifyCode`. La integración con **Composio** permite disparar una acción que obtiene el último correo de Inmovilla y extrae el código.

#### Flujo resumido

1. Ejecutar **Paso 1** (POST a `comprueba.php` con user, password, clave oficina).
2. **Esperar** unos segundos (5–30 s) a que llegue el correo con el código.
3. **Disparar la acción Composio** (Gmail): obtener el último correo que cumpla el filtro (remitente Inmovilla / asunto tipo código de acceso).
4. **Extraer** el código de 6 dígitos del asunto o del cuerpo del correo (regex p. ej. `\b\d{6}\b`).
5. Ejecutar **Paso 2** (POST a `login2Fa/verifyCode` con el mismo payload + `code`).
6. Capturar cookies y, si aplica, el token `l` para requests posteriores.

#### Integración Composio

- **Conexión:** Gmail (OAuth) conectado en Composio para la cuenta que recibe los correos de Inmovilla.
- **Acción a usar:** Equivalente a “listar/obtener correos” o “buscar correos” con filtros.
- **Filtros recomendados** (ajustar según el formato real del correo de Inmovilla):
  - `from`: remitente que use Inmovilla para 2FA (p. ej. `noreply@inmovilla.com`, `@inmovilla.com` o el que aparezca en el correo recibido).
  - `subject`: si el asunto incluye “código”, “verificación”, “Inmovilla”, etc., filtrar por palabra clave.
  - Ordenar por fecha descendente y tomar el **primer resultado** (el más reciente).
- **Salida:** asunto y cuerpo (o cuerpo en texto plano) del correo para parsear el código.

#### Parseo del código

- El código 2FA es **numérico de 6 dígitos** (ej. `908047`).
- **Regex sugerido:** `/\b(\d{6})\b/` aplicado al asunto + cuerpo concatenados; capturar el primer grupo que coincida.
- Si Inmovilla incluye texto tipo “Tu código es: 908047” o “908047”, el mismo regex suele bastar. Si el formato cambia (p. ej. “Código: 908 047”), normalizar espacios antes: `texto.replace(/\s+/g, '')`.

#### Consideraciones

| Aspecto | Recomendación |
|--------|----------------|
| **Latencia del correo** | Polling cada 3–5 s durante 30–60 s; si no llega, fallar con mensaje claro. |
| **Ventana de validez** | Los códigos 2FA suelen caducar en pocos minutos; usar el correo en cuanto llegue. |
| **Varios correos** | Filtrar por fecha/hora reciente (p. ej. últimos 2 minutos) para no usar un código antiguo. |
| **Seguridad** | No loguear el código ni el cuerpo completo del correo; usar solo para rellenar `code` y desechar. |
| **Composio como “tool”** | En un flujo automatizado (script o orquestador), invocar la tool de Composio que ejecuta la acción de Gmail (list/search emails), obtener el payload y extraer el código antes de llamar a `verifyCode`. |

Con esto, el login completo (Paso 1 + obtención de 2FA por email vía Composio + Paso 2) puede ejecutarse sin intervención manual.

---

## 3. Token de sesión (`l`)

Tras el login, **todas** las peticiones a endpoints PHP ( `/new/app/data/`, `/new/app/cargas/`, etc.) incluyen en el body un parámetro:

- **Nombre:** `l`
- **Formato:** `PARTE1.PARTE2` (dos bloques base64 separados por punto)
- **Ejemplo (sanitizado):** `{{SESSION_TOKEN}}`

Este token actúa como sesión + protección tipo CSRF. Debe obtenerse de la respuesta del login o del DOM/network tras cargar el panel, y reenviarse en cada request posterior.

---

## 4. Parámetros comunes en requests autenticados (PHP)

En los POST a endpoints legacy suelen ir:

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `l` | Token de sesión (obligatorio) | `{{SESSION_TOKEN}}` |
| `miid` | Identificador compuesto | `11636.210504.202629-14_32_40.202629-14_32_44_11636` |
| `id_pestanya` | ID de pestaña | `210504_1773084748` |
| `soyajax` | Flag AJAX | `1` |
| `numagencia` | ID agencia | `11636` |
| `id` | ID agente | `210504` |

Formato típico de `miid`: `agencia.agente.timestamp1.timestamp2_agencia`.

---

## 5. Catálogo de endpoints

### 5.1 Autenticación

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| POST | `/new/app/admin/comprueba.php` | Login fase 1 (credenciales) |
| POST | `/new/app/api/v2/auth/login2Fa/verifyCode` | Login fase 2 (código 2FA) |

### 5.2 API v2 (REST, JSON)

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| GET | `/new/app/api/v2/correos/info-cantidades?correo_sel_agentes=1250&correo_bandejas_tipos=xtipo1` | Info bandeja de correo |
| GET | `/new/app/api/v2/users/confmenu/` | Configuración del menú del usuario |
| GET | `/new/app/api/v2/users/userSession/` | Datos de sesión del usuario |
| GET | `/new/app/api/v2/chat/conversations/category` | Categorías de conversaciones del chat |
| GET | `/new/app/api/v2/utilidades/` | Menú de utilidades |
| GET | `/new/app/api/v2/ajustes/` | Menú de ajustes/configuración |
| POST | `/new/app/api/v2/analytics/posthog` | Envío de analytics |
| GET | `/new/app/api/v2/v3/agency/{agencyId}/unpaid` | Estado de pagos de la agencia |

### 5.3 API v1 (REST, PHP)

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| GET | `/new/app/api/v1/panelestipos/index.php` | Catálogo de tipos de paneles (KPIs) |
| GET | `/new/app/api/v1/escritorios/index.php?listar=1` | Lista de escritorios/dashboards |
| GET | `/new/app/api/v1/panelesconfiguraciones/index.php` | Configuración de paneles del escritorio |
| GET | `/new/app/api/v1/paneles/index.php?escritorio={id}&panel={id}&espaneldemandos=0` | Datos de un panel (propiedades, demandas, etc.) |
| POST | `/new/app/api/v1/paneles/index.php?escritorio=...&panel=...&espaneldemandos=0&custom=1` | Panel con datos personalizados |

Ejemplo de `escritorio` y `panel`: `escritorio=105870`, `panel=-122` (inicio), `panel=100`, `70`, `89`, `5`, `90`, `30`, `32`, `61`, `95`, `88`, `153`, etc.

### 5.4 Endpoints PHP legacy (AJAX, form-urlencoded + token `l`)

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| POST | `/new/app/data/panelsimplificado/tareasresul.php?eS=0&cache=...` | Tareas del panel simplificado (seguimientos) |
| POST | `/new/app/utilidades/borradores/generaindicesborradores.php` | Índices de borradores |
| POST | `/new/app/cargas/tareasRecurrentes.php?eS=1&cache=...` | Tareas recurrentes (polling) |
| POST | `/new/app/cargas/chatconversaciones/listadoColaboradores.php` | Lista colaboradores chat |
| POST | `/new/app/cargas/chatconversaciones/cargaComercialesYgruposAjx.php` | Comerciales y grupos del chat |
| POST | `/new/app/cargas/chatconversaciones/adParse.php` | Parse de mensajes del chat (polling) |
| POST | `/new/app/cargas/vernoticias.php?eS=0&cache=...` | Noticias (polling periódico) |
| POST | `/new/app/data/haycumples.php?eS=0&cache=...` | Cumpleaños del día |

El parámetro `cache` tiene formato tipo `agencia.contador.revision` y se usa como cache buster (ej: `11636.29143238.2`).

### 5.5 Otros

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| GET | `/new/app/ayuda/vervideo.php` | Ayuda / vídeo |
| GET | `/new/app/ventanas/visor2/index.php` | Visor (iframe/ventana) |

---

## 6. DSL de consultas (data/panelsimplificado)

En `tareasresul.php` (y posiblemente otros endpoints de datos) se usa un mini-DSL en el body:

- **Filtros:** `where=campo1;operador;valor;campo2;operador2;valor2`
  - Ejemplo: `where=seguimiento.keyagente;=;210504;fechaaviso;>=;2026-03-09+00:00:00;fechaaviso;<=;2026-03-09+23:59:59`
- **Orden:** `orden=campo1,campo2+desc+`
- **Vista:** `ficha=panelsimplificado`, `data=tareasresul`
- **Paginación:** `posicion=1`

Los operadores incluyen `=`, `>=`, `<=`, etc. Los valores con espacios se codifican como `+`.

---

## 7. Servicios externos detectados

| Servicio | URL / referencia | Uso |
|----------|-------------------|-----|
| **Composio** | Integración Gmail (OAuth) | Obtención automatizada del código 2FA: disparar acción de listado/búsqueda de correos, filtrar por remitente Inmovilla, extraer código de 6 dígitos del último correo. |
| PostHog | `posthog.inmovilla.com` | Analytics |
| Cercalia | `cercalia-lbs-both-lines` | Mapas/geocodificación |
| Userpilot | `analytex.userpilot.io` (WebSocket) | Product analytics |
| Froged | `froged.com` | Widget de soporte |
| Node (Apinmo) | `node.apinmo.com:3000`, `:3002` (wss) | WebSockets tiempo real |
| Google Analytics | UA-133917462-1, G-W8BKLKF511 | Analytics |
| Facebook Pixel | 1998298680958810 | Remarketing |

---

## 8. Uso en scripts (Playwright / Node)

### Login

**Opción A — Manual o semiautomático**

1. Navegar a `https://crm.inmovilla.com/login/es`.
2. Rellenar `#claveofi`, `#user`, `#pass` y pulsar el botón de acceso (el POST a `comprueba.php` lo lanza el propio front).
3. Esperar la pantalla 2FA e introducir el código a mano (o por TOTP si Inmovilla lo soportara).
4. Tras el POST a `verifyCode`, esperar redirección a `/panel/`.
5. Capturar el token `l` interceptando la primera respuesta POST que lo contenga en el body, o extrayéndolo del DOM si se expone en alguna variable global.

**Opción B — Automatizado con código 2FA vía Composio (recomendado)**

1. Navegar a `https://crm.inmovilla.com/login/es` (o hacer POST directo a `comprueba.php` con los parámetros de § 2.1).
2. Cuando la UI pida el código 2FA (o tras un delay fijo de 5–15 s), **disparar la acción Composio** de Gmail para obtener el último correo de Inmovilla (ver § 2.3).
3. Extraer el código de 6 dígitos del asunto/cuerpo con regex (p. ej. `/\b(\d{6})\b/`).
4. Enviar POST a `login2Fa/verifyCode` con el mismo payload del Paso 1 más `"code": "<código_extraído>"` (ver § 2.2).
5. Esperar redirección a `/panel/` y capturar el token `l` como en la opción A.

La integración con Composio permite obtener el correo de 2FA sin intervención manual; el script solo debe invocar la tool correspondiente (list/search emails con filtro por remitente/asunto) y parsear la respuesta.

### Requests autenticados

- **API v1/v2 (GET):** suelen depender de cookies de sesión establecidas por el navegador tras el login; con Playwright, mantener el mismo contexto (page/context) y hacer `page.request.get(...)` o fetch desde la página.
- **Endpoints PHP (POST):** incluir siempre en el body `l`, `miid`, `id_pestanya`, `soyajax`, `numagencia`, `id` (y el resto que requiera cada endpoint).

### Listado de propiedades

- Opción 1: llamar a `/new/app/api/v1/paneles/index.php` con el `panel` que corresponda a “propiedades” (identificado por el catálogo de `panelestipos` o por el HAR del panel de propiedades).
- Opción 2: usar endpoints de `/new/app/data/` con el DSL `where`/`ficha`/`data` adecuados si se conoce el nombre de la vista de propiedades.

---

## 9. Placeholders de seguridad

Al usar este documento en código o en otros entornos, sustituir siempre:

- `{{INMOVILLA_USER}}` — usuario
- `{{INMOVILLA_PASSWORD}}` — contraseña
- `{{INMOVILLA_OFFICE_KEY}}` — clave de oficina
- `{{2FA_CODE}}` — código 2FA de un solo uso
- `{{SESSION_TOKEN}}` — valor del parámetro `l` tras el login

No commitear credenciales ni tokens reales.

---

*Última actualización a partir de HAR exportado el 2026-03-09 (sesión en panel post-login).*
