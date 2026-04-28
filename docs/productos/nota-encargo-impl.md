# Nota de Encargo Digital — Especificación de Implementación

## Resumen

Sistema que automatiza la "Nota de Encargo Inmobiliaria": desde que el comercial agenda una visita de captación en la plataforma (`/platform/captacion/nueva`), hasta que el propietario firma digitalmente el documento — todo por WhatsApp.

> **Nota (abril 2026):** El trigger original era un cron que detectaba tareas en Inmovilla (tasks ingestion worker). Se refactorizó a un formulario local en la plataforma para eliminar la dependencia de Inmovilla como punto de entrada, reducir la latencia de 20 min a inmediata, y simplificar la superficie de mantenimiento. La creación de prospecto en Inmovilla al final del flujo también se eliminó.
>
> **Nota (abril 2026 — matching diferido):** La creación desde plataforma ya no selecciona una propiedad existente ni pide la referencia interna URUS. El comercial introduce la referencia catastral; si ya existe una propiedad sincronizada con `PropertyCurrent.refCatastral` se vincula al instante, y si no existe todavía la sesión queda en `PENDIENTE_PROPIEDAD`. Cuando el worker de ingesta emite `PROPIEDAD_CREADA` para una propiedad con esa misma referencia catastral (`raw.rcatastral`), `lib/nota-encargo/ref-matcher.ts` completa `propertyCode`, `propertyRef`, dirección, precio y tipo de operación, copia los datos de propietario a `PropertyCurrent` y rebindea documentos/firma que se hubieran creado con `operationId = NOTA:<sessionId>`. Detalle operativo en `docs/nota-encargo-matching-diferido.md`.

---

## 1. Flujo completo

```
┌─────────────────────────────────────────────────────────────┐
│  PLATAFORMA URUS (/platform/captacion/nueva)                 │
│                                                              │
│  Comercial:                                                  │
│    1. Introduce la referencia catastral del inmueble         │
│    2. Introduce teléfono del propietario                     │
│    3. Selecciona fecha + hora de visita                      │
│    4. Clic en "Agendar Nota de Encargo"                      │
│                                                              │
│  → POST /api/captacion/nota-encargo                          │
│    1. Crea NotaEncargoSession                                │
│       (PENDING o PENDIENTE_PROPIEDAD)                        │
│    2. Si existe PropertyCurrent: prellenar dirección/precio   │
│       Si no existe: mantener datos de inmueble pendientes     │
│    3. Emite NOTA_ENCARGO_DETECTADA                           │
│    4. Programa job NOTA_ENCARGO_RECORDATORIO                 │
│       con availableAt = visitDateTime - 2h                   │
│       (si faltan < 2h → inmediato)                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  JOB: NOTA_ENCARGO_RECORDATORIO (2h antes de la visita)      │
│                                                              │
│  Envía plantilla WhatsApp al propietario:                     │
│    "Hola, tiene una visita programada para las 16:00.         │
│     ¿Confirma su asistencia?"                                 │
│    [Confirmo] [No puedo]                                      │
│                                                              │
│  Programa job NOTA_ENCARGO_CHECK_CONFIRMACION                 │
│    con availableAt = visitDateTime - 30min                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
┌──────────────────┐  ┌──────────────────────────────────────┐
│  Propietario     │  │  JOB: NOTA_ENCARGO_CHECK_CONFIRMACION │
│  pulsa "Confirmo"│  │  (30min antes de la visita)            │
│                  │  │                                        │
│  Webhook →       │  │  Si state != CONFIRMADA:               │
│  Handler detecta │  │    Envía plantilla al comercial:       │
│  el button_reply │  │    "El propietario no confirmó la      │
│  → Actualiza     │  │     visita de captación para URUS36VMA"│
│  state =         │  │    Actualiza state = NO_CONFIRMADA     │
│  CONFIRMADA      │  │                                        │
│                  │  │  Si state == CONFIRMADA:                │
│  Programa job    │  │    No-op (ya se programó el Flow)      │
│  NOTA_ENCARGO_   │  └──────────────────────────────────────┘
│  ENVIAR_         │
│  FORMULARIO      │
│  availableAt =   │
│  visitDateTime   │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  JOB: NOTA_ENCARGO_ENVIAR_FORMULARIO (hora de la visita)     │
│                                                              │
│  Envía WhatsApp Flow (formulario interactivo):               │
│                                                              │
│  Pantalla 1 — Datos Personales:                               │
│    - Nombre completo (TextInput)                              │
│    - DNI/NIF (TextInput, pattern)                             │
│    - Teléfono (TextInput, phone)                              │
│    - Domicilio fiscal (TextArea)                              │
│                                                              │
│  Pantalla 2 — Datos del Encargo:                              │
│    - Dirección inmueble (prellenado, TextInput readonly)      │
│    - Referencia catastral (prellenado, solo lectura)          │
│    - Operación: Venta/Alquiler (prellenado, RadioButtons)     │
│    - Precio (prellenado, TextInput readonly)                  │
│    - Duración encargo en meses (TextInput number)             │
│    - Tipo nota: N1/N2/N3 (RadioButtonsGroup)                 │
│                                                              │
│  Pantalla 3 — LOPD:                                           │
│    - Texto legal completo (TextBody)                          │
│    - Acepto (OptIn, required)                                 │
│    - [Enviar] (Footer complete)                               │
│                                                              │
│  flow_action_data inicial (prellenado):                       │
│    { direccion, tipoOperacion, precio, refCatastral,        │
│      propertyRef cuando ya exista }                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  WEBHOOK: Respuesta del Flow (nfm_reply)                     │
│                                                              │
│  1. Parsea response_json → datos del formulario               │
│  2. Persiste en NotaEncargoSession                            │
│  3. Genera PDF de Nota de Encargo (pdf-lib)                   │
│  4. Sube PDF a Cloudinary                                     │
│  5. Crea LegalDocument (NOTA_ENCARGO) + LegalDocumentParty   │
│  6. Crea SignatureRequest (hash, token, signingUrl)           │
│  7. Emite FIRMA_ENVIADA                                       │
│  8. Handler existente envía link de firma por WhatsApp        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  PÁGINA DE FIRMA /firma/{token}                              │
│                                                              │
│  (Reutiliza sistema existente 100%)                          │
│  1. Propietario ve el PDF de la Nota de Encargo               │
│  2. Dibuja firma manuscrita                                   │
│  3. OTP por SMS                                               │
│  4. Se genera PDF sellado + audit trail                       │
│  5. Evento FIRMA_COMPLETADA → envía PDF firmado al propietario por WhatsApp │
│     + notifica al comercial                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Modelos de datos (Prisma)

> **Nota:** La tabla `TaskSnapshot` fue eliminada en el refactor de abril 2026.
> El campo `taskSnapshotId` y `inmovillaCodOfer` también se eliminaron de `NotaEncargoSession`.

### 2.1 NotaEncargoSession

```prisma
enum NotaEncargoState {
  PENDING
  RECORDATORIO_ENVIADO
  CONFIRMADA
  NO_CONFIRMADA
  FORMULARIO_ENVIADO
  FORMULARIO_COMPLETADO
  FIRMA_ENVIADA
  FIRMADA
  DOCUMENTO_ENVIADO
  CANCELADA
}

model NotaEncargoSession {
  id                  String            @id @default(cuid())
  propertyCode        String?
  propertyRef         String?
  refCatastral        String?
  comercialId         String
  propietarioPhone    String
  visitDateTime       DateTime

  state               NotaEncargoState  @default(PENDING)

  // Datos prellenados desde PropertySnapshot.raw (API route los extrae)
  direccion           String            @default("")
  tipoOperacion       String            @default("")   // VENTA | ALQUILER
  precio              Float             @default(0)

  // Datos del formulario (propietario rellena vía WhatsApp Flow)
  propietarioNombre   String?
  propietarioDni      String?
  propietarioTelefono String?
  domicilioFiscal     String?
  duracionMeses       Int?
  tipoNotaEncargo     String?           // N1 | N2 | N3
  aceptaLopd          Boolean?

  // Referencias a firma
  legalDocumentId     String?
  signatureRequestId  String?
  documentUrl         String?
  signedDocumentUrl   String?

  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  @@index([state])
  @@index([propertyCode])
  @@index([propertyRef])
  @@index([refCatastral])
  @@index([propietarioPhone, state])
  @@map("nota_encargo_sessions")
}
```

### 2.2 Enums relevantes en schema.prisma

```prisma
// EventType:
  NOTA_ENCARGO_DETECTADA
  NOTA_ENCARGO_CONFIRMADA
  NOTA_ENCARGO_NO_CONFIRMADA
  NOTA_ENCARGO_FORMULARIO_COMPLETADO

// JobType:
  NOTA_ENCARGO_RECORDATORIO
  NOTA_ENCARGO_CHECK_CONFIRMACION
  NOTA_ENCARGO_ENVIAR_FORMULARIO
```

---

## 3. Bloques de implementación

> **Abril 2026 — Bloques eliminados por el refactor:**
> - **Bloque 1 (HAR)**: ya no aplica — no se consume la API de tareas de Inmovilla.
> - **Bloque 2 (Tasks Ingestion Worker)**: eliminado completamente. El trigger ahora es `POST /api/captacion/nota-encargo` desde `/platform/captacion/nueva`.
> - La creación de prospecto (`CREAR_PROSPECTO_INMOVILLA`) se eliminó del Bloque 3.
> - Bloques 3-8 se mantienen vigentes (handlers, WhatsApp Flow, PDF, firma, plantillas).

### Bloque 1: Análisis del HAR de Tareas (ELIMINADO)

> **Status:** Completado. HAR capturado en `docs/crm.inmovilla.com.har`. Análisis completo en `docs/tareas.md`.

**Hallazgos clave del HAR:**

#### Endpoint principal

Las tareas **NO usan `tareasresul.php`** como se asumió inicialmente. Usan el mismo endpoint unificado de paginación:

```
POST https://crm.inmovilla.com/new/app/api/v1/paginacion/
```

Con `ventana: "tareas-pendientes"` y 5 vistas de datos paralelas.

#### Dos endpoints para obtener datos de una tarea


| #   | Endpoint                                    | Datos que devuelve                                                                             |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `POST /new/app/api/v1/paginacion/`          | Listado: 22 campos por tarea (fecha, hora, tipo, asunto, agente, refs) — **sin observaciones** |
| 2   | `GET /new/app/api/v2/seguimientos/{codseg}` | Detalle REST JSON: ~30 campos **incluyendo `descrip` (observaciones)**                         |


**Implicación crítica:** El listado no trae las observaciones. Para detectar tareas de captación hay que:

1. Listar tareas con paginación (filtro por tipo `keytiposeg:53` = "Reportaje Fotográfico")
2. Para cada tarea nueva, hacer GET al endpoint v2 para obtener `descrip` (observaciones)

#### Formato real de las observaciones (del HAR)

El campo `seguimiento.descrip` usa HTML del editor CKEditor:

```
URUS36VMA<br />~666 777 888
```

- Separador de línea: `<br />` (no `\n`)
- El teléfono puede tener prefijo `~` y espacios: `~666 777 888`

#### Tarea real capturada en el HAR (codseg: 4470)

**En el listado** (`tareasresultados_manyana`):

```json
{
  "codigo": "4470",
  "fecha": "2026-04-16",
  "hora": "16:00",
  "nombreSeguimiento": "Visita → Reportaje Fotográfico",
  "keypadre": "5143",
  "asunto": "Captación",
  "nombreAgente": "Miguel Angel Carrillo Ramos",
  "referenciaPropiedad": "",
  "codigoPropiedad": "0",
  "codigoDemanda": "0",
  "codigoContacto": "0"
}
```

**En el detalle** (`GET /api/v2/seguimientos/4470`):

```json
{
  "seguimiento.codseg": 4470,
  "seguimiento.asunto": "Captación",
  "seguimiento.descrip": "URUS36VMA<br />~666 777 888",
  "seguimiento.keyagente": 177892,
  "seguimiento.keytiposeg": 53,
  "seguimiento.fechaaviso": "2026-04-16 16:00:00",
  "seguimiento.fechaalta": "2026-04-15 15:41:49",
  "seguimiento.tareacerrada": 0,
  "seguimiento.keyofe": 0,
  "seguimiento.duracion": 1,
  "seguimiento.confirmado": 0,
  "seguimiento.altaagente": 212632,
  "seguimiento.keyagente_nombre": "Miguel",
  "seguimiento.keyagente_apellidos": "Angel Carrillo Ramos"
}
```

#### Tipos de tarea observados (`keytiposeg` → nombre)


| keytiposeg | nombre                    | Relevante                  |
| ---------- | ------------------------- | -------------------------- |
| 50         | Apunte                    | No                         |
| 5024       | Existente                 | No                         |
| 38         | Respondida                | No                         |
| 4996       | Programada                | No                         |
| 42         | Nuevo                     | No                         |
| **53**     | **Reportaje Fotográfico** | **Sí — tipo de captación** |


#### Vistas de datos del listado


| Vista                        | Contenido                | Page size |
| ---------------------------- | ------------------------ | --------- |
| `tareasresultadosselect`     | Contadores por tipo      | 100       |
| `tareasresultados_atrasadas` | Tareas vencidas          | 30        |
| `tareasresultados_hoy`       | Tareas de hoy            | 30        |
| `tareasresultados_manyana`   | Tareas de mañana         | 30        |
| `tareasresultados_proximos`  | Tareas futuras (>mañana) | 30        |


#### Filtro DSL

```
seguimiento.keyagente;in;177892;
```

Formato: `tabla.campo;operador;valor;` — separado por `;`. Múltiples valores con `,`.

#### Campos del listado (22 campos por tarea)

```
codigo, fecha, hora, nombreSeguimiento, keypadre, imagenSeguimiento,
pendienteConfirmacion, fotoAgente, referenciaPropiedad, referenciaDemanda,
referenciaContacto, asunto, imagenEtiqueta, duracion, keynegocio,
visible_embudo, nombreAgente, repetir, segCreadorRepeticion,
codigoPropiedad, codigoDemanda, codigoContacto
```

---

### Bloque 2: Tasks Ingestion Worker (ELIMINADO)

**Archivos a crear:**


| Archivo                                        | Rol                                             |
| ---------------------------------------------- | ----------------------------------------------- |
| `lib/workers/ingestion/tasks/tasks-worker.ts`  | Orquestador del ciclo de ingestión              |
| `lib/workers/ingestion/tasks/tasks-fetcher.ts` | Fetch de tareas: listado + detalle por `codseg` |
| `lib/workers/ingestion/tasks/tasks-parser.ts`  | Parser de `descrip` HTML (ref + teléfono)       |
| `lib/workers/ingestion/tasks/tasks-diff.ts`    | Diff snapshot: nuevas tareas no procesadas      |
| `app/api/cron/ingestion/tasks/route.ts`        | Endpoint cron (QStash cada 20 min)              |


#### Estrategia de fetch (2 fases)

A diferencia de propiedades/demandas, las tareas requieren **dos requests por tarea nueva** porque el listado no trae las observaciones (`descrip`):

```
runTasksIngestionCycle()
  1. loginToInmovilla()           // reutiliza lib/inmovilla/auth/login.ts

  ── Fase 1: Listado ──
  2. fetchTaskList(session)       // POST /api/v1/paginacion/ con las 4 vistas temporales
     → Solo tareas con nombreSeguimiento que contenga "Reportaje Fotográfico"
     → Filtra por keytiposeg == 53 si es posible, o por nombre post-fetch
  3. loadPreviousTaskSnapshots()  // SELECT inmovillaTaskId FROM task_snapshots
  4. diffTasks()                  // IDs nuevos = listado - snapshots existentes

  ── Fase 2: Detalle (solo nuevas) ──
  5. Para cada tarea nueva:
       a. GET /api/v2/seguimientos/{codseg}   // Obtiene descrip (observaciones)
       b. Parsea descrip HTML → { ref, phone }
       c. Si parseo falla → skip (no es tarea de captación válida)
       d. Busca PropertyCurrent + PropertySnapshot por ref
       e. Si propiedad no encontrada → skip con log warning
       f. Extrae datos de propiedad (dirección, precio, tipo, referencia catastral desde `raw.rcatastral` si consta)
       g. Guarda TaskSnapshot
       h. Crea NotaEncargoSession con datos prellenados
       i. appendEvent(NOTA_ENCARGO_DETECTADA)
       j. enqueueJob(NOTA_ENCARGO_RECORDATORIO, {
            sessionId,
            availableAt: max(now, visitDateTime - 2h)
          })
```

#### Fetch del listado — request exacto

```typescript
async function fetchTaskList(session: InmovillaSession): Promise<RawTask[]> {
  const allTasks: RawTask[] = [];

  // Fetch las 4 columnas temporales (atrasadas, hoy, manyana, proximos)
  const vistas = [
    "tareasresultados_atrasadas",
    "tareasresultados_hoy",
    "tareasresultados_manyana",
    "tareasresultados_proximos",
  ] as const;

  for (const vista of vistas) {
    let posicion = 0;
    const paginacion = 30;

    while (true) {
      const paramjson = {
        general: {
          info: {
            lostags: "",
            numvistas: 1,
            ventana: "tareas-pendientes",
            data: vista,
          },
          // Sin filtro de agente: queremos TODAS las tareas de la agencia
        },
        [vista]: {
          info: {
            ficha: "tareas-pendientes",
            data: vista,
            posicion,
            paginacion: String(paginacion),
            jsonvista: "1",
            totalreg: "0",
          },
        },
      };

      const response = await postPaginacion(session, paramjson);

      // Parsear: response["tareas-pendientes"][vista].datos
      const vistaData = response["tareas-pendientes"]?.[vista];
      const datos = vistaData?.datos;
      if (!datos || (Array.isArray(datos) && datos.length === 0)) break;

      const rows = Array.isArray(datos) ? datos : Object.values(datos);
      for (const row of rows) {
        allTasks.push(parseTaskRow(row.fields));
      }

      if (rows.length < paginacion) break;
      posicion += paginacion;
    }
  }

  return allTasks;
}
```

Donde `postPaginacion` ejecuta:

```typescript
async function postPaginacion(
  session: InmovillaSession,
  paramjson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    paramjson: JSON.stringify(paramjson),
    soyajax: "1",
    miid: session.miid,
    l: session.l,
    id_pestanya: session.id_pestanya,
  });

  const res = await fetch(
    `https://crm.inmovilla.com/new/app/api/v1/paginacion/?cache=${session.cacheCounter++}.2`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: session.cookieHeader,
      },
      body: body.toString(),
    },
  );

  return res.json();
}
```

#### Parseo de una fila del listado

```typescript
interface RawTask {
  codigo: string;          // "4470" — codseg, ID único
  fecha: string;           // "2026-04-16"
  hora: string;            // "16:00"
  nombreSeguimiento: string; // "Visita → Reportaje Fotográfico"
  asunto: string;          // "Captación"
  nombreAgente: string;    // "Miguel Angel Carrillo Ramos"
  referenciaPropiedad: string; // "" (vacío en captación manual)
  codigoPropiedad: string; // "0"
  codigoDemanda: string;   // "0"
  duracion: string;        // "1" (30min)
  keypadre: string;        // "5143"
}

function parseTaskRow(fields: Array<{ campo: string; value: string }>): RawTask {
  const map: Record<string, string> = {};
  for (const f of fields) map[f.campo] = f.value;
  return {
    codigo: map.codigo ?? "",
    fecha: map.fecha ?? "",
    hora: map.hora ?? "",
    nombreSeguimiento: decodeHtmlEntities(map.nombreSeguimiento ?? ""),
    asunto: decodeHtmlEntities(map.asunto ?? ""),
    nombreAgente: map.nombreAgente ?? "",
    referenciaPropiedad: map.referenciaPropiedad ?? "",
    codigoPropiedad: map.codigoPropiedad ?? "0",
    codigoDemanda: map.codigoDemanda ?? "0",
    duracion: map.duracion ?? "1",
    keypadre: map.keypadre ?? "",
  };
}

// "Visita &rarr; Reportaje Fotográfico" → "Visita → Reportaje Fotográfico"
function decodeHtmlEntities(s: string): string {
  return s.replace(/&rarr;/g, "→").replace(/&/g, "&");
}
```

#### Filtro de tareas de captación (en el listado)

```typescript
const CAPTACION_NOMBRE = "Reportaje Fotográfico";

function isCaptacionTask(task: RawTask): boolean {
  return task.nombreSeguimiento.includes(CAPTACION_NOMBRE);
}
```

> **Nota:** `nombreSeguimiento` = `"Visita → Reportaje Fotográfico"`. El `keytiposeg=53` solo está disponible en el detalle v2. En el listado identificamos por nombre.

#### Fetch del detalle — request exacto

```typescript
interface TaskDetail {
  codseg: number;
  asunto: string;
  descrip: string;           // HTML: "URUS36VMA<br />~666 777 888"
  keyagente: number;
  keytiposeg: number;
  fechaaviso: string;        // "2026-04-16 16:00:00"
  fechaalta: string;         // "2026-04-15 15:41:49"
  tareacerrada: number;      // 0=abierta, 1=cerrada
  keyofe: number;            // Propiedad vinculada (0=ninguna)
  duracion: number;
  confirmado: number;
  altaagente: number;        // Agente creador
  keyagente_nombre: string;
  keyagente_apellidos: string;
}

async function fetchTaskDetail(
  session: InmovillaSession,
  codseg: string,
): Promise<TaskDetail> {
  const res = await fetch(
    `https://crm.inmovilla.com/new/app/api/v2/seguimientos/${codseg}`,
    {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Cookie: session.cookieHeader,
      },
    },
  );

  const json = await res.json();
  // json = { success: true, status_code: 200, data: { "seguimiento.codseg": 4470, ... } }
  if (!json.success) throw new Error(`Seguimiento ${codseg}: API returned success=false`);

  const d = json.data;
  return {
    codseg: d["seguimiento.codseg"],
    asunto: d["seguimiento.asunto"],
    descrip: d["seguimiento.descrip"],
    keyagente: d["seguimiento.keyagente"],
    keytiposeg: d["seguimiento.keytiposeg"],
    fechaaviso: d["seguimiento.fechaaviso"],
    fechaalta: d["seguimiento.fechaalta"],
    tareacerrada: d["seguimiento.tareacerrada"],
    keyofe: d["seguimiento.keyofe"],
    duracion: d["seguimiento.duracion"],
    confirmado: d["seguimiento.confirmado"],
    altaagente: d["seguimiento.altaagente"],
    keyagente_nombre: d["seguimiento.keyagente_nombre"],
    keyagente_apellidos: d["seguimiento.keyagente_apellidos"],
  };
}
```

#### Parsing de `descrip` (observaciones HTML)

El campo `descrip` viene del CKEditor con formato HTML. El comercial escribe:

```
URUS36VMA
666777888
```

Inmovilla lo almacena como:

```
URUS36VMA<br />~666 777 888
```

Parser robusto:

```typescript
function parseNotaEncargoDescrip(descrip: string): { ref: string; phone: string } | null {
  // 1. Limpiar HTML: reemplazar <br>, <br/>, <br /> por \n
  let text = descrip.replace(/<br\s*\/?>/gi, "\n");

  // 2. Quitar cualquier otro tag HTML
  text = text.replace(/<[^>]+>/g, "");

  // 3. Decodificar entidades HTML básicas
  text = text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");

  // 4. Separar por líneas, limpiar
  const lines = text
    .split(/[\n\r]+/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  // Línea 1: referencia de propiedad
  const refMatch = lines[0].match(/^(URUS\w+)$/i);
  if (!refMatch) return null;

  // Línea 2: teléfono (puede tener prefijo ~ y espacios)
  const phoneLine = lines[1].replace(/^~/, "").replace(/\s+/g, "");
  const phoneMatch = phoneLine.match(/^(\d{9,15})$/);
  if (!phoneMatch) return null;

  return {
    ref: refMatch[1].toUpperCase(),
    phone: phoneMatch[1],
  };
}
```

**Tests del parser:**

```typescript
// Formato exacto del HAR
parseNotaEncargoDescrip("URUS36VMA<br />~666 777 888")
// → { ref: "URUS36VMA", phone: "666777888" }

// Sin tilde ni espacios
parseNotaEncargoDescrip("URUS09VFEDE<br />600123456")
// → { ref: "URUS09VFEDE", phone: "600123456" }

// Con <br> simple
parseNotaEncargoDescrip("URUS36VMA<br>666777888")
// → { ref: "URUS36VMA", phone: "666777888" }

// Texto libre que no es captación
parseNotaEncargoDescrip("Llamar al cliente para confirmar")
// → null
```

#### Resolución de datos de la propiedad desde PropertySnapshot.raw

```typescript
function extractPropertyDataFromRaw(
  raw: Record<string, unknown>,
  propertyCurrent: { ciudad: string; zona: string },
): {
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
} {
  // Dirección: calle + número + zona + ciudad + CP
  // Ejemplo raw: { calle: "DE LOS FLAMENCOS", numero: "8", cp: "14111" }
  const calle = String(raw.calle ?? "").trim();
  const numero = String(raw.numero ?? "").trim();
  const cp = String(raw.cp ?? "").trim();

  const direccion = [
    calle && numero ? `Calle ${calle}, ${numero}` : calle ? `Calle ${calle}` : "",
    propertyCurrent.zona,
    propertyCurrent.ciudad,
    cp,
  ].filter(Boolean).join(", ");

  // Tipo de operación: si precioalq > 0 y precioinmo == 0 → ALQUILER
  const precioinmo = Number(raw.precioinmo) || 0;
  const precioalq = Number(raw.precioalq) || 0;
  const tipoOperacion: "VENTA" | "ALQUILER" =
    precioalq > 0 && precioinmo === 0 ? "ALQUILER" : "VENTA";
  const precio = tipoOperacion === "ALQUILER" ? precioalq : precioinmo;

  return { direccion, tipoOperacion, precio };
}
```

**Ejemplo real (URUS36VMA):**

```typescript
extractPropertyDataFromRaw(
  { calle: "DE LOS FLAMENCOS", numero: "8", cp: "14111", precioinmo: 275000, precioalq: 0 },
  { ciudad: "Córdoba", zona: "La Carlota" },
)
// → { direccion: "Calle DE LOS FLAMENCOS, 8, La Carlota, Córdoba, 14111",
//     tipoOperacion: "VENTA", precio: 275000 }
```

#### Rate limiting para detalles v2

El endpoint REST v2 (`GET /api/v2/seguimientos/{codseg}`) no tiene rate limits documentados en el HAR (es una GET autenticada por cookies, no por API token). Sin embargo, para ser conservador:

- Esperar **2 segundos** entre cada GET de detalle
- Máximo de tareas nuevas a procesar por ciclo: **10** (fail-safe)
- Si hay más de 10 nuevas, procesar en el siguiente ciclo

#### Detección de "tarea de captación" — criterios combinados

```typescript
function isNotaEncargoTask(listingTask: RawTask): boolean {
  // Criterio 1: nombreSeguimiento contiene "Reportaje Fotográfico"
  // (keytiposeg=53 en Inmovilla, pero solo disponible en detalle v2)
  return listingTask.nombreSeguimiento.includes("Reportaje Fotográfico");
}

function isValidCaptacionDetail(detail: TaskDetail): boolean {
  // Criterio 2: asunto es "Captación" (o vacío, aceptar también)
  const asuntoOk = detail.asunto.toLowerCase().includes("captación")
    || detail.asunto.toLowerCase().includes("captacion")
    || detail.asunto.trim() === "";

  // Criterio 3: descrip parsea correctamente (ref URUS + teléfono)
  const parsed = parseNotaEncargoDescrip(detail.descrip);

  // Criterio 4: tarea no está cerrada
  const abierta = detail.tareacerrada === 0;

  return asuntoOk && parsed !== null && abierta;
}
```

---

### Bloque 3: Event Handlers + Job Handlers

**Archivos a crear:**


| Archivo                                         | Rol                                      |
| ----------------------------------------------- | ---------------------------------------- |
| `lib/workers/consumer/nota-encargo-handlers.ts` | Handlers para los 3 jobs + event handler |


**Registros (en handlers.ts y job-handlers.ts):**

```typescript
// job-handlers.ts — añadir:
registerJobHandler("NOTA_ENCARGO_RECORDATORIO", handleNotaEncargoRecordatorio);
registerJobHandler("NOTA_ENCARGO_CHECK_CONFIRMACION", handleNotaEncargoCheckConfirmacion);
registerJobHandler("NOTA_ENCARGO_ENVIAR_FORMULARIO", handleNotaEncargoEnviarFormulario);

// handlers.ts — añadir:
registerHandler("NOTA_ENCARGO_DETECTADA", {
  handler: auditOnlyHandler("NOTA_ENCARGO_DETECTADA"),
  // Side effects se ejecutan en el worker de ingestión (crea session + encola jobs)
});
registerHandler("NOTA_ENCARGO_FORMULARIO_COMPLETADO", {
  handler: handleNotaEncargoFormularioCompletado,
});
```

#### Job: NOTA_ENCARGO_RECORDATORIO

```typescript
async function handleNotaEncargoRecordatorio(job: Job): Promise<HandlerResult> {
  const { sessionId } = job.payload;
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({ where: { id: sessionId } });
  
  if (session.state !== "PENDING") return { success: true }; // idempotente
  
  // Envía plantilla WhatsApp con botones interactivos
  await sendNotaEncargoRecordatorio(session.propietarioPhone, {
    propertyRef: session.propertyRef,
    visitTime: session.visitDateTime,
  });
  
  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "RECORDATORIO_ENVIADO" },
  });
  
  // Programa check de confirmación para 30min antes de la visita
  const checkAt = new Date(session.visitDateTime.getTime() - 30 * 60 * 1000);
  await enqueueJob({
    type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
    payload: { sessionId },
    availableAt: new Date(Math.max(checkAt.getTime(), Date.now() + 60_000)),
    idempotencyKey: `nota_encargo_check:${sessionId}`,
  });
  
  return { success: true };
}
```

#### Job: NOTA_ENCARGO_CHECK_CONFIRMACION

```typescript
async function handleNotaEncargoCheckConfirmacion(job: Job): Promise<HandlerResult> {
  const { sessionId } = job.payload;
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({ where: { id: sessionId } });
  
  if (session.state === "CONFIRMADA" || session.state === "FORMULARIO_ENVIADO") {
    return { success: true }; // ya confirmó
  }
  
  if (session.state !== "RECORDATORIO_ENVIADO") return { success: true };
  
  // No confirmó → avisar al comercial
  const comercial = await resolveComercialPhone(session.comercialId);
  if (comercial?.phone) {
    await sendNotaEncargoNoConfirmada(comercial.phone, {
      propertyRef: session.propertyRef,
      visitTime: session.visitDateTime,
    });
  }
  
  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "NO_CONFIRMADA" },
  });
  
  await appendEvent({
    type: "NOTA_ENCARGO_NO_CONFIRMADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: { sessionId },
  });
  
  return { success: true };
}
```

#### Job: NOTA_ENCARGO_ENVIAR_FORMULARIO

```typescript
async function handleNotaEncargoEnviarFormulario(job: Job): Promise<HandlerResult> {
  const { sessionId } = job.payload;
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({ where: { id: sessionId } });
  
  if (session.state !== "CONFIRMADA") return { success: true };
  
  // Envía WhatsApp Flow con datos prellenados
  await sendNotaEncargoFlow(session.propietarioPhone, {
    sessionId: session.id,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion,
    precio: session.precio,
    propertyRef: session.propertyRef,
    referenciaCatastral: session.referenciaCatastral,
  });
  
  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });
  
  return { success: true };
}
```

#### Detección de confirmación (en el webhook de WhatsApp)

En el handler de webhook existente (`lib/whatsapp/webhook.ts` → router), añadir detección de button replies del recordatorio:

```typescript
// Dentro del procesamiento de mensajes interactivos tipo button_reply:
if (interactive.type === "button_reply") {
  const buttonId = interactive.button_reply.id;
  
  if (buttonId === "nota_encargo_confirmo" || buttonId === "nota_encargo_no_puedo") {
    const session = await prisma.notaEncargoSession.findFirst({
      where: { propietarioPhone: from, state: "RECORDATORIO_ENVIADO" },
      orderBy: { visitDateTime: "asc" },
    });
    
    if (session && buttonId === "nota_encargo_confirmo") {
      await prisma.notaEncargoSession.update({
        where: { id: session.id },
        data: { state: "CONFIRMADA" },
      });
      
      await enqueueJob({
        type: "NOTA_ENCARGO_ENVIAR_FORMULARIO",
        payload: { sessionId: session.id },
        availableAt: session.visitDateTime,
        idempotencyKey: `nota_encargo_formulario:${session.id}`,
      });
      
      await appendEvent({
        type: "NOTA_ENCARGO_CONFIRMADA",
        aggregateType: "PROPERTY",
        aggregateId: session.propertyCode,
        payload: { sessionId: session.id },
      });
    }
    // Si "No puedo" → no hacer nada; el check job lo detectará
  }
}
```

---

### Bloque 4: WhatsApp Flow — Formulario del Propietario

**Primera implementación de WhatsApp Flows con endpoint en el sistema.**

#### 4.1 Decisión: Sin Data Endpoint (modo `navigate` + `complete`)

Para esta primera implementación se usa el modo **sin endpoint** (`flow_action: navigate`). Las razones:

- No requiere encriptación RSA/AES (complejidad significativa)
- Los datos prellenados se pasan en `flow_action_data` al enviar
- La respuesta se recibe como `nfm_reply` en el webhook de mensajes existente
- La lógica es 100% cliente (Flow JSON) + webhook final
- Suficiente para formularios estáticos con datos prellenados

#### 4.2 Flow JSON

> El archivo canónico vive en `flows-whatsapp/nota-encargo.flow.json`.

El Flow tiene **2 pantallas** (v2 — fusión DATOS_ENCARGO + LOPD):

```
DATOS_PERSONALES → DATOS_ENCARGO (terminal)
```

- **DATOS_PERSONALES**: nombre, DNI, teléfono, domicilio fiscal → navega a DATOS_ENCARGO
- **DATOS_ENCARGO** (terminal): duración, tipo nota, texto LOPD, OptIn acepta_lopd → `complete`

```json
{
  "version": "7.3",
  "screens": [
    {
      "id": "DATOS_PERSONALES",
      "title": "Datos del Propietario",
      "data": {
        "flow_token": { "type": "string", "__example__": "session_abc123" },
        "direccion_inmueble": { "type": "string", "__example__": "Calle de los Flamencos, 8, La Carlota, Córdoba" },
        "referencia_catastral": { "type": "string", "__example__": "9872023VH5797S0006XS" },
        "tipo_operacion": { "type": "string", "__example__": "VENTA" },
        "precio_inmueble": { "type": "string", "__example__": "275.000 €" }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextSubheading", "text": "Complete sus datos personales" },
          { "type": "TextInput", "name": "nombre_completo", "label": "Nombre y apellidos", "input-type": "text", "required": true, "helper-text": "Como aparece en su DNI" },
          { "type": "TextInput", "name": "dni", "label": "DNI / NIF / NIE", "input-type": "text", "required": true, "helper-text": "Ej: 12345678A" },
          { "type": "TextInput", "name": "telefono", "label": "Teléfono de contacto", "input-type": "phone", "required": true, "helper-text": "Teléfono móvil" },
          { "type": "TextArea", "name": "domicilio_fiscal", "label": "Domicilio fiscal", "required": true, "helper-text": "Dirección completa" },
          {
            "type": "Footer",
            "label": "Siguiente",
            "on-click-action": {
              "name": "navigate",
              "next": { "type": "screen", "name": "DATOS_ENCARGO" },
              "payload": {
                "flow_token": "${data.flow_token}",
                "nombre_completo": "${form.nombre_completo}",
                "dni": "${form.dni}",
                "telefono": "${form.telefono}",
                "domicilio_fiscal": "${form.domicilio_fiscal}",
                "direccion_inmueble": "${data.direccion_inmueble}",
                "referencia_catastral": "${data.referencia_catastral}",
                "tipo_operacion": "${data.tipo_operacion}",
                "precio_inmueble": "${data.precio_inmueble}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "DATOS_ENCARGO",
      "title": "Datos del Encargo",
      "terminal": true,
      "success": true,
      "data": {
        "flow_token": { "type": "string", "__example__": "session_abc123" },
        "nombre_completo": { "type": "string", "__example__": "Juan García López" },
        "dni": { "type": "string", "__example__": "12345678A" },
        "telefono": { "type": "string", "__example__": "666777888" },
        "domicilio_fiscal": { "type": "string", "__example__": "Calle Mayor 1, Córdoba" },
        "direccion_inmueble": { "type": "string", "__example__": "Calle de los Flamencos, 8" },
        "referencia_catastral": { "type": "string", "__example__": "9872023VH5797S0006XS" },
        "tipo_operacion": { "type": "string", "__example__": "VENTA" },
        "precio_inmueble": { "type": "string", "__example__": "275.000 €" }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          { "type": "TextSubheading", "text": "Datos del inmueble" },
          { "type": "TextBody", "text": "${data.direccion_inmueble}" },
          { "type": "TextCaption", "text": "Referencia catastral: ${data.referencia_catastral}" },
          { "type": "TextBody", "text": "${data.tipo_operacion}" },
          { "type": "TextCaption", "text": "${data.precio_inmueble}" },
          { "type": "TextInput", "name": "duracion_meses", "label": "Duración (meses)", "input-type": "number", "required": true, "helper-text": "Número de meses" },
          {
            "type": "RadioButtonsGroup",
            "name": "tipo_nota",
            "label": "Tipo de Nota de Encargo",
            "required": true,
            "data-source": [
              { "id": "N1", "title": "N1 — Abierta", "description": "Podrá vender por sí mismo o con otros agentes" },
              { "id": "N2", "title": "N2 — Agente Único", "description": "Encargo en régimen de agente único a URUS CAPITAL GROUP" },
              { "id": "N3", "title": "N3 — Representación", "description": "Representación exclusiva por URUS CAPITAL GROUP" }
            ]
          },
          { "type": "TextCaption", "text": "La parte contratante se compromete y da su consentimiento expreso para el tratamiento de cuantos datos personales haya facilitado a URUS CAPITAL GROUP S.L. con CIF: B54560976. Los datos se conservarán mientras se mantenga la relación comercial y durante los años necesarios para cumplir con las obligaciones legales vigentes." },
          { "type": "OptIn", "name": "acepta_lopd", "label": "Acepto la cláusula de protección de datos", "required": true },
          {
            "type": "Footer",
            "label": "Enviar formulario",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "flow_token": "${data.flow_token}",
                "nombre_completo": "${data.nombre_completo}",
                "dni": "${data.dni}",
                "telefono": "${data.telefono}",
                "domicilio_fiscal": "${data.domicilio_fiscal}",
                "referencia_catastral": "${data.referencia_catastral}",
                "duracion_meses": "${form.duracion_meses}",
                "tipo_nota": "${form.tipo_nota}",
                "acepta_lopd": "${form.acepta_lopd}"
              }
            }
          }
        ]
      }
    }
  ]
}
```

> **Versión:** 7.3. Flujo de 2 pantallas (antes 3). La pantalla LOPD se eliminó como pantalla independiente; el OptIn y el texto LOPD se incorporaron a DATOS_ENCARGO, que pasa a ser `terminal: true`.

#### 4.3 Envío del Flow

**Opción A — Template con botón FLOW (business-initiated, recomendado):**

Crear plantilla en Meta Business Manager:

- Nombre: `nota_encargo_formulario`
- Categoría: UTILITY
- Body: "Hola {{1}}, es hora de completar los datos para la nota de encargo de la propiedad {{2}}. Pulse el botón para rellenar el formulario."
- Button: tipo FLOW, text "Completar formulario", flow_id: `{FLOW_ID}`

```typescript
// lib/whatsapp/send.ts — nueva función
export async function sendNotaEncargoFlow(
  to: string,
  params: {
    sessionId: string;
    direccion: string;
    tipoOperacion: string;
    precio: number;
    propertyRef: string;
    /** Desde PropertySnapshot / ficha Inmovilla; cadena vacía si no consta */
    referenciaCatastral?: string;
    propietarioNombre?: string;
  },
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const precioFmt = new Intl.NumberFormat("es-ES").format(params.precio) + " €";
  
  const template: TemplateObject = {
    name: process.env.WHATSAPP_TEMPLATE_NOTA_ENCARGO_FORMULARIO || "nota_encargo_formulario",
    language: { code: WHATSAPP_TEMPLATE_LANGUAGE_CODE },
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.propietarioNombre || "propietario" },
          { type: "text", text: params.propertyRef },
        ],
      },
      {
        type: "button",
        sub_type: "flow",
        index: "0",
        parameters: [
          {
            type: "action",
            action: {
              flow_token: params.sessionId,
              flow_action_data: {
                property_ref: params.propertyRef,
                direccion_inmueble: params.direccion,
                referencia_catastral: params.referenciaCatastral ?? "",
                tipo_operacion: params.tipoOperacion,
                precio_inmueble: precioFmt,
                flow_token: params.sessionId,
              },
            },
          },
        ],
      },
    ],
  };
  
  return sendTemplateMessage(to, template, options);
}
```

**Opción B — Interactive message (dentro de ventana 24h, si el propietario ya confirmó):**

```typescript
export async function sendNotaEncargoFlowInteractive(
  to: string,
  params: { /* mismos params */ },
  options?: SendOptions,
): Promise<SendMessageSuccess> {
  const precioFmt = new Intl.NumberFormat("es-ES").format(params.precio) + " €";
  
  const interactive: InteractiveObject = {
    type: "flow",
    header: { type: "text", text: "Nota de Encargo" },
    body: { text: `Complete los datos para la nota de encargo de ${params.propertyRef}.` },
    footer: { text: "URUS Capital Group" },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_id: process.env.WHATSAPP_FLOW_NOTA_ENCARGO_ID!,
        flow_cta: "Completar formulario",
        flow_token: params.sessionId,
        flow_action: "navigate",
        flow_action_payload: {
          screen: "DATOS_PERSONALES",
          data: JSON.stringify({
            property_ref: params.propertyRef,
            direccion_inmueble: params.direccion,
            referencia_catastral: params.referenciaCatastral ?? "",
            tipo_operacion: params.tipoOperacion,
            precio_inmueble: precioFmt,
            flow_token: params.sessionId,
          }),
        },
      },
    },
  };
  
  return sendInteractiveMessage(to, interactive, options);
}
```

La opción B es viable porque el propietario acaba de confirmar (ventana de 24h abierta). **Decidir en implementación** según si la template ya está aprobada.

#### 4.4 Recepción de la respuesta del Flow

Cuando el propietario completa el formulario, llega un webhook de tipo `interactive` con `nfm_reply`:

```json
{
  "messages": [{
    "from": "34666777888",
    "type": "interactive",
    "interactive": {
      "type": "nfm_reply",
      "nfm_reply": {
        "name": "flow",
        "body": "Sent",
        "response_json": "{\"flow_token\":\"<sessionId>\",\"nombre_completo\":\"...\",\"dni\":\"...\",\"telefono\":\"...\",\"domicilio_fiscal\":\"...\",\"referencia_catastral\":\"9872023VH5797S0006XS\",\"duracion_meses\":\"6\",\"tipo_nota\":\"N2\",\"acepta_lopd\":true}"
      }
    }
  }]
}
```

**Handler en el webhook (añadir en el router de WhatsApp):**

```typescript
if (interactive?.type === "nfm_reply" && interactive.nfm_reply?.name === "flow") {
  const responseData = JSON.parse(interactive.nfm_reply.response_json);
  const flowToken = responseData.flow_token;
  
  // Buscar sesión por flowToken (que es el sessionId)
  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: flowToken },
  });
  
  if (session && session.state === "FORMULARIO_ENVIADO") {
    await handleNotaEncargoFlowResponse(session, responseData);
  }
}
```

---

### Bloque 5: Generación del PDF de Nota de Encargo

**Archivo:** `lib/nota-encargo/generate-nota-encargo-pdf.ts`

Usa `pdf-lib` (misma dependencia que `lib/firma/pdf-stamp.ts`).

```typescript
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface NotaEncargoData {
  // Propietario
  nombre: string;
  dni: string;
  telefono: string;
  domicilioFiscal: string;
  // Inmueble
  direccion: string;
  referenciaCatastral: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
  duracionMeses: number;
  // Encargo
  tipoNota: "N1" | "N2" | "N3";
  aceptaLopd: boolean;
  // Meta
  fecha: Date;
  hora: string;
  agente: string;
}

export async function generateNotaEncargoPdf(data: NotaEncargoData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  
  const margin = 50;
  let y = height - margin;
  
  // ------------------------------------------------------------------
  // HEADER: "Nota de Encargo Inmobiliaria" + datos de fecha/hora/agente
  // ------------------------------------------------------------------
  const headerSize = 14;
  const bodySize = 10;
  const smallSize = 8;
  const lineHeight = bodySize * 1.6;
  const dark = rgb(0.1, 0.1, 0.1);
  const gold = rgb(0.72, 0.58, 0.2);
  const gray = rgb(0.4, 0.4, 0.4);
  
  page.drawText("NOTA DE ENCARGO INMOBILIARIA", {
    x: margin, y, size: headerSize, font: helveticaBold, color: dark,
  });
  y -= headerSize + 6;
  page.drawText("URUS CAPITAL GROUP S.L.", {
    x: margin, y, size: bodySize, font: helveticaBold, color: gold,
  });
  y -= lineHeight;
  
  const dateStr = data.fecha.toLocaleDateString("es-ES");
  page.drawText(`Fecha: ${dateStr}   Hora: ${data.hora}   Agente: ${data.agente}`, {
    x: margin, y, size: smallSize, font: helvetica, color: gray,
  });
  y -= lineHeight + 10;
  
  // ------------------------------------------------------------------
  // SECCIÓN: DATOS DEL PROPIETARIO
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, "DATOS DEL PROPIETARIO", margin, y, width, helveticaBold, gold);
  y = drawField(page, "Nombre", data.nombre, margin, y, helvetica, helveticaBold, bodySize, dark);
  y = drawField(page, "DNI", data.dni, margin, y, helvetica, helveticaBold, bodySize, dark);
  y = drawField(page, "Teléfono", data.telefono, margin, y, helvetica, helveticaBold, bodySize, dark);
  y = drawField(page, "Domicilio fiscal", data.domicilioFiscal, margin, y, helvetica, helveticaBold, bodySize, dark);
  y -= 10;
  
  // ------------------------------------------------------------------
  // SECCIÓN: DATOS DEL INMUEBLE
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, "DATOS DEL INMUEBLE A LA VENTA", margin, y, width, helveticaBold, gold);
  y = drawField(page, "Dirección", data.direccion, margin, y, helvetica, helveticaBold, bodySize, dark);
  if (data.referenciaCatastral.trim()) {
    y = drawField(page, "Referencia catastral", data.referenciaCatastral, margin, y, helvetica, helveticaBold, bodySize, dark);
  }
  y = drawField(page, "Operación", data.tipoOperacion, margin, y, helvetica, helveticaBold, bodySize, dark);
  y = drawField(page, "Precio", `${new Intl.NumberFormat("es-ES").format(data.precio)} €`, margin, y, helvetica, helveticaBold, bodySize, dark);
  y = drawField(page, "Duración", `${data.duracionMeses} meses`, margin, y, helvetica, helveticaBold, bodySize, dark);
  y -= 10;
  
  // ------------------------------------------------------------------
  // TIPO DE NOTA DE ENCARGO
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, "TIPO DE NOTA DE ENCARGO", margin, y, width, helveticaBold, gold);
  const tipos = [
    { key: "N1", label: "N1 — ABIERTA", desc: "El propietario podrá vender por sí mismo y de forma directa, o con la intervención de otro agente inmobiliario." },
    { key: "N2", label: "N2 — AGENTE ÚNICO", desc: "El vendedor encarga en régimen de agente único a URUS CAPITAL GROUP S.L. la venta del inmueble." },
    { key: "N3", label: "N3 — REPRESENTACIÓN", desc: "El propietario no podrá vender por sí mismo ni mediante otro agente inmobiliario el inmueble." },
  ];
  for (const tipo of tipos) {
    const checked = data.tipoNota === tipo.key ? "[X]" : "[ ]";
    page.drawText(`${checked} ${tipo.label}`, {
      x: margin, y, size: bodySize, font: helveticaBold, color: dark,
    });
    y -= lineHeight;
    // Texto descriptivo (wrapped)
    const wrapped = wrapText(tipo.desc, 85);
    for (const line of wrapped) {
      page.drawText(line, { x: margin + 20, y, size: smallSize, font: helvetica, color: gray });
      y -= smallSize * 1.5;
    }
    y -= 4;
  }
  y -= 6;
  
  // ------------------------------------------------------------------
  // HONORARIOS, GASTOS, JURISDICCIÓN (texto fijo)
  // ------------------------------------------------------------------
  const clausulas = [
    "HONORARIOS: 2,5% sobre el precio de venta + IVA (mínimo 3.500€ + IVA), devengados en la firma de arras, en concepto de asesoramiento, mediación y gestión inmobiliaria.",
    "GASTOS Y TRIBUTOS: El inmueble se transmitirá libre de cargas, al corriente de comunidad y sin arrendatarios u ocupantes.",
    "JURISDICCIÓN: Las partes se someten expresamente al fuero de los Juzgados y Tribunales de Córdoba, con renuncia expresa a cualquier otro.",
  ];
  for (const clausula of clausulas) {
    page.drawText("•", { x: margin, y, size: bodySize, font: helvetica, color: dark });
    const wrapped = wrapText(clausula, 85);
    for (const line of wrapped) {
      page.drawText(line, { x: margin + 12, y, size: smallSize, font: helvetica, color: dark });
      y -= smallSize * 1.5;
    }
    y -= 4;
  }
  y -= 10;
  
  // ------------------------------------------------------------------
  // CLÁUSULA LOPD
  // ------------------------------------------------------------------
  page.drawText("Cláusula de protección de datos:", {
    x: margin, y, size: bodySize, font: helveticaBold, color: dark,
  });
  y -= lineHeight;
  const lopdText = "La parte contratante se compromete y da su consentimiento expreso para el tratamiento de cuantos datos personales haya facilitado a URUS CAPITAL GROUP S.L. con número de CIF: B54560976. Representada por Miguel Angel Carrillo Ramos con DNI: 46266189Y y domicilio en: Plaza de la Albolafia 4 2º3, que según el RGPD 2016/679 de protección de datos de carácter personal como responsable de su tratamiento.";
  const lopdWrapped = wrapText(lopdText, 90);
  for (const line of lopdWrapped) {
    page.drawText(line, { x: margin, y, size: smallSize, font: helvetica, color: dark });
    y -= smallSize * 1.5;
  }
  y -= 10;
  
  const lopdCheck = data.aceptaLopd ? "SÍ (X)  NO ( )" : "SÍ ( )  NO (X)";
  page.drawText(lopdCheck, {
    x: width - margin - 120, y, size: bodySize, font: helveticaBold, color: dark,
  });
  y -= lineHeight + 20;
  
  // ------------------------------------------------------------------
  // ESPACIO PARA FIRMA (se añadirá en el flujo de firma digital)
  // ------------------------------------------------------------------
  page.drawText("Firma del propietario:", {
    x: margin, y, size: bodySize, font: helveticaBold, color: dark,
  });
  y -= 60;
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 200, y },
    thickness: 0.5, color: gray,
  });
  
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
```

Funciones auxiliares (`drawSectionHeader`, `drawField`, `wrapText`) siguen el mismo patrón que `pdf-stamp.ts`.

**Entregables del PDF:**

1. **PDF de Nota de Encargo** (generado por esta función) → se sube a Cloudinary
2. **PDF sellado con firma** (generado por `stampSignaturePage` existente) → sube a Cloudinary
3. **PDF audit trail** (generado por `generateAuditTrailPdf` existente) → sube a Cloudinary

Los 3 se vinculan a `SignatureRequest` y `LegalDocument` con `documentKind: "NOTA_ENCARGO"`.

---

### Bloque 6: Integración con Firma Digital

**Archivo:** `lib/nota-encargo/send-to-signature.ts`

Reutiliza el sistema existente al 100%. Flujo cuando se recibe la respuesta del Flow:

```typescript
export async function handleNotaEncargoFlowResponse(
  session: NotaEncargoSession,
  formData: Record<string, unknown>,
): Promise<void> {
  // 1. Actualizar sesión con datos del formulario
  await prisma.notaEncargoSession.update({
    where: { id: session.id },
    data: {
      state: "FORMULARIO_COMPLETADO",
      propietarioNombre: formData.nombre_completo as string,
      propietarioDni: formData.dni as string,
      propietarioTelefono: formData.telefono as string,
      domicilioFiscal: formData.domicilio_fiscal as string,
      duracionMeses: parseInt(formData.duracion_meses as string, 10),
      tipoNotaEncargo: formData.tipo_nota as string,
      aceptaLopd: formData.acepta_lopd === true || formData.acepta_lopd === "true",
    },
  });
  
  // 2. Generar PDF
  const pdfBuffer = await generateNotaEncargoPdf({
    nombre: formData.nombre_completo as string,
    dni: formData.dni as string,
    telefono: formData.telefono as string,
    domicilioFiscal: formData.domicilio_fiscal as string,
    direccion: session.direccion,
    referenciaCatastral: String(formData.referencia_catastral ?? session.referenciaCatastral ?? ""),
    tipoOperacion: session.tipoOperacion as "VENTA" | "ALQUILER",
    precio: session.precio,
    duracionMeses: parseInt(formData.duracion_meses as string, 10),
    tipoNota: formData.tipo_nota as "N1" | "N2" | "N3",
    aceptaLopd: true,
    fecha: new Date(),
    hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    agente: session.comercialId, // resolver nombre real
  });
  
  // 3. Subir a Cloudinary
  const uploadResult = await uploadContractDocument({
    buffer: pdfBuffer,
    fileName: `nota_encargo_${session.propertyRef}.pdf`,
    folder: `nota-encargo/${session.propertyCode}`,
    tags: ["nota_encargo", session.propertyRef],
    context: { propertyCode: session.propertyCode, sessionId: session.id },
  });
  
  // 4. Calcular hash + generar token
  const documentHash = computeSha256(pdfBuffer);
  const signingToken = generateSigningToken();
  const signingUrl = buildSigningUrl(signingToken);
  const slaDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  
  // 5. Crear SignatureRequest
  const signatureRequest = await prisma.signatureRequest.create({
    data: {
      operationId: session.propertyCode,
      propertyCode: session.propertyCode,
      documentKind: "NOTA_ENCARGO",
      cloudinaryUrl: uploadResult.secureUrl,
      signingUrl,
      status: "SENT",
      signerName: formData.nombre_completo as string,
      signerEmail: "", // propietario puede no tener email
      signerPhone: session.propietarioPhone,
      sentAt: new Date(),
      slaDeadlineDays: 5,
      slaDeadline,
      documentHash,
      signingToken,
    },
  });
  
  // 6. Crear LegalDocument
  const legalDocument = await prisma.legalDocument.create({
    data: {
      operationId: session.propertyCode,
      propertyCode: session.propertyCode,
      documentKind: "NOTA_ENCARGO",
      status: "SENT_TO_SIGNATURE",
      cloudinaryUrl: uploadResult.secureUrl,
      signatureRequestId: signatureRequest.id,
    },
  });
  
  // 7. Crear party
  await prisma.legalDocumentParty.create({
    data: {
      legalDocumentId: legalDocument.id,
      role: "PROPIETARIO",
      fullName: formData.nombre_completo as string,
      nifNie: formData.dni as string,
      phone: session.propietarioPhone,
      address: formData.domicilio_fiscal as string,
    },
  });
  
  // 8. Actualizar sesión
  await prisma.notaEncargoSession.update({
    where: { id: session.id },
    data: {
      state: "FIRMA_ENVIADA",
      documentUrl: uploadResult.secureUrl,
      legalDocumentId: legalDocument.id,
      signatureRequestId: signatureRequest.id,
    },
  });
  
  // 9. Emitir evento → el handler existente FIRMA_ENVIADA envía el link por WhatsApp
  await appendEvent({
    type: "FIRMA_ENVIADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: {
      signatureRequestId: signatureRequest.id,
      propertyCode: session.propertyCode,
      documentKind: "NOTA_ENCARGO",
      signingUrl,
      signerPhone: session.propietarioPhone,
    },
  });
}
```

**Página de firma (`/firma/{token}`):**

Solo se necesita añadir una entrada a `KIND_LABEL` en `app/firma/[token]/page.tsx`:

```typescript
const KIND_LABEL: Record<string, string> = {
  // ... existentes ...
  NOTA_ENCARGO: "Nota de Encargo Inmobiliaria",
};
```

El flujo de firma (ver PDF → dibujar firma → OTP SMS → sello → audit trail) funciona tal cual.

**Paso 9 — Documento firmado al propietario:**

Cuando el evento `FIRMA_COMPLETADA` se procesa, el handler `handleFirmaCompletada` detecta que `documentKind === "NOTA_ENCARGO"` y:

1. Busca la `NotaEncargoSession` por `signatureRequestId`
2. Envía el PDF firmado (`signedDocumentUrl`) al propietario como mensaje de documento WhatsApp (sin plantilla — dentro de ventana 24h activa)
3. Actualiza `session.state → DOCUMENTO_ENVIADO` y persiste `signedDocumentUrl` en la sesión

```typescript
// lib/workers/consumer/firma-completada-handler.ts
if (sigReq.documentKind === "NOTA_ENCARGO") {
  const notaSession = await prisma.notaEncargoSession.findFirst({
    where: { signatureRequestId },
  });
  if (notaSession && signedDocumentUrl) {
    await sendNotaEncargoDocumentoFirmado(notaSession.propietarioPhone, {
      propertyRef: notaSession.propertyRef,
      signedDocumentUrl,
    });
    await prisma.notaEncargoSession.update({
      where: { id: notaSession.id },
      data: { state: "DOCUMENTO_ENVIADO", signedDocumentUrl },
    });
  }
}
```

**PDFs generados y dónde se almacenan:**


| PDF                                 | Generador                             | Cloudinary folder                 | Vinculado a                                                             |
| ----------------------------------- | ------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Nota de Encargo (original)          | `generateNotaEncargoPdf()`            | `nota-encargo/{propertyCode}/`    | `LegalDocument.cloudinaryUrl`, `SignatureRequest.cloudinaryUrl`         |
| Nota de Encargo (sellado con firma) | `stampSignaturePage()` (existente)    | `contracts/{operationId}/signed/` | `SignatureRequest.signedDocumentUrl`, `LegalDocument.signedDocumentUrl` |
| Audit Trail                         | `generateAuditTrailPdf()` (existente) | `contracts/{operationId}/audit/`  | `SignatureRequest.auditTrailUrl`, `LegalDocument.auditTrailUrl`         |


---

### Bloque 7: Plantillas WhatsApp (Meta Business Manager)

Plantillas a crear y aprobar:

#### 7.1 `nota_encargo_recordatorio`

- **Categoría:** UTILITY
- **Body:** "Hola, soy de URUS Capital Group. Le recordamos que tiene una visita programada para hoy a las {{1}} en la propiedad {{2}}. ¿Confirma su asistencia?"
- **Variables:** `{{1}}` = hora de la visita. `{{2}}` = **dirección del inmueble** (`NotaEncargoSession.direccion`); si está vacía, se usa la referencia interna Inmovilla (`propertyRef`) o, antes del matching, la referencia catastral (`refCatastral`) como respaldo.
- **Botones:** Quick Reply
  - Botón 1: "Confirmo" (id: `nota_encargo_confirmo`)
  - Botón 2: "No puedo" (id: `nota_encargo_no_puedo`)

#### 7.2 `nota_encargo_no_confirmada`

- **Categoría:** UTILITY
- **Body:** "Aviso: El propietario no ha confirmado la visita de captación programada para las {{1}} en la propiedad {{2}}. Contacte directamente para confirmar."
- **Variables:** `{{1}}` = hora. `{{2}}` = dirección del inmueble (misma lógica que el recordatorio al propietario).

#### 7.3 `nota_encargo_formulario`

- **Categoría:** UTILITY
- **Body:** "Hola {{1}}, es momento de completar los datos para la nota de encargo de la propiedad {{2}}. Pulse el botón para rellenar el formulario."
- **Botón:** Tipo FLOW
  - Text: "Completar formulario"
  - flow_id: `{WHATSAPP_FLOW_NOTA_ENCARGO_ID}`
  - flow_action: `navigate`

---

### Bloque 8: Creación del WhatsApp Flow en Meta

**Pasos para crear el Flow:**

1. Ir a Meta Business Manager → WhatsApp Manager → Account tools → Flows
2. Crear nuevo Flow:
  - Nombre: `nota_encargo`
  - Categoría: `OTHER`
3. Copiar el Flow JSON del Bloque 4.2 en el editor
4. Validar en el Builder (preview)
5. Publicar el Flow
6. Copiar el `flow_id` → configurar en `.env` como `WHATSAPP_FLOW_NOTA_ENCARGO_ID`

**Variables de entorno nuevas:**

```env
# Nota de Encargo
WHATSAPP_FLOW_NOTA_ENCARGO_ID=          # ID del Flow en Meta
WHATSAPP_TEMPLATE_NOTA_ENCARGO_RECORDATORIO=nota_encargo_recordatorio
WHATSAPP_TEMPLATE_NOTA_ENCARGO_NO_CONFIRMADA=nota_encargo_no_confirmada
WHATSAPP_TEMPLATE_NOTA_ENCARGO_FORMULARIO=nota_encargo_formulario
TASK_TYPES_CAPTACION=Visita → Reportaje Fotográfico
```

---

## 4. Referencia de endpoints de Tareas (del HAR)

> Análisis completo: `docs/tareas.md`. HAR original: `docs/crm.inmovilla.com.har`.

### 4.1 Listado de tareas

```
POST https://crm.inmovilla.com/new/app/api/v1/paginacion/?cache={id}.2
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

**Body:** `paramjson` (URL-encoded JSON) + `soyajax=1` + `miid` + `l` + `id_pestanya`

**paramjson para listar tareas de mañana:**

```json
{
  "general": {
    "info": {
      "lostags": "",
      "numvistas": 1,
      "ventana": "tareas-pendientes",
      "data": "tareasresultados_manyana"
    }
  },
  "tareasresultados_manyana": {
    "info": {
      "ficha": "tareas-pendientes",
      "data": "tareasresultados_manyana",
      "posicion": 0,
      "paginacion": "30",
      "jsonvista": "1",
      "totalreg": "0"
    }
  }
}
```

**Filtrar por agente:** Añadir `"filtro": "seguimiento.keyagente;in;177892;"` dentro de `general`.

**Vistas disponibles:**


| data                         | Contenido           | Page size |
| ---------------------------- | ------------------- | --------- |
| `tareasresultados_atrasadas` | Tareas vencidas     | 30        |
| `tareasresultados_hoy`       | Hoy                 | 30        |
| `tareasresultados_manyana`   | Mañana              | 30        |
| `tareasresultados_proximos`  | Futuras (>mañana)   | 30        |
| `tareasresultadosselect`     | Contadores por tipo | 100       |


### 4.2 Detalle de una tarea

```
GET https://crm.inmovilla.com/new/app/api/v2/seguimientos/{codseg}
X-Requested-With: XMLHttpRequest
Cookie: PHPSESSID=...; inmovilla=...; jwt=...
```

**Respuesta:**

```json
{
  "success": true,
  "status_code": 200,
  "data": {
    "seguimiento.codseg": 4470,
    "seguimiento.asunto": "Captación",
    "seguimiento.descrip": "URUS36VMA<br />~666 777 888",
    "seguimiento.keyagente": 177892,
    "seguimiento.keytiposeg": 53,
    "seguimiento.fechaaviso": "2026-04-16 16:00:00",
    "seguimiento.fechaalta": "2026-04-15 15:41:49",
    "seguimiento.tareacerrada": 0,
    "seguimiento.keyofe": 0,
    "seguimiento.duracion": 1,
    "seguimiento.confirmado": 0,
    "seguimiento.altaagente": 212632,
    "seguimiento.keyagente_nombre": "Miguel",
    "seguimiento.keyagente_apellidos": "Angel Carrillo Ramos"
  }
}
```

### 4.3 Campos del listado (22 por tarea)


| Campo                 | Ejemplo                            | Uso en captación                   |
| --------------------- | ---------------------------------- | ---------------------------------- |
| `codigo`              | `"4470"`                           | ID único (`codseg`)                |
| `fecha`               | `"2026-04-16"`                     | Fecha de la visita                 |
| `hora`                | `"16:00"`                          | Hora de la visita                  |
| `nombreSeguimiento`   | `"Visita → Reportaje Fotográfico"` | Detectar tipo de captación         |
| `asunto`              | `"Captación"`                      | Asunto libre                       |
| `nombreAgente`        | `"Miguel Angel Carrillo Ramos"`    | Nombre del comercial               |
| `codigoPropiedad`     | `"0"`                              | Propiedad vinculada (0 = manual)   |
| `codigoDemanda`       | `"0"`                              | Demanda vinculada                  |
| `referenciaPropiedad` | `""`                               | Ref vinculada (vacío en captación) |
| `duracion`            | `"1"`                              | 1=30min, 2=1h, 4=2h                |
| `keypadre`            | `"5143"`                           | Categoría padre del tipo           |


### 4.4 Tipos de tarea confirmados


| keytiposeg | nombre en listado                  | icono                    |
| ---------- | ---------------------------------- | ------------------------ |
| 50         | General → Apunte                   | pen-solid.svg            |
| 5024       | Lead → Existente                   | —                        |
| 38         | Llamada → Respondida               | clipboard-list-solid.svg |
| 4996       | Llamada → Programada               | —                        |
| 42         | Lead → Nuevo                       | address-card.svg         |
| **53**     | **Visita → Reportaje Fotográfico** | **camera-solid.svg**     |


### 4.5 Formato de `descrip` (observaciones)

CKEditor almacena con HTML. El `<br />` es el separador de líneas. El prefijo `~` en el teléfono lo añade automáticamente el editor.


| Input del comercial   | `descrip` en API              |
| --------------------- | ----------------------------- |
| `URUS36VMA` (línea 1) | `URUS36VMA<br />~666 777 888` |
| `666777888` (línea 2) |                               |


---

## 5. Dependencias entre bloques

```
Bloque 1 (HAR) ✅ ──► Bloque 2 (Ingestion Worker)
                                   │
                                   ▼
                        Bloque 3 (Handlers/Jobs) ◄── Bloque 7 (Templates WA)
                                   │
                                   ▼
                        Bloque 4 (WhatsApp Flow) ◄── Bloque 8 (Crear Flow en Meta)
                                   │
                                   ▼
                        Bloque 5 (PDF) ──► Bloque 6 (Firma)
```

**Orden de implementación recomendado (Bloque 1 completado):**

1. **Bloque 1** — Capturar HAR (manual, prerrequisito)
2. **Bloque 8** — Crear Flow en Meta (paralelo al código)
3. **Bloque 7** — Crear y aprobar plantillas WhatsApp (paralelo)
4. **Bloque 2** — Tasks Ingestion Worker + migración Prisma
5. **Bloque 5** — Generador PDF de Nota de Encargo
6. **Bloque 3** — Event/Job handlers (recordatorio, check, envío Flow)
7. **Bloque 4** — Integración WhatsApp Flow (envío + webhook)
8. **Bloque 6** — Integración firma (reutiliza existente, solo wiring)

---

## 6. Migración de base de datos

Una sola migración que añade:

1. Tabla `task_snapshots`
2. Tabla `nota_encargo_sessions`
3. Enum `NotaEncargoState`
4. Valores nuevos en `EventType` y `JobType`

```bash
npx prisma migrate dev --name nota_encargo_tables
```

---

## 7. Testing


| Test                          | Tipo        | Qué valida                                                                  |
| ----------------------------- | ----------- | --------------------------------------------------------------------------- |
| Parser de `descrip` HTML      | Unit        | `parseNotaEncargoDescrip("URUS36VMA<br />~666 777 888")` → `{ ref, phone }` |
| Parser con `<br>` simple      | Unit        | `parseNotaEncargoDescrip("URUS09VFEDE<br>600123456")` → `{ ref, phone }`    |
| Parser con texto no-captación | Unit        | `parseNotaEncargoDescrip("Llamar al cliente")` → `null`                     |
| Decode HTML entities          | Unit        | `decodeHtmlEntities("Visita &rarr; Reportaje")` → `"Visita → Reportaje"`    |
| Extracción datos de propiedad | Unit        | `extractPropertyDataFromRaw(raw, current)` → dirección, precio, tipo        |
| Detección tarea captación     | Unit        | `isCaptacionTask(task)` + `isValidCaptacionDetail(detail)`                  |
| Generación PDF                | Unit        | `generateNotaEncargoPdf(data)` produce PDF válido (>1KB, parseable)         |
| Job recordatorio              | Integration | Crea session → ejecuta job → envía template WA                              |
| Job check confirmación        | Integration | Session sin confirmar → notifica comercial                                  |
| Job enviar formulario         | Integration | Session confirmada → envía Flow WA                                          |
| Webhook nfm_reply             | Integration | Response del Flow → crea PDF + SignatureRequest                             |
| Flujo completo                | E2E         | Tarea → ingestión → recordatorio → confirmación → Flow → PDF → firma        |


