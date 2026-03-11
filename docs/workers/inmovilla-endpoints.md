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

## 3. Token de sesión (`l`) — origen y obtención

Tras el login, **todas** las peticiones a endpoints PHP (`/new/app/data/`, `/new/app/cargas/`, etc.) incluyen en el body un parámetro:

- **Nombre:** `l`
- **Formato:** `PARTE1.PARTE2` (dos bloques base64 separados por punto)
- **Ejemplo (sanitizado):** `{{SESSION_TOKEN}}`

### 3.1 Origen exacto de `l`

El token `l` **no** se recibe en la respuesta de `comprueba.php` ni de `login2Fa/verifyCode`. Aparece por primera vez **embebido en el HTML** que devuelve `GET /panel/` tras completar el login, dentro de un bloque `<script>` como la variable global **`ps`**:

```js
var ps=`gFvL70S0pb...==.a2FYQTh1NU...OQ==`;
```

El front-end de Inmovilla luego usa `ps` como el valor de `l` en cada POST autenticado.

### 3.2 Cómo capturarlo en Playwright

1. Completar el login (Paso 1 + 2FA + Paso 2).
2. Esperar la navegación a `/panel/`.
3. Extraer `ps` desde el DOM evaluando JS en la página:

```ts
const l = await page.evaluate(() => (window as any).ps || '');
```

Alternativamente, interceptar el HTML de `/panel/` y parsear con regex:

```ts
const match = html.match(/var\s+ps\s*=\s*`([^`]+)`/);
const l = match ? match[1] : '';
```

### 3.3 Otras variables de sesión en el HTML del panel

El `GET /panel/` devuelve un HTML de ~744 KB que incluye, entre otras, estas variables globales:

| Variable JS | Parámetro XHR | Origen | Ejemplo |
|-------------|---------------|--------|---------|
| `ps` | `l` | HTML de `/panel/` | `gFvL70S0pb...==.a2FYQTh1NU...==` |
| `window.id_pestanya` | `id_pestanya` | HTML de `/panel/` | `210504_1773098590` |
| `idusuario` | `id` / parte de `miid` | HTML de `/panel/` | `210504` |
| `numagencia` | `numagencia` / parte de `miid` | HTML de `/panel/` | `11636` |
| `sucursal` | `numsucursal` | HTML de `/panel/` | `11636` |
| `idmail` | — | HTML de `/panel/` | `1250` |

`miid` **no aparece en el HTML**; se genera dinámicamente en el runtime JS del front. Su formato es `{numagencia}.{idusuario}.{timestamp1}.{timestamp2}_{numagencia}`, y se puede fabricar en código con los datos disponibles:

```ts
const now = new Date();
const ts = `${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}_${String(now.getMinutes()).padStart(2,'0')}_${String(now.getSeconds()).padStart(2,'0')}`;
const miid = `${numagencia}.${idusuario}.${ts}.${ts}_${numagencia}`;
```

### 3.4 Cookies de sesión

Tras el login completo, el navegador tiene estas cookies relevantes en `crm.inmovilla.com`:

| Cookie | Descripción | Duración |
|--------|-------------|----------|
| `PHPSESSID` | Sesión PHP clásica | Session (se pierde al cerrar browser) |
| `inmovilla` | Token de sesión propio de Inmovilla (base64 URL-encoded) | ~30 días |
| `jwt` | JWT con `userId`, `agency`, `nodo`, `lang`, `type:auth` | ~24 horas (`exp`) |
| `login2Fa-{agencia}-{usuario}` | Hash del 2FA completado | ~90 días |
| `fgAccId_ybc1kj` | ID de agencia para Froged (soporte) | Session |
| `fgSesionId_ybc1kj` | ID de sesión Froged | ~6 meses |

**Cookies esenciales para mantener sesión:** `PHPSESSID`, `inmovilla`, `jwt`. Sin ellas, las peticiones GET a APIs v1/v2 fallan. Las peticiones POST legacy además requieren `l` en el body.

### 3.5 Persistencia de sesión

- **Recarga de página:** la sesión persiste (cookies + `l` se re-inyecta en el nuevo HTML de `/panel/`).
- **Nueva pestaña del mismo browser:** la sesión persiste (cookies compartidas).
- **Para Playwright:** mantener el **mismo `BrowserContext`** tras el login. Las cookies se conservan automáticamente. Extraer `ps`/`id_pestanya`/`idusuario`/`numagencia` del HTML una vez y reutilizar en las requests autenticadas.

### 3.6 Conclusión operativa para el script de login

El script `inmovilla-login.ts` debe:

1. Hacer login (Paso 1 + 2FA + Paso 2) dentro de un `BrowserContext` de Playwright.
2. Esperar navegación a `/panel/`.
3. Extraer de la página: `ps` (→ `l`), `window.id_pestanya`, `idusuario`, `numagencia`.
4. Generar `miid` con el formato conocido.
5. Devolver un objeto de sesión `{ l, id_pestanya, miid, idusuario, numagencia, cookies }`.
6. Reusar ese objeto en `inmovilla-read-properties.ts` y futuras escrituras.

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
| POST | `/new/app/api/v1/paginacion/` | **Listado paginado** — propiedades (`ventana=cofe`) o demandas (`ventana=demandas`) |
| POST | `/new/app/api/v1/fichas/demandas/index.php` | Catálogo de campos de demandas |

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

## 7. Operaciones CRUD — Catálogo de XHR (Fase 3)

### 7.1 Crear Demanda

#### Flujo completo (3 pasos)

| Paso | Request | Propósito |
|------|---------|-----------|
| 1 | `POST /new/app/api/v1/fichas/demandas/index.php` | Obtener catálogo de campos disponibles (requisitos, tipos de dato, listas) |
| 2 | `POST /new/app/guardar/guardar.php?...&SoyNuevo=1` | **Guardado real** de la demanda + cliente asociado |
| 3 | `POST /new/app/cargas/fichacliente/fichacliente.php` | Recarga de la ficha del cliente post-guardado |

Side-effect automático: `POST /new/app/googlecontacts/crearContactosMasivo.php` (sincronización Google Contacts; response: `x`).

---

#### Paso 1 — Catálogo de campos

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/api/v1/fichas/demandas/index.php` |
| **Content-Type** | `multipart/form-data` |

**Body:**

| Parámetro | Valor |
|-----------|-------|
| `accion` | `ver` |
| `tipo` | `camposlistado` |

**Respuesta:** JSON con `lisrequisitos` — array de campos disponibles para demandas, cada uno con `id`, `condicion` (label), `idcampo`, `tipodato` (1=booleano, 2=numérico, 10=lista, etc.), y `lista` (opciones si aplica).

---

#### Paso 2 — Guardado (request principal)

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/guardar/guardar.php` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |
| **Headers** | `X-Requested-With: XMLHttpRequest` |
| **Referer** | `https://crm.inmovilla.com/demanda/{agencia}/NEW/` |

**Query params:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `eS` | Flag | `0` |
| `cruce` | Tipo de cruce de demanda | `2` |
| `tipocruce` | Subtipo cruce | `1` |
| `porarea` | Búsqueda por área geográfica | `1` |
| `ref` | Referencia auto-generada | `.auto_3.` |
| `idi` | Idioma | `1` |
| `envConf` | Enviar confirmación | `false` |
| `SoyNuevo` | **Flag de creación** (1 = nuevo) | `1` |
| `cache` | Cache buster | `{agencia}.{contador}.{rev}` |

**Body — Parámetros de sesión (obligatorios):**

| Parámetro | Descripción |
|-----------|-------------|
| `l` | `{{SESSION_TOKEN}}` |
| `miid` | ID compuesto de sesión |
| `id_pestanya` | ID de pestaña |
| `soyajax` | `1` |

**Body — Datos de la demanda:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `demandas-keyagente` | ID del agente asignado | `210504` |
| `demandas-captadopor` | ID del agente captador | `210504` |
| `demandas-keymedio` | Medio de captación (6=manual) | `6` |
| `demandas-tipocruce` | Tipo de cruce | `1` |
| `demandas-keysitu` | Estado de la demanda (20=Buscando) | `20` |
| `demandas-fecha` | Fecha alta (`.auto_1.` = ahora) | `.auto_1.` |
| `demandas-fechaact` | Fecha actualización | `.auto_1.` |
| `demandas-titulodem` | Título auto-generado | `1 hab. , Área personalizada 1` |
| `demandas-ventadesde` | Precio mínimo | `65000` |
| `demandas-ventahasta` | Precio máximo | `100000` |
| `demandas-ventanego` | Precio negociable | `100000` |
| `demandas-habitacionmin` | Habitaciones mínimas | `1` |
| `demandas-tipomes` | Tipo temporal | `MES` |
| `demandas-porarea` | Búsqueda por área | `1` |
| `demandas-centroaltitud` | Longitud del centro del mapa | `-87.265929...` |
| `demandas-centrolatitud` | Latitud del centro del mapa | `14.119654...` |
| `demandas-zoom` | Zoom del mapa | `13` |
| `demandas-numdemanda` | Num demanda (auto) | `.auto_3.` |
| `demandas-cod_dempriclave` | Clave primaria (`-_NEW_-` = nueva) | `-_NEW_-` |
| `demandas-contienecli` | Campo que contiene al cliente | `keycli` |
| `demandas-keycliclaveext` | FK al cliente | `clientes.cod_cli` |
| `tipopropiedad` | Tipos de propiedad (IDs separados por coma) | `2799,2899,4399,...` |
| `nbclave` | Tabla.campo de clave primaria | `demandas.cod_dem` |

**Body — Datos del cliente (creado junto a la demanda):**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `clientes-nombre` | Nombre | `Nicolas` |
| `clientes-apellidos` | Apellidos | `Cano` |
| `clientes-email` | Email | `svaron066@gmail.com` |
| `clientes-cod_clipriclave` | Clave primaria (`-_NEW_-` = nuevo) | `-_NEW_-` |
| `clientes-idiomacli` | Idioma | `1` |
| `clientes-prefijotel1` | Prefijo telefónico 1 | `34` |
| `clientes-prefijotel2` | Prefijo telefónico 2 | `34` |
| `clientes-prefijotel3` | Prefijo telefónico 3 | `34` |
| `clientes-gesauto` | Gestión automática | `2` |
| `clientes-rgpdwhats` | RGPD WhatsApp | `2` |
| `clientes-nonewsletters` | Newsletters | `3` |
| `clientes-enviosauto` | Envíos automáticos | `1` |

**Body — Selección geográfica y tipos:**

| Parámetro | Descripción | Formato |
|-----------|-------------|---------|
| `selpoli-selpoli` | Polígono de búsqueda | `;lat1+lng1,lat2+lng2,...` (vértices separados por coma, coords con `+`) |
| `seltipos-seltipos` | Tipos de propiedad con labels | `,id,Nombre,id2,Nombre2,...` |
| `poli` | Polígono (duplicado) | Mismo formato que `selpoli-selpoli` |
| `tipos` | IDs de tipos (duplicado) | `,2799,2899,...` |
| `zonas` | Zonas seleccionadas (vacío si por área) | `` |
| `valorstars-dem` | Valoraciones (JSON URL-encoded) | `{"0":{"idestrella":1,...},...}` |

**Respuesta exitosa:** `200 OK`, `text/html`. Contiene JavaScript ejecutable con:

- `tmprecibido='38900689'` — **ID de la demanda creada** (`cod_dem`)
- `arrficha["fichacliente"]["38900689"]` — Array con todos los datos persistidos (demanda + cliente), pares clave-valor separados por `-.TABLA.-`
- `jsonHistorico` — Historial de estados
- `jsonValoracionesDem` — Valoraciones iniciales
- IDs generados: `cod_dem` (demanda) y `cod_cli` (cliente)

**Datos clave de la respuesta:**

| Dato | Valor | Cómo extraerlo |
|------|-------|-----------------|
| ID demanda | `38900689` | `tmprecibido='(\d+)'` |
| ID cliente | `58076860` | `'cod_cli','(\d+)'` del array |
| Número demanda | `1076` | `'numdemanda','(\d+)'` del array |
| Estado | `20` (Buscando) | `'keysitu','(\d+)'` |

---

#### Paso 3 — Recarga de ficha post-guardado

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/cargas/fichacliente/fichacliente.php` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |

**Body:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `crwhere` | Filtro de la demanda creada | `demandas.cod_dem;=;38900689;` |
| `otraagencia` | (vacío) | `` |
| `soyajax` | `1` | |
| `miid` | ID sesión (se regenera) | `11636.210504...` |
| `l` | `{{SESSION_TOKEN}}` | |
| `id_pestanya` | ID pestaña | `210504_1773091216` |

**Respuesta:** Misma estructura que el paso 2 (array JS con datos del cliente + demanda actualizados). Uso: confirmar que la demanda se persistió correctamente.

---

#### Campos mínimos obligatorios para crear demanda

Basado en el análisis, los campos realmente necesarios para una creación exitosa son:

**Sesión:** `l`, `miid`, `id_pestanya`, `soyajax`  
**Query:** `SoyNuevo=1`, `eS=0`, `cache=...`

**Demanda:**
- `demandas-cod_dempriclave` = `-_NEW_-`
- `demandas-keyagente` (agente asignado)
- `demandas-keysitu` (estado: 20=Buscando)
- `demandas-fecha` = `.auto_1.`
- `demandas-numdemanda` = `.auto_3.`
- `demandas-contienecli` = `keycli`
- `demandas-keycliclaveext` = `clientes.cod_cli`
- `nbclave` = `demandas.cod_dem`

**Cliente:**
- `clientes-cod_clipriclave` = `-_NEW_-` (o ID existente si ya existe)
- `clientes-nombre`
- `clientes-apellidos`

**Al menos uno de:** `tipopropiedad`, `seltipos-seltipos`, `tipos` para definir qué busca.

---

#### Notas para automatización

- El flag `SoyNuevo=1` en la URL es lo que distingue creación de edición.
- Los valores `.auto_1.` y `.auto_3.` son placeholders que el servidor resuelve (fecha actual y número correlativo).
- `-_NEW_-` como valor de `cod_dempriclave` / `cod_clipriclave` indica registro nuevo.
- Si el cliente ya existe, se puede pasar su `cod_cli` en lugar de `-_NEW_-` y omitir los campos `clientes-*`.
- La respuesta no es JSON sino JavaScript evaluable; parsear con regex (`tmprecibido`, `arrficha`).
- El `miid` cambia entre requests; parece generarse como `agencia.agente.timestamp1.timestamp2_agencia`.

---

### 7.2 Actualizar Demanda (modificar datos existentes)

#### Flujo completo

| Paso | Request | Propósito |
|------|---------|-----------|
| 1 | `POST /new/app/api/v1/paginacion/` | Listar demandas y cargar vista |
| 2 | `POST /new/app/ventanas/fichacliente/ficha.php` | Cargar el HTML completo de la ficha de demanda (modo lectura) |
| 3 | `POST /new/app/cargas/fichacliente/fichacliente.php` | Cargar datos actuales de la demanda (array JS) |
| 4 | (usuario edita campos en la UI) | — |
| 5 | `POST /new/app/cargas/compruebacontacto.php` | Validar que el email/teléfono no esté duplicado |
| 6 | `POST /new/app/guardar/guardar.php` (**sin** `SoyNuevo`) | **Guardado real** de la actualización |
| 7 | `POST /new/app/cargas/fichacliente/fichacliente.php` | Recarga post-guardado para confirmar persistencia |

---

#### Paso 1 — Listado de demandas (paginación)

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/api/v1/paginacion/` |
| **Content-Type** | `application/x-www-form-urlencoded` |

**Body:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `paramjson` | JSON URL-encoded con filtros, vista y datos | `{"general":{"info":{"lostags":"lista_situacion;:;...","ventana":"demandas","data":"demresultados"},...}}` |
| `soyajax` | `1` | |
| `miid` | ID sesión | |
| `l` | `{{SESSION_TOKEN}}` | |
| `id_pestanya` | ID pestaña | |

**Respuesta:** JSON con estructura `{"demandas":{"demresultados":{"info":{...},"datos":[...]}}}` — lista paginada de demandas con campos, IDs y datos de cada fila.

---

#### Paso 2 — Carga de ficha (HTML completo)

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/ventanas/fichacliente/ficha.php?cache={counter}&soycargarcapa=1` |

**Body:** `soyajax=1`, `l={{SESSION_TOKEN}}`

**Respuesta:** HTML de la ficha de demanda completa (121 KB). Contiene el formulario con todos los campos editables, botones ("Editar", "Guardar"), y la estructura de la UI.

---

#### Paso 3 — Carga de datos de la demanda

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/cargas/fichacliente/fichacliente.php` |

**Body:**

| Parámetro | Valor |
|-----------|-------|
| `crwhere` | `demandas.cod_dem;=;{cod_dem};` |
| `soyajax` | `1` |
| `miid` | ID sesión |
| `l` | `{{SESSION_TOKEN}}` |
| `id_pestanya` | ID pestaña |

**Respuesta:** Array JS `arrficha["fichacliente"]["{cod_dem}"]` con todos los datos actuales (misma estructura que en creación).

---

#### Paso 5 — Validación de contacto (pre-guardado)

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/cargas/compruebacontacto.php` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |

**Body:**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `email` | Email a validar | `monarkcorporacion@gmail.com` |
| `tipo` | Tipo de comprobación | `nox` |
| `elcod` | (vacío si es update simple) | `` |
| `elcodcli` | (vacío si es update simple) | `` |
| `fuerza` | Forzar validación | `1` |
| `soyajax` | `1` | |
| `miid` | ID sesión | |
| `l` | `{{SESSION_TOKEN}}` | |
| `id_pestanya` | ID pestaña | |

**Respuesta:** JavaScript ejecutable. Si no hay conflicto, devuelve código que limpia el selector de relación y permite continuar con el guardado.

---

#### Paso 6 — Guardado de actualización (request principal)

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/guardar/guardar.php` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |
| **Headers** | `X-Requested-With: XMLHttpRequest` |

**Query params (diferencias vs creación):**

| Parámetro | Valor | Diferencia vs crear |
|-----------|-------|---------------------|
| `eS` | `0` | Igual |
| `tipocruce` | `1` | Igual |
| `porarea` | `1` | Igual |
| `ref` | `1076` (número real de demanda) | Crear usa `.auto_3.` |
| `idi` | `1` | Igual |
| `envConf` | `true` | Crear usa `false` |
| `cache` | `{agencia}.{contador}.{rev}` | Igual |
| **`SoyNuevo`** | **AUSENTE** | Crear tiene `SoyNuevo=1` |
| **`cruce`** | **AUSENTE** | Crear tiene `cruce=2` |

**Body — Solo 12 parámetros (vs 46 en creación):**

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `demandas-cod_dempriclave` | **ID existente** de la demanda | `38900689` |
| `clientes-cod_clipriclave` | **ID existente** del cliente | `58076860` |
| `demandas-keycliclaveext` | FK al cliente (ID directo) | `58076860` |
| `tipopropiedad` | Tipos de propiedad | `2799,2899,4399,...` |
| `clientes-email` | Campo modificado | `monarkcorporacion@gmail.com` |
| `envConfCorreo` | Enviar email confirmación RGPD | `1` |
| `nbclave` | Tabla.campo clave primaria | `demandas.cod_dem` |
| `soyajax` | `1` | |
| `antagente` | Agente anterior | `210504` |
| `miid` | ID sesión | |
| `l` | `{{SESSION_TOKEN}}` | |
| `id_pestanya` | ID pestaña | |

**Respuesta exitosa:** `200 OK`, `text/html`:

```
//exito;3
popup('Envio email confirmacion','Se ha enviado el email de confirmacion de la RGPD correctamente al contacto',2,8);
tmprecibido='38900689'; var hayerrores=0;var hayerrorestxt='';
```

- `//exito;3` — indica éxito (el número puede ser un código de tipo de operación).
- `tmprecibido='38900689'` — ID de la demanda actualizada.
- `hayerrores=0` — sin errores.
- Si `envConf=true` y hay email nuevo, dispara envío de email de confirmación RGPD.

---

#### Diferencias clave: crear vs actualizar

| Aspecto | Crear | Actualizar |
|---------|-------|------------|
| `SoyNuevo` en URL | `SoyNuevo=1` | **ausente** |
| `cruce` en URL | `cruce=2` | **ausente** |
| `ref` en URL | `.auto_3.` (placeholder) | `1076` (número real) |
| `envConf` en URL | `false` | `true` |
| `cod_dempriclave` | `-_NEW_-` | ID existente (`38900689`) |
| `cod_clipriclave` | `-_NEW_-` | ID existente (`58076860`) |
| `keycliclaveext` | `clientes.cod_cli` (nombre FK) | `58076860` (valor directo) |
| Campos en body | **46** (todo) | **12** (solo lo modificado + sesión) |
| Response | Array JS completo | `//exito;N` + popup |

---

#### Notas para automatización de updates

- **Solo se envían los campos que cambiaron** más los identificadores (`cod_dempriclave`, `cod_clipriclave`) y parámetros de sesión. No hay que reenviar toda la ficha.
- La **ausencia** de `SoyNuevo` en la URL es lo que indica al servidor que es una edición.
- `ref` en la URL pasa a ser el **número de demanda real** (no un placeholder).
- `antagente` indica el agente anterior (útil si se reasigna).
- `envConfCorreo=1` dispara el envío del email de confirmación RGPD al nuevo email; omitir si no se quiere enviar.
- Antes de guardar, el front ejecuta `compruebacontacto.php` para validar emails/teléfonos y detectar duplicados. En automatización, este paso puede omitirse si se sabe que el contacto es nuevo, pero conviene incluirlo para evitar datos inconsistentes.
- La respuesta de éxito empieza con `//exito;` — parsear con regex `/\/\/exito;(\d+)/`.
- Si hay error, la respuesta incluye `hayerrores=1` y `hayerrorestxt` con el mensaje.

---

### 7.3 Listar Propiedades (lectura paginada)

#### Endpoint principal

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/api/v1/paginacion/` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |
| **Headers** | `X-Requested-With: XMLHttpRequest` |

---

#### Flujo completo (3 requests por navegación)

| Paso | Request | Propósito |
|------|---------|-----------|
| 1 | `POST /new/app/api/v1/paginacion/` con `ventana=cofe` | Carga la estructura de la vista (HTML del menú, filtros, barras) |
| 2 | `POST /new/app/api/v1/paginacion/` con `paramjson` | **Carga los datos** de propiedades (JSON paginado) |
| 3 | `POST /new/app/api/v1/paginacion/?eS=0` con `vista=paginacion_ofertas` | Carga los controles de paginación (HTML de botones) |

Para automatización, solo el **Paso 2** es necesario (los datos reales).

---

#### Paso 1 — Carga de estructura de vista

**Body:**

| Parámetro | Valor |
|-----------|-------|
| `ventana` | `cofe` |
| `soyajax` | `1` |

**Respuesta:** JSON con `{"cofe":{"info":{"vista":"<HTML>","cargajs":{...}}}}` — HTML del contenedor de la vista de propiedades (menú, filtros, barra de herramientas). Solo relevante para la UI.

---

#### Paso 2 — Carga de datos (request principal)

**Body:**

| Parámetro | Descripción |
|-----------|-------------|
| `paramjson` | JSON URL-encoded con filtros, paginación y configuración (ver estructura abajo) |
| `soyajax` | `1` |
| `miid` | ID sesión |
| `l` | `{{SESSION_TOKEN}}` |
| `id_pestanya` | ID pestaña |
| `verValoraPropietarios` | `1` |

**Estructura de `paramjson`:**

```json
{
  "general": {
    "info": {
      "lostags": "lista_disponibilidad;:;lista;:;lista;:;1,7,18,40,41;:;",
      "numvistas": 1,
      "ventana": "cofe",
      "data": "oferesultados"
    },
    "param": {
      "soloRefSearch": "1",
      "noSoloRefSearch": "0",
      "tiporev": "0",
      "verValoraPropietarios": 1,
      "fechaalta": "1",
      "fechaact": "0",
      "fechaexclualta": "1",
      "fechaexclubaja": "0"
    },
    "filtro": "",
    "campo": {
      "ofertas.patio": { "valor": "0" },
      "ofertas.salida_humos": { "valor": "0" }
    }
  },
  "oferesultados": {
    "info": {
      "ficha": "cofe",
      "data": "oferesultados",
      "posicion": 0,
      "jsonvista": "1",
      "totalreg": 0
    },
    "ordentipo": false,
    "orden": false
  }
}
```

**Campos clave del `paramjson`:**

| Campo | Descripción |
|-------|-------------|
| `general.info.ventana` | `cofe` = propiedades (ofertas) |
| `general.info.data` | `oferesultados` = vista de resultados |
| `general.info.lostags` | Filtro por disponibilidad: `1,7,18,40,41` (estados activos) |
| `general.filtro` | Filtro de texto libre (vacío = sin filtrar) |
| `general.campo` | Filtros por campo específico |
| `oferesultados.info.posicion` | **Offset de paginación** (0, 10, 20...) |
| `oferesultados.info.paginacion` | Tamaño de página (`"10"` por defecto) |
| `oferesultados.info.totalreg` | Total de registros (0 en primera request; el servidor lo calcula) |
| `oferesultados.ordentipo` | `"desc"` o `false` |
| `oferesultados.orden` | Campo de orden o `false` |

---

#### Paginación

El sistema usa paginación por offset:

| Página | `posicion` | Items |
|--------|-----------|-------|
| 1 | `0` | 10 |
| 2 | `10` | 10 |
| 3 | `20` | 10 |
| N | `(N-1) * paginacion` | hasta `paginacion` |

En este HAR: **31 propiedades totales**, 3 páginas de 10+10+11.

Para iterar todas: empezar con `posicion=0`, leer `pagactual` y `totalpaginas` de la respuesta (o contar items devueltos < paginación), incrementar `posicion += paginacion` hasta agotar.

---

#### Respuesta — Estructura JSON

```json
{
  "cofe": {
    "oferesultados": {
      "info": {
        "vista": "oferesultados",
        "ficha": "cofe",
        "data": "oferesultados",
        "tipopag": "_ofertas",
        "posicion": 0,
        "paginacion": 10,
        "pagactual": 1,
        "campos": { "codigo": {"pos":0}, "titulo": {"pos":3}, ... }
      },
      "datos": [
        {
          "acciones": [],
          "fields": [
            { "campo": "codigo", "value": "28208731" },
            { "campo": "titulo", "value": {"titulo_1": "Piso en...", ...} },
            ...
          ]
        }
      ]
    }
  }
}
```

---

#### Campos por propiedad (93 campos)

**Identificadores:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `codigo` / `cod_ofer` | ID único de la propiedad | `28208731` |
| `ref` | Referencia interna | `URUS08VFEDE` |
| `numagencia` | ID agencia | `11636` |
| `numsucursal` | ID sucursal | `11636` |

**Datos principales:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `titulo` | Objeto: `titulo_1` (título principal), `tipo_titulo` | `"Piso en Córdoba (Campo de la Verdad Zona Alta)"` |
| `tipo_ofer` | Tipo de propiedad (texto) | `Piso` |
| `key_tipo` | ID tipo propiedad | `3399` |
| `precioinmo` | Precio de venta (numérico) | `72500` |
| `precioalq` | Precio de alquiler | `0` |
| `preciotraspaso` | Precio traspaso | `0` |
| `preciosformateados` | Objeto con precios formateados y €/m² | `{"precioinmo":"72.500","preciometros":"1.343",...}` |
| `m_cons` | Metros construidos | `54.00` |
| `m_uties` | Metros útiles | `50.00` |
| `m_parcela` | Metros parcela | `0` |
| `m_terraza` | Metros terraza | `0.00` |
| `habitaciones` | Habitaciones | `2` |
| `habdobles` | Habitaciones dobles | `1` |
| `banyos` | Baños | `1` |
| `aseos` | Aseos | `0` |
| `planta` | Planta | `2` |
| `ascensor` | Ascensor (0/1) | `1` |
| `antiguedad` | Año de construcción | `1962` |
| `conservacion` | ID estado conservación | `20` |
| `estconser` | Estado conservación (texto) | `Entrar a vivir` |

**Ubicación:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `key_loca` | ID localidad | `224499` |
| `key_zona` | ID zona | `3115699` |
| `ciudad` | Ciudad (texto) | `Córdoba` |
| `zona` | Zona (texto) | `Campo de la Verdad Zona Alta` |

**Estado y fechas:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `estadoficha` | Estado de la ficha (3=activa) | `3` |
| `lisestado` | Estado (texto) | `Libre` |
| `nodisponible` | No disponible (0/1) | `0` |
| `soyprospecto` | Es prospecto (0/1) | `0` |
| `fecha` | Fecha de alta | `2026-02-26 16:05:17` |
| `fechaact` | Fecha última actualización | `2026-03-05 16:22:29` |

**Agente y extras:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `keyagente` | ID agente asignado | `209270` |
| `usernombre` | Nombre del agente | `FEDE` |
| `userape` | Apellidos del agente | `CARRILLO RAMOS` |
| `numfotos` | Número de fotos | `18` |
| `lafoto` | URL de la foto principal | `fotos15.apinmo.com/11636/28208731/3-1s.jpg` |
| `portales` | Array de portales publicados | `[{"nombre":"idealista","icono":"..."},...]` |
| `numcruces` | Cruces con demandas | `1` |
| `porcentaje_calidad` | Calidad de la ficha (%) | `70` |
| `exclu` | Es exclusiva (0/1) | `0` |
| `agencia` | Nombre agencia | `Urus Capital Group` |

**Características adicionales:**

| Campo | Descripción |
|-------|-------------|
| `parking`, `plaza_gara` | Parking / plaza garaje |
| `piscina_com`, `piscina_prop` | Piscina comunitaria / privada |
| `muebles` | Amueblado |
| `destacado` | Propiedad destacada |
| `outlet` | Es outlet |
| `opcioncompra` | Opción a compra |
| `sincomision` | Sin comisión |
| `tour` | Tour virtual (4=con tour) |

---

#### Filtros disponibles (`lostags`)

El campo `lostags` usa la sintaxis DSL con separador `;:;`:

```
lista_disponibilidad;:;lista;:;lista;:;1,7,18,40,41;:;
```

Valores de disponibilidad observados: `1,7,18,40,41` (estados activos). Para obtener solo propiedades en un estado concreto, modificar los IDs.

---

#### Notas para automatización (Ingestion Worker)

- El endpoint `paginacion` con `ventana=cofe` y `data=oferesultados` es la **vía principal para leer propiedades**.
- Los paneles (`/api/v1/paneles/`) del dashboard muestran resúmenes; `paginacion` devuelve los datos completos y paginados.
- Para iterar todas las propiedades: hacer POST incrementando `posicion` en bloques de 10 (o el tamaño de `paginacion` que se quiera).
- Para detectar cambios: comparar `fechaact` entre polls sucesivos o mantener un mapa `cod_ofer → fechaact` y emitir evento cuando cambie.
- Se pueden aplicar filtros por campo en `general.campo` (ej: `ofertas.patio`, `ofertas.salida_humos`).
- El `totalreg` se devuelve a partir de la segunda página; en la primera request poner `0` y el servidor lo calcula.
- La respuesta devuelve los campos como array de `{campo, value}` en lugar de un objeto plano — hay que transformar a mapa para uso programático.
- Nombres internos: Inmovilla llama `cofe` (cartera de ofertas) a propiedades, y `ofertas` a la tabla subyacente.

---

### 7.4 Listar Demandas (lectura paginada)

#### Endpoint principal

| Campo | Valor |
|-------|-------|
| **URL** | `POST https://crm.inmovilla.com/new/app/api/v1/paginacion/` |
| **Content-Type** | `application/x-www-form-urlencoded; charset=UTF-8` |
| **Headers** | `X-Requested-With: XMLHttpRequest` |

Usa el **mismo endpoint** que propiedades (`paginacion`), pero con `ventana=demandas` en lugar de `ventana=cofe`.

---

#### Flujo (1 request para datos)

Para automatización, solo se necesita el request de datos (equivalente al Paso 2 de propiedades). No se observaron requests previos de carga de estructura de vista en la captura HAR de demandas.

---

#### Request — Carga de datos

**Body:**

| Parámetro | Descripción |
|-----------|-------------|
| `paramjson` | JSON URL-encoded con filtros, paginación y configuración (ver estructura abajo) |
| `soyajax` | `1` |
| `miid` | ID sesión |
| `l` | `{{SESSION_TOKEN}}` |
| `id_pestanya` | ID pestaña |

**Estructura de `paramjson`:**

```json
{
  "general": {
    "info": {
      "lostags": "lista_situacion;:;lista;:;lista;:;20,23,26,31;:;",
      "numvistas": 1,
      "ventana": "demandas",
      "data": "demresultados"
    },
    "filtro": "",
    "campo": {
      "demandas.desvioalquiler": { "valor": 0 },
      "demandas.desvioventa": { "valor": 0 }
    },
    "ordentipo": "desc"
  },
  "demresultados": {
    "info": {
      "ficha": "demandas",
      "data": "demresultados",
      "posicion": 0,
      "paginacion": "10",
      "jsonvista": "1",
      "totalreg": 0
    },
    "orden": false
  }
}
```

**Campos clave del `paramjson`:**

| Campo | Descripción |
|-------|-------------|
| `general.info.ventana` | `demandas` (vs `cofe` en propiedades) |
| `general.info.data` | `demresultados` (vs `oferesultados` en propiedades) |
| `general.info.lostags` | Filtro por situación: `20,23,26,31` (estados activos de demanda) |
| `general.filtro` | Filtro de texto libre (vacío = sin filtrar) |
| `general.campo` | Filtros por campo: `desvioalquiler` y `desvioventa` (desviación de precio, 0 = sin desviación) |
| `general.ordentipo` | `"desc"` — orden descendente (ubicado en `general`, no en la sección de datos) |
| `demresultados.info.posicion` | **Offset de paginación** (0, 10, 20...) |
| `demresultados.info.paginacion` | Tamaño de página (`"10"` por defecto) |
| `demresultados.info.totalreg` | Total de registros (0 en primera request; el servidor lo calcula) |
| `demresultados.orden` | Campo de orden específico o `false` |

**Valores de `lostags` (situación de demanda):**

| ID | Significado probable |
|----|---------------------|
| `20` | Buscando |
| `23` | (por confirmar) |
| `26` | Cliente de Portal |
| `31` | (por confirmar) |

---

#### Diferencias clave vs propiedades (`paramjson`)

| Aspecto | Propiedades (`cofe`) | Demandas |
|---------|---------------------|----------|
| `ventana` | `cofe` | `demandas` |
| `data` | `oferesultados` | `demresultados` |
| `lostags` tipo | `lista_disponibilidad` | `lista_situacion` |
| `lostags` valores | `1,7,18,40,41` | `20,23,26,31` |
| `campo` filtros | `ofertas.patio`, `ofertas.salida_humos` | `demandas.desvioalquiler`, `demandas.desvioventa` |
| `ordentipo` ubicación | En sección `oferesultados` | En sección `general` |
| `general.param` | Presente (con `soloRefSearch`, `fechaalta`, etc.) | **Ausente** |

---

#### Paginación

Mismo mecanismo que propiedades — paginación por offset:

| Página | `posicion` | Items |
|--------|-----------|-------|
| 1 | `0` | 10 |
| 2 | `10` | 10 |
| N | `(N-1) * paginacion` | hasta `paginacion` |

En la captura HAR: **102 demandas totales**, 11 páginas de 10.

---

#### Respuesta — Estructura JSON

```json
{
  "demandas": {
    "demresultados": {
      "info": {
        "vista": "demresultados",
        "tipopag": "_demandas",
        "ficha": "demandas",
        "data": "demresultados",
        "campos": { "codigo": {"pos":0}, "nombre": {"pos":1}, ... },
        "total": "102",
        "posicion": 10,
        "paginacion": "10",
        "pagtotal": 11,
        "pagactual": 2,
        "pagsig": 3,
        "pagant": 1
      },
      "datos": {
        "10": {
          "acciones": [...],
          "fields": [
            { "campo": "codigo", "value": "38885037" },
            { "campo": "nombre", "value": "Veronica Ordoñez Relaño" },
            ...
          ]
        },
        "11": { ... },
        ...
      }
    }
  }
}
```

**Diferencia estructural vs propiedades:** `datos` es un **objeto con claves numéricas** (posición global del registro: `"10"`, `"11"`, ...) en lugar del array indexado que devuelve propiedades. Las claves son strings del índice global (offset + posición local).

---

#### Campos por demanda (74 campos)

**Identificadores:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `codigo` | ID único de la demanda (`cod_dem`) | `38885037` |
| `numdemanda` | Número secuencial de demanda | `1071` |
| `keycli` | ID del cliente (`cod_cli`) | `58055249` |
| `keyagente` | ID del agente asignado | `177892` |
| `keycomercial` | ID del comercial | `177892` |

**Datos del cliente (embebidos en cada demanda):**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `nombre` | Nombre completo (display) | `Veronica Ordoñez Relaño` |
| `clientenombre` | Nombre | `Veronica` |
| `clienteapellidos` | Apellidos | `Ordoñez Relaño` |
| `email` | Email del cliente | `veronicaordonezrelano@gmail.com` |
| `telefono1` | Teléfono 1 | `` |
| `telefono2` | Teléfono 2 | `625352966` |
| `telefono1_raw` | Teléfono 1 con prefijo | `` |
| `telefono2_raw` | Teléfono 2 con prefijo | `34625352966` |
| `prefijotel1` | Prefijo teléfono 1 | `34` |
| `prefijotel2` | Prefijo teléfono 2 | `34` |
| `fotocliente` | URL avatar del cliente | `fotos15.apinmo.com/siglas/VO.jpg` |

**Criterios de búsqueda de la demanda:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `titulodem` | Título/descripción de la demanda | `3 hab. Asc. , Casco Histórico` |
| `textodemandas` | Texto descriptivo (display) | `3 hab. Asc. , Vistalegre...` |
| `ventadesde` | Precio venta mínimo | `54000` |
| `ventahasta` | Precio venta máximo | `93000` |
| `alquilerdesde` | Precio alquiler mínimo | `0` |
| `alquilerhasta` | Precio alquiler máximo | `0` |
| `tipomes` | Tipo temporal | `MES` |
| `habitacionmin` | Habitaciones mínimas | `3` |
| `banosmin` | Baños mínimos | `1` |
| `ascensor` | Requiere ascensor (0/1) | `1` |
| `preciosdem` | Objeto con precios formateados | `{"alquilerformateado":0,"ventaformateado":"54.000€ - 93.000€"}` |

**Estado y fechas:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `keysitu` | ID de situación | `26` |
| `idlista` | ID del estado en lista | `26` |
| `listipo` | Tipo/estado en texto | `Cliente de Portal` |
| `nodisponible` | No disponible (0/1) | `0` |
| `fecha` | Fecha de alta | `2026-03-09 08:25:58` |
| `fechaact` | Fecha última actualización | `2026-03-09 08:25:58` |
| `fechaaltamostrar` | Fecha alta formateada (display) | `09/03/2026` |
| `fechaactmostrar` | Fecha act relativa (display) | `2 días` |
| `prioridad` | Prioridad numérica | `1` |

**Agente/Comercial:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `comercialdemandas` | URL foto del comercial | `fotos15.apinmo.com/11636/usuarios/177892.jpg` |
| `usernombre` | Nombre del comercial | `Miguel` |
| `userapellidos` | Apellidos del comercial | `Angel Carrillo Ramos` |
| `siglas` | Siglas del comercial | `MA` |
| `userid` | ID de usuario del comercial | `177892` |
| `useragencia` | ID agencia del comercial | `11636` |
| `color` | Color asignado al comercial | `#529405` |

**Cruces y seguimiento:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `crucesdemandas` | Número de cruces (display) | `1` |
| `numcruces` | Número de cruces (numérico) | `0` |
| `numinteres` | Número de interesados | `0` |
| `ultimoseg` | Último seguimiento (texto) | `Creada Automaticamente` |
| `contactadopor` | Medio de captación | `idealista.com` |
| `cantdisponible` | Cantidad disponible | `` |
| `refcierre` | Referencia de cierre | `` |
| `visita` | Visita programada | `` |
| `visitarealizada` | Visita realizada | `` |

**RGPD y permisos:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `gesauto` | Gestión automática | `5` |
| `rgpdwhats` | RGPD WhatsApp | `5` |
| `rgpdtel` | RGPD teléfono (clase CSS) | `text-verde` |
| `nonewsletters` | No newsletters | `0` |
| `rgpdmail` | RGPD mail (clase CSS) | `text-amarillo-dark` |

**Display/UI:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `colormostrar` | Color de fila | `#FFFFFF` |
| `prioridadmostrar` | Prioridad display | `` |
| `mostrarllamar` | Mostrar botón llamar | `1` |
| `telefonodemandasmostrar` | Mostrar teléfono | `1` |
| `llamar` | Flag de llamada | `1` |
| `tipocliente` | Tipo de cliente (HTML) | `<div>...Comprador...</div>` |
| `leads` | Leads asociados | `` |
| `logo` | Logo | `0` |
| `visibilidadtotal` | Visibilidad total | `0` |
| `valoracioncli` | Valoración del cliente | `` |
| `valoracliente` | Valoración numérica | `0` |

---

#### Filtros disponibles (`lostags`)

El campo `lostags` para demandas usa `lista_situacion` (vs `lista_disponibilidad` en propiedades):

```
lista_situacion;:;lista;:;lista;:;20,23,26,31;:;
```

Para filtrar por un estado concreto, modificar los IDs (ej: solo `20` para demandas "Buscando").

---

#### Notas para automatización (Ingestion Worker)

- El endpoint `paginacion` con `ventana=demandas` y `data=demresultados` es la **vía principal para leer demandas** — mismo patrón que propiedades.
- Para iterar todas las demandas: hacer POST incrementando `posicion` en bloques de 10 (o el tamaño de `paginacion`).
- Para detectar cambios: comparar `fechaact` entre polls sucesivos o mantener un mapa `cod_dem → fechaact` y emitir evento cuando cambie.
- El `totalreg` se devuelve a partir de la segunda página; en la primera request poner `0` y el servidor lo calcula.
- La respuesta devuelve `datos` como **objeto con claves numéricas** (no array) — iterar con `Object.values(datos)` o `Object.entries(datos)`.
- Dentro de cada entrada, los campos son un array de `{campo, value}` — transformar a mapa para uso programático.
- Cada demanda incluye datos del **cliente embebidos** (`clientenombre`, `clienteapellidos`, `email`, `telefono1/2`, `keycli`) — no hace falta un request adicional para obtener datos básicos del cliente.
- El campo `contactadopor` indica la fuente (ej: `idealista.com`, `fotocasa.es`).
- Nombres internos: Inmovilla llama `demandas` a la ventana y `demresultados` a la vista de datos.
- El side-effect `POST /new/app/googlecontacts/crearContactosMasivo.php` se dispara automáticamente al cargar la vista (response: `x`); no es necesario invocarlo manualmente.

---

## 8. Servicios externos detectados

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

## 9. Uso en scripts (Playwright / Node)

### Login


**Selectores UI (script `inmovilla-login.ts`):**

- Credenciales: `#claveofi`, `#user`, `#pass`.
- Botón "Acceder": `#entrar` (el botón no tiene `type="submit"` ni `id="btnLogin"`).
- Pantalla 2FA: seis inputs individuales con `input[maxlength="1"]`; escribir el código con `page.keyboard.type(code)` tras hacer click en el primero (el componente auto-avanza y auto-envía al completar los 6 dígitos).

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

Usar POST /new/app/api/v1/paginacion/ con paramjson (ver § 7.3):
1. Construir el paramjson con ventana=cofe, data=oferesultados, posicion=0.
2. Enviar con l, miid, id_pestanya, soyajax=1.
3. Parsear response.cofe.oferesultados.datos — array de propiedades con 93 campos cada una.
4. Si datos.length === paginacion, incrementar posicion += paginacion y repetir.
5. Para detección de cambios, comparar fechaact de cada cod_ofer entre polls.

### Listado de demandas

Usar POST /new/app/api/v1/paginacion/ con paramjson (ver § 7.4):
1. Construir el paramjson con ventana=demandas, data=demresultados, posicion=0.
2. Enviar con l, miid, id_pestanya, soyajax=1.
3. Parsear response.demandas.demresultados.datos — **objeto** con claves numéricas, cada entrada con 74 campos.
4. Si Object.keys(datos).length === paginacion, incrementar posicion += paginacion y repetir.
5. Para detección de cambios, comparar fechaact de cada cod_dem entre polls.
6. Cada demanda incluye datos del cliente embebidos (nombre, email, teléfono, keycli).

---

## 10. Placeholders de seguridad

Al usar este documento en código o en otros entornos, sustituir siempre:

- `{{INMOVILLA_USER}}` — usuario
- `{{INMOVILLA_PASSWORD}}` — contraseña
- `{{INMOVILLA_OFFICE_KEY}}` — clave de oficina
- `{{2FA_CODE}}` — código 2FA de un solo uso
- `{{SESSION_TOKEN}}` — valor del parámetro `l` tras el login

No commitear credenciales ni tokens reales.

---

*Última actualización: 2026-03-11 — Fase 3: operaciones CRUD (crear/actualizar demanda), lectura paginada de propiedades y demandas.*
