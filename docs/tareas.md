# Inmovilla CRM — Tareas / Seguimientos: Complete API Analysis

> Extracted from HAR capture of `crm.inmovilla.com` on 2026-04-15 20:45 UTC.
> Agent user: `11636` (numagen) / `212632` (keyagente/id_pestanya prefix).

---

## 1. Architecture Overview

All task-related endpoints go through a single unified URL:

```
POST https://crm.inmovilla.com/new/app/api/v1/paginacion/?cache={cacheId}.2
```

This is the **same endpoint** used for demands, properties, etc. The `paramjson` body determines *what* data is loaded. Responses are JSON (content-type `text/html` but body is JSON).

Additionally, there are **REST API v2** endpoints for individual seguimiento details and a **ficha-seguimiento** PHP endpoint for the edit form.

---

## 2. Request Flow (Chronological)

### Step 1: Open the "Tareas Pendientes" window (ventana shell)

```
POST https://crm.inmovilla.com/new/app/api/v1/paginacion/?cache=31515453.2
```

**Body:**
```
ventana=tareas-pendientes&&soyajax=1
```

**Response:** JSON wrapping HTML for the task window shell:
```json
{
  "tareas-pendientes": {
    "info": {
      "cargajs": { "antes": "", "despues": "", "despuesvistas": "" },
      "vista": "<HTML of the tareas-pendientes window shell>"
    }
  }
}
```

The HTML includes:
- Hidden inputs: `tipolistado` (value="normal"), `paramjsonextra`, `whereIdCli`
- Filter controls: `seguimiento.keyagente` (iv-select-pro, lista="agentes"), etiqueta (`publicobin`), tipo seguimiento
- Column/table view toggle buttons
- Modal for "Programar tarea" (reschedule): fecha, hora, duración (1/2h to todo el día)
- Table container: `<div id="tareasresultados" data-id-listado="48">`

---

### Step 2: Load task type counts (tareasresultadosselect) — INITIAL

```
POST https://crm.inmovilla.com/new/app/api/v1/paginacion/?cache=31515454.2
```

**Body (paramjson decoded):**
```json
{
  "general": {
    "info": {
      "lostags": "",
      "numvistas": 1,
      "ventana": "tareas-pendientes",
      "data": "tareasresultadosselect"
    },
    "filtro": "seguimiento.keyagente;in;212632;"
  },
  "tareasresultadosselect": {
    "info": {
      "ficha": "tareas-pendientes",
      "data": "tareasresultadosselect",
      "posicion": 0,
      "jsonvista": "1",
      "totalreg": 0
    }
  }
}
```

Extra params: `contadores_para_select=1`

**Response (empty — first load, no filter removed yet):**
```json
{
  "tareas-pendientes": {
    "tareasresultadosselect": {
      "info": {
        "vista": "tareasresultados",
        "tipopag": "0",
        "vistanueva": "x",
        "sumatorios": [],
        "ficha": "tareas-pendientes",
        "data": "tareasresultadosselect",
        "campos": {
          "codigo":            { "pos": 0 },
          "idtipo":            { "pos": 1 },
          "contador":          { "pos": 2 },
          "nombre":            { "pos": 3 },
          "imagenSeguimiento": { "pos": 4 }
        },
        "total": "0",
        "posicion": 0,
        "paginacion": "100",
        "pagtotal": 0,
        "pagult": 0,
        "pagactual": 1,
        "pagsig": 2,
        "pagant": 0,
        "viendofav": "",
        "tipovista": "listado",
        "tipolistado": null,
        "numvista": null
      },
      "hijos": [],
      "fav": "",
      "cargajs": { "antes": "", "despues": "" }
    }
  }
}
```

---

### Step 3: Load time-based columns (5 parallel requests)

All use the same endpoint with different `data` values. All filter by agent:

**Filter DSL:** `"seguimiento.keyagente;in;212632;"`

#### 3a. Atrasadas (Overdue)
- `data`: `"tareasresultados_atrasadas"`
- Pagination: 30 per page

#### 3b. Hoy (Today)
- `data`: `"tareasresultados_hoy"`
- Pagination: 30 per page

#### 3c. Mañana (Tomorrow)
- `data`: `"tareasresultados_manyana"`
- Pagination: 30 per page

#### 3d. Próximos (Upcoming)
- `data`: `"tareasresultados_proximos"`
- Pagination: 30 per page

#### 3e. Select (Type counts)
- `data`: `"tareasresultadosselect"`
- Pagination: 100 per page

---

### Step 4: Reload after filter cleared (no agent filter)

Same endpoints are called again but **without** the `filtro` in `general`:

```json
{
  "general": {
    "info": {
      "lostags": "",
      "numvistas": 1,
      "ventana": "tareas-pendientes",
      "data": "tareasresultadosselect"
    }
  },
  "tareasresultadosselect": {
    "info": {
      "ficha": "tareas-pendientes",
      "data": "tareasresultadosselect",
      "posicion": 0,
      "paginacion": "100",
      "jsonvista": "1",
      "totalreg": "0"
    }
  }
}
```

**Response with actual data (6 task types, total 65 tasks):**
```json
{
  "tareas-pendientes": {
    "tareasresultadosselect": {
      "info": {
        "total": "6",
        "posicion": 0,
        "paginacion": "100",
        "pagtotal": 1,
        "pagactual": 1
      },
      "datos": [
        {
          "fields": [
            { "campo": "codigo",            "value": "3425" },
            { "campo": "idtipo",            "value": "50" },
            { "campo": "contador",          "value": "5" },
            { "campo": "nombre",            "value": "Apunte" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/pen-solid.svg" }
          ]
        },
        {
          "fields": [
            { "campo": "codigo",            "value": "3616" },
            { "campo": "idtipo",            "value": "5024" },
            { "campo": "contador",          "value": "12" },
            { "campo": "nombre",            "value": "Existente" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/" }
          ]
        },
        {
          "fields": [
            { "campo": "codigo",            "value": "3863" },
            { "campo": "idtipo",            "value": "38" },
            { "campo": "contador",          "value": "1" },
            { "campo": "nombre",            "value": "Respondida" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/clipboard-list-solid.svg" }
          ]
        },
        {
          "fields": [
            { "campo": "codigo",            "value": "4149" },
            { "campo": "idtipo",            "value": "4996" },
            { "campo": "contador",          "value": "3" },
            { "campo": "nombre",            "value": "Programada ⏱️" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/" }
          ]
        },
        {
          "fields": [
            { "campo": "codigo",            "value": "4469" },
            { "campo": "idtipo",            "value": "42" },
            { "campo": "contador",          "value": "43" },
            { "campo": "nombre",            "value": "Nuevo" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/address-card.svg" }
          ]
        },
        {
          "fields": [
            { "campo": "codigo",            "value": "4470" },
            { "campo": "idtipo",            "value": "53" },
            { "campo": "contador",          "value": "1" },
            { "campo": "nombre",            "value": "Reportaje Fotográfico" },
            { "campo": "imagenSeguimiento", "value": "iconos/iconos-tipo-medios/camera-solid.svg" }
          ]
        }
      ]
    }
  }
}
```

**Known task type IDs (idtipo → nombre):**

| idtipo | nombre | icon |
|--------|--------|------|
| 50 | Apunte | pen-solid.svg |
| 5024 | Existente | (none) |
| 38 | Respondida | clipboard-list-solid.svg |
| 4996 | Programada ⏱️ | (none) |
| 42 | Nuevo | address-card.svg |
| 53 | Reportaje Fotográfico | camera-solid.svg |

---

## 3. Task Listing Fields (tareasresultados_atrasadas / _hoy / _manyana / _proximos)

All 4 time columns return the **same field schema** (22 fields):

```json
{
  "campos": {
    "codigo":                { "pos": 0 },
    "fecha":                 { "pos": 1 },
    "hora":                  { "pos": 2 },
    "nombreSeguimiento":     { "pos": 3 },
    "keypadre":              { "pos": 4 },
    "imagenSeguimiento":     { "pos": 5 },
    "pendienteConfirmacion": { "pos": 6 },
    "fotoAgente":            { "pos": 7 },
    "referenciaPropiedad":   { "pos": 8 },
    "referenciaDemanda":     { "pos": 9 },
    "referenciaContacto":    { "pos": 10 },
    "asunto":                { "pos": 11 },
    "imagenEtiqueta":        { "pos": 12 },
    "duracion":              { "pos": 13 },
    "keynegocio":            { "pos": 14 },
    "visible_embudo":        { "pos": 15 },
    "nombreAgente":          { "pos": 16 },
    "repetir":               { "pos": 17 },
    "segCreadorRepeticion":  { "pos": 18 },
    "codigoPropiedad":       { "pos": 19 },
    "codigoDemanda":         { "pos": 20 },
    "codigoContacto":        { "pos": 21 }
  }
}
```

### Example task row (from tareasresultados_atrasadas):

```json
{
  "acciones": [],
  "fields": [
    { "campo": "codigo",                "value": "4443" },
    { "campo": "fecha",                 "value": "2026-04-14" },
    { "campo": "hora",                  "value": "23:33" },
    { "campo": "nombreSeguimiento",     "value": "Lead → Nuevo" },
    { "campo": "keypadre",              "value": "5147" },
    { "campo": "imagenSeguimiento",     "value": "iconos/iconos-tipo-medios/address-card.svg" },
    { "campo": "pendienteConfirmacion", "value": "" },
    { "campo": "fotoAgente",            "value": "https://fotos15.apinmo.com/siglas/FJ.jpg" },
    { "campo": "referenciaPropiedad",   "value": "URUS08VFEDE" },
    { "campo": "referenciaDemanda",     "value": "1164" },
    { "campo": "referenciaContacto",    "value": "" },
    { "campo": "asunto",                "value": "Se ha contactado por idealista.com en relación a la propiedad URUS08VFEDE en Córdoba con un precio de 72.500€" },
    { "campo": "imagenEtiqueta",        "value": "imgnew/dest0.png" },
    { "campo": "duracion",              "value": "1" },
    { "campo": "keynegocio",            "value": "0" },
    { "campo": "visible_embudo",        "value": "0" },
    { "campo": "nombreAgente",          "value": "FEDERICO JESÚS CARRILLO RAMOS" },
    { "campo": "repetir",              "value": "0" },
    { "campo": "segCreadorRepeticion",  "value": "" },
    { "campo": "codigoPropiedad",       "value": "28208731" },
    { "campo": "codigoDemanda",         "value": "39567046" },
    { "campo": "codigoContacto",        "value": "0" }
  ]
}
```

### Notable `nombreSeguimiento` values observed:

| nombreSeguimiento | keypadre | Description |
|---|---|---|
| Lead → Nuevo | 5147 | New lead from portal |
| Lead → Existente | 5147 | Returning lead |
| General → Apunte | 5148 | General note/reminder |
| Llamada Cliente → Programada ⏱️ | 40 | Scheduled client call |
| Reportaje Fotográfico | (53) | Photo shoot task |

---

## 4. Pagination System

```json
{
  "total": "63",
  "posicion": 0,
  "paginacion": "30",
  "pagtotal": 3,
  "pagult": 3,
  "pagactual": 1,
  "pagsig": 2,
  "pagant": 0,
  "tipovista": "listado"
}
```

- **paginacion**: page size (30 for time columns, 100 for type select)
- **posicion**: offset (0-based, increments by page size)
- **pagactual**: current page (1-based)
- **pagsig / pagant**: next / previous page numbers
- **pagtotal / pagult**: total pages / last page
- To go to page 2: set `posicion: 30` and `totalreg: "63"` in the paramjson

---

## 5. Filter DSL Format

Filters go in `general.filtro` as a semicolon-separated string:

```
{table.field};{operator};{value};
```

**Examples:**
```
seguimiento.keyagente;in;212632;          // Agent filter (single)
seguimiento.keyagente;in;212632,177892;   // Agent filter (multiple)
```

When no filter is applied, the `filtro` key is simply absent from `general`.

---

## 6. Opening a Task Detail (Ficha Seguimiento)

Opening a task triggers **3 parallel requests**:

### 6a. REST API v2 — Get seguimiento data

```
GET https://crm.inmovilla.com/new/app/api/v2/seguimientos/{codseg}
```

Example: `GET /new/app/api/v2/seguimientos/4470`

**Response (application/json):**
```json
{
  "success": true,
  "status_code": 200,
  "data": {
    "seguimiento.codseg": 4470,
    "seguimiento.asunto": "Captación",
    "seguimiento.descrip": "URUS36VMA<br />~666 777 888",
    "seguimiento.keyagente": 177892,
    "seguimiento.numagencia": 11636,
    "seguimiento.keytiposeg": 53,
    "seguimiento.keyofe": 0,
    "seguimiento.tareacerrada": 0,
    "seguimiento.fechaaviso": "2026-04-16 16:00:00",
    "seguimiento.keydem": 0,
    "seguimiento.publico": 0,
    "seguimiento.keyprospecto": 0,
    "seguimiento.fechaalta": "2026-04-15 15:41:49",
    "seguimiento.duracion": 1,
    "seguimiento.repetir": 0,
    "seguimiento.altaagente": 212632,
    "seguimiento.confirmado": 0,
    "seguimiento.fechafin": "0000-00-00 00:00:00",
    "seguimiento.keynegocio": 0,
    "seguimiento.visible_embudo": 0,
    "seguimiento.altaagente_id": 212632,
    "seguimiento.altaagente_nombre": "Santiago",
    "seguimiento.altaagente_apellidos": "",
    "seguimiento.keyagente_id": 177892,
    "seguimiento.keyagente_nombre": "Miguel",
    "seguimiento.keyagente_apellidos": "Angel Carrillo Ramos",
    "seguimiento.crm": 0,
    "seguimiento.grabacion": 0,
    "seguimiento.voicetotext": 0,
    "seguimiento.repeticion_creador": 329,
    "centralita": null,
    "embudos": null,
    "proceso": null,
    "extra": null,
    "recordatorios": null,
    "documentos_count": "0",
    "canales_chat": []
  }
}
```

### 6b. Ficha Seguimiento Form (HTML)

```
POST https://crm.inmovilla.com/new/app/ventanas/ficha-seguimiento/ficha-seguimiento.php?cache={id}&soycargarcapa=1
```

**Body:**
```
tipo_formulario=editar&soyajax=1&l={authToken}
```

**Response:** HTML form (20KB) with all the editable fields as hidden inputs and form controls. Key fields from the HTML:

**Hidden inputs (form fields):**
- `seguimiento.numagencia`
- `seguimiento.keyofe`
- `seguimiento.keydem`
- `seguimiento.keyprospecto`
- `seguimiento.codseg` (disabled, name="priclave")
- `seguimiento.fechafin`
- `seguimiento.confirmado`
- `seguimiento.grabacion`
- `seguimiento.voiceToText`
- `embudosrel.keyembudo`
- `seguimientoMasivo`
- `seguimiento.publico`
- `seguimiento.altaagente`
- `seguimiento.tareacerrada`
- `seguimiento.keyagente`
- `seguimiento.keynegocio`
- `actualizar-repeticiones` (value="0")

**Visible form controls:**
- **Categoría** (select): `tarea` | `nota`
- **Etiqueta** (iv-select-pro, lista="favorito")
- **Tipo** (iv-select-pro `seguimiento.keytiposeg`, lista="tiposeguimientoSinOcultosCreacion", categorizado)
- **Agentes** (iv-select-pro `js_seguimiento_keyagente`, lista="agentes")
- **Agendar** (iv-calendario `seguimiento.fechaaviso`)
- **Asunto** (text input `seguimiento.asunto`)
- **Observaciones** (textarea `seguimiento.descrip`, claseCkEditor)
- **Duración** (select `seguimiento.duracion`): 1=30min, 2=1h, 4=2h, 6=3h, 8=4h, 16=8h, 48=todo el día
- **Visibilidad** (select `js_seguimiento_publico`): 0=No público, 1=Público, 2=Asunto público
- **Repetición** (select `seguimiento.repetir`): 0=No, 1=Diario, 7=Semanal, 14=Quincenal, 30=Mensual, 60=Bimensual, 90=Trimestral, 180=Semestral, 365=Anual
- **Fecha creación** (datetime-local `seguimiento.fechaalta`)

**Validation rules** (from `comprobar` input):
```
seguimiento.keyagente;Selecciona comercial
seguimiento.fecha;Debes introducir la fecha
seguimiento.asunto;Introduce asunto
seguimiento.keytiposeg;Selecciona el tipo de apunte
```

**Task states** (from HTML buttons):
- Active (amarillo/yellow clock icon)
- Finalizada (verde/green thumbs up)
- Anulada (rojo/red X)

**Actions:** Finalizar, Anular, Reanudar, Duplicar, Eliminar, Guardar

**Relations:** card-propiedad, card-demanda, card-cliente

### 6c. Create chat room for seguimiento

```
POST https://crm.inmovilla.com/new/app/cargas/seguimientos/creasalachat.php
```

**Body:** `codseg=4470`

### 6d. Check for conflicting tasks (tareas_simple_info)

```
GET https://crm.inmovilla.com/new/app/api/v2/seguimientos/?type_resource=tareas_simple_info&fecha=16/04/2026&hora=16:00&agente=177892&agenteNombre=Miguel+Angel+Carrillo+Ramos&keyofe=0&codseg=4470&keydem=0&numagen=11636
```

**Query params:**
| Param | Value | Description |
|---|---|---|
| type_resource | tareas_simple_info | Resource type |
| fecha | 16/04/2026 | Scheduled date |
| hora | 16:00 | Scheduled time |
| agente | 177892 | Agent key |
| agenteNombre | Miguel Angel Carrillo Ramos | Agent name |
| keyofe | 0 | Property key |
| codseg | 4470 | Current seguimiento ID |
| keydem | 0 | Demand key |
| numagen | 11636 | Agency number |

**Response:** `{"success": true, "status_code": 200, "data": []}`
(Empty = no conflicts at that date/time for that agent)

---

## 7. Analytics / Tracking

```
POST https://crm.inmovilla.com/new/app/cargas/vernoticias.php  (with tipo=uso&subtipo=dashboard.panelsimplificado-tareaspendientes)
```

And Google Analytics page_view to:
```
https://crm.inmovilla.com/seguimiento/11636/4470/
```
(Pattern: `/seguimiento/{numagen}/{codseg}/`)

---

## 8. Complete seguimiento.* Field Reference

From the API v2 response, here is every known field in the `seguimiento` entity:

| Field | Type | Example | Description |
|---|---|---|---|
| seguimiento.codseg | int | 4470 | Primary key |
| seguimiento.asunto | string | "Captación" | Subject line |
| seguimiento.descrip | string (HTML) | "URUS36VMA\<br\/>~666 777 888" | Observations/description |
| seguimiento.keyagente | int | 177892 | Assigned agent ID |
| seguimiento.numagencia | int | 11636 | Agency number |
| seguimiento.keytiposeg | int | 53 | Task type ID (see type table) |
| seguimiento.keyofe | int | 0 | Related property key (0 = none) |
| seguimiento.tareacerrada | int | 0 | 0=open, 1=closed |
| seguimiento.fechaaviso | datetime | "2026-04-16 16:00:00" | Scheduled date/time |
| seguimiento.keydem | int | 0 | Related demand key (0 = none) |
| seguimiento.publico | int | 0 | Visibility (0=private, 1=public, 2=subject only) |
| seguimiento.keyprospecto | int | 0 | Related prospect/contact key |
| seguimiento.fechaalta | datetime | "2026-04-15 15:41:49" | Creation timestamp |
| seguimiento.duracion | int | 1 | Duration code (1=30m, 2=1h, 4=2h, etc.) |
| seguimiento.repetir | int | 0 | Repetition interval in days (0=none) |
| seguimiento.altaagente | int | 212632 | Created-by agent ID |
| seguimiento.confirmado | int | 0 | Confirmation status |
| seguimiento.fechafin | datetime | "0000-00-00 00:00:00" | End/close date |
| seguimiento.keynegocio | int | 0 | Related deal/pipeline key |
| seguimiento.visible_embudo | int | 0 | Visible in funnel |
| seguimiento.crm | int | 0 | CRM flag |
| seguimiento.grabacion | int | 0 | Has recording |
| seguimiento.voicetotext | int | 0 | Voice-to-text |
| seguimiento.repeticion_creador | int | 329 | Repetition creator ID |

**Joined fields (from v2 response):**
- `seguimiento.altaagente_id`, `seguimiento.altaagente_nombre`, `seguimiento.altaagente_apellidos`
- `seguimiento.keyagente_id`, `seguimiento.keyagente_nombre`, `seguimiento.keyagente_apellidos`
- `centralita`, `embudos`, `proceso`, `extra`, `recordatorios`
- `documentos_count`, `canales_chat`

---

## 9. Summary of All Task-Related Endpoints

| # | Method | URL | Purpose |
|---|---|---|---|
| 1 | POST | `/new/app/api/v1/paginacion/` | Main listing — loads window shell, task lists, type counts |
| 2 | GET | `/new/app/api/v2/seguimientos/{codseg}` | Get full seguimiento detail (JSON) |
| 3 | POST | `/new/app/ventanas/ficha-seguimiento/ficha-seguimiento.php` | Load edit form HTML |
| 4 | POST | `/new/app/cargas/seguimientos/creasalachat.php` | Create chat room for seguimiento |
| 5 | GET | `/new/app/api/v2/seguimientos/?type_resource=tareas_simple_info&...` | Check schedule conflicts |
| 6 | POST | `/new/app/cargas/vernoticias.php` | Analytics tracking (panelsimplificado-tareaspendientes) |

---

## 10. paramjson Structure Reference

### For listing data (paginacion endpoint):

```json
{
  "general": {
    "info": {
      "lostags": "",
      "numvistas": 1,
      "ventana": "tareas-pendientes",
      "data": "<vista_name>"
    },
    "filtro": "<DSL filter string or absent>"
  },
  "<vista_name>": {
    "info": {
      "ficha": "tareas-pendientes",
      "data": "<vista_name>",
      "posicion": 0,
      "paginacion": "30",
      "jsonvista": "1",
      "totalreg": "0"
    }
  }
}
```

### vista_name values:

| vista_name | Description | Page size |
|---|---|---|
| `tareasresultadosselect` | Task type counts (column headers) | 100 |
| `tareasresultados_atrasadas` | Overdue tasks | 30 |
| `tareasresultados_hoy` | Today's tasks | 30 |
| `tareasresultados_manyana` | Tomorrow's tasks | 30 |
| `tareasresultados_proximos` | Upcoming tasks (>tomorrow) | 30 |

### Common POST params alongside paramjson:

| Param | Description |
|---|---|
| `soyajax` | Always "1" |
| `miid` | Session identifier: `{numagen}.{keyagente}.{date}.{cacheId}_{numagen}` |
| `l` | Auth token (base64-encoded) |
| `id_pestanya` | Tab identifier: `{keyagente}_{timestamp}` |
| `contadores_para_select` | "1" when loading type counts |

---

## 11. Response Format

All paginacion responses follow this structure:

```json
{
  "tareas-pendientes": {
    "<vista_name>": {
      "info": {
        "vista": "tareasresultados",
        "tipopag": "0",
        "vistanueva": "x",
        "sumatorios": [],
        "ficha": "tareas-pendientes",
        "data": "<vista_name>",
        "campos": { /* field → position mapping */ },
        "total": "<total_count>",
        "posicion": 0,
        "paginacion": "<page_size>",
        "pagtotal": "<total_pages>",
        "pagult": "<last_page>",
        "pagactual": 1,
        "pagsig": 2,
        "pagant": 0,
        "viendofav": "",
        "tipovista": "listado",
        "tipolistado": null,
        "numvista": null
      },
      "hijos": [],
      "datos": [
        {
          "acciones": [],
          "fields": [
            { "campo": "<field_name>", "value": "<value>" }
          ]
        }
      ],
      "fav": "",
      "cargajs": { "antes": "", "despues": "" }
    }
  }
}
```

**Note:** When `datos` is absent, the list is empty (total=0). When present, each item has an `acciones` array (empty in observed data) and a `fields` array with campo/value pairs matching the `campos` position map.
