# Post-venta — Plantillas WhatsApp y Flow del formulario

> Referencia operativa para el módulo M9 (Automatización Post-Venta).
> Fuente de verdad del repositorio: `lib/postventa/*` y `flows-whatsapp/postventa-survey.flow.json`.

---

## 1. Principios

- **100 % plantilla Meta.** Todos los mensajes del pipeline post-venta se envían como plantilla aprobada por Meta, nunca como texto libre. Esto evita rechazos fuera de la ventana de 24h y asegura idioma/estilo aprobado.
- **Idempotencia estricta.** Cada envío anual (cumpleaños, navidad) usa `idempotencyKey = postventa:<tipo>:<operacionId>:<año>` para evitar duplicados.
- **El formulario se envía en D0.** Junto con el mensaje de agradecimiento. Si el comprador lo rellena, se programan cumpleaños y Navidad. Si no, la cadencia general continúa pero sin mensajes personalizados de fecha.
- **Indefinido por operación.** Tras un envío anual exitoso, el sistema reencola el siguiente año automáticamente.

---

## 2. Cadencia post-venta canónica

Definida en `lib/postventa/start-cadence-handler.ts` (`POSTVENTA_CADENCE`).

| Step                 | Delay desde cierre | Template interno | Plantilla Meta              | Job encolado                      | Pausa por incidencia |
| -------------------- | ------------------ | ---------------- | --------------------------- | --------------------------------- | -------------------- |
| `D0_AGRADECIMIENTO`  | 0                  | `agradecimiento` | `postventa_agradecimiento`  | `SEND_POSTVENTA_MESSAGE`          | No                   |
| `D0_FORMULARIO`      | 0                  | `formulario`     | `postventa_formulario`      | `SEND_POSTVENTA_FORM`             | No                   |
| `D10_RESENA`         | +10 días           | `resena`         | `postventa_resena`          | `SEND_POSTVENTA_MESSAGE`          | Sí                   |
| `D21_REFERIDOS`      | +21 días           | `referidos`      | `postventa_referidos`       | `SEND_POSTVENTA_MESSAGE`          | Sí                   |
| `D90_RECAPTACION`    | +90 días           | `recaptacion`    | `postventa_recaptacion`     | `SEND_POSTVENTA_MESSAGE`          | Sí                   |
| `BIRTHDAY_<year>`    | Fecha de nacimiento | `cumple`        | `postventa_cumpleanos`      | `SEND_POSTVENTA_MESSAGE` anual    | No                   |
| `NAVIDAD_<year>`     | 24-dic anual       | `navidad`        | `postventa_navidad`         | `SEND_POSTVENTA_MESSAGE` anual    | No                   |

> Los pasos `BIRTHDAY_<year>` y `NAVIDAD_<year>` **no** se encolan en `START_POSTVENTA_CADENCE`. Se programan desde `form-response-handler.ts` al completar el formulario y se reencolan automáticamente cada año desde `send-message-handler.ts` tras cada envío exitoso.

### Variables de entorno (cadencia y timing)

```
POSTVENTA_TIMEZONE=Europe/Madrid
POSTVENTA_BIRTHDAY_HOUR_LOCAL=12
POSTVENTA_NAVIDAD_DAY=24
POSTVENTA_NAVIDAD_MONTH=12
POSTVENTA_NAVIDAD_HOUR_LOCAL=12
AGENCY_NAME=Urus Capital
GOOGLE_REVIEW_URL=https://g.page/r/…/review
```

---

## 3. Plantillas Meta — crearlas en WhatsApp Business Manager

Categoría recomendada para todas: **UTILITY** (mensajes transaccionales/relacionales, no promocional). Idioma: **`es`** (o `es_ES`, ajusta `WHATSAPP_TEMPLATE_LANGUAGE`).

Todas las plantillas deben crearse en Meta Business Manager con los **nombres exactos** indicados o, alternativamente, sobreescribirse vía variable de entorno.

### 3.1 `postventa_agradecimiento`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_AGRADECIMIENTO`
- **Cuerpo (body) — 3 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` nombre de la agencia (p. ej. `Urus Capital`)
  - `{{3}}` nombre del comercial asignado

**Texto sugerido (es):**
```
🎉 ¡Enhorabuena por tu nueva vivienda, {{1}}!

Gracias por confiar en {{2}} y en tu agente {{3}}.

Si necesitas cualquier cosa durante estos primeros días, aquí estamos.
```

### 3.2 `postventa_formulario` (con WhatsApp Flow)

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_FORMULARIO`, `WHATSAPP_FLOW_POSTVENTA_SURVEY_ID`
- **Body — 2 variables**
  - `{{1}}` nombre del comprador (o `"cliente"`)
  - `{{2}}` referencia de operación (código de `Operacion` o `propertyCode`)
- **Botón:** tipo `FLOW` vinculado al **Flow** `postventa_survey` (ver sección 4). El `flow_token` se rellena con el `id` de `PostventaSurveySession`.

**Texto sugerido (body):**
```
Hola {{1}} 👋

Queremos seguir cuidándote después de la operación {{2}}. Dinos unos datos en menos de 1 minuto para enviarte novedades útiles sobre tu vivienda y una felicitación personalizada cada año.
```

### 3.3 `postventa_soporte` (retirada del flujo activo)

El paso de cadencia `D3_SOPORTE` (mini-guía + botones Quick Reply) ya no se encola. Los hilos antiguos que usaron esta plantilla pueden seguir siendo interpretados por el NLU (`lib/workers/consumer/whatsapp-nlu-handler.ts`, payloads `POSTVENTA_OK` / `POSTVENTA_AYUDA`). Para nuevas implantaciones no hace falta crear ni aprobar `postventa_soporte` en Meta.

### 3.4 `postventa_resena`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_RESENA`
- **Body — 2 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` URL de reseña (`GOOGLE_REVIEW_URL`)

**Texto sugerido:**
```
⭐ Hola {{1}}, esperamos que todo esté yendo genial.

Tu opinión nos ayuda muchísimo. ¿Nos dejarías una reseña? Solo es un minuto:
{{2}}

¡Mil gracias! — Urus Capital
```

### 3.5 `postventa_referidos`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_REFERIDOS`
- **Body — 2 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` URL del formulario de referidos (`<app>/postventa/referidos`)

**Texto sugerido:**
```
🤝 {{1}}, si conoces a alguien que esté pensando en comprar o vender una vivienda, nos encantaría ayudarle igual que te ayudamos a ti.

Comparte este enlace y cuidaremos de tu contacto:
{{2}}
```

### 3.6 `postventa_recaptacion`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_RECAPTACION`
- **Body — 3 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` nombre del comercial asignado
  - `{{3}}` URL de contacto (`<app>/contacto`)

**Texto sugerido:**
```
👋 Hola {{1}}, ya han pasado unos meses desde que cerramos la operación.

Si te estás planteando vender, ampliar inversión o conoces a alguien interesado, tu agente {{2}} está disponible:
{{3}}
```

### 3.7 `postventa_cumpleanos`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS`
- **Body — 2 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` nombre de la agencia

**Texto sugerido:**
```
🎂 ¡Feliz cumpleaños, {{1}}!

Todo el equipo de {{2}} te desea un día estupendo y un año cargado de buenas noticias. Cuídate y disfruta 🎉
```

### 3.8 `postventa_navidad`

- **Variables env:** `WHATSAPP_TEMPLATE_POSTVENTA_NAVIDAD`
- **Body — 2 variables**
  - `{{1}}` nombre del comprador
  - `{{2}}` nombre de la agencia

**Texto sugerido:**
```
🎄 ¡Felices fiestas, {{1}}!

Desde {{2}} queremos desearte una Navidad muy feliz junto a los tuyos. Gracias por seguir siendo parte de nuestra familia.
```

---

## 4. WhatsApp Flow — `postventa_survey`

**Archivo:** `flows-whatsapp/postventa-survey.flow.json`
**Flow ID (ENV):** `WHATSAPP_FLOW_POSTVENTA_SURVEY_ID`
**Endpoint:** no requerido (el Flow se configura en modo `navigate/complete` sin data exchange).

### 4.1 Estructura del Flow (v7.3)

Dos pantallas, siguiendo el mismo patrón validado que `nota-encargo.flow.json` y `parte-visita.flow.json`:

1. **`BIENVENIDA`** (no terminal): recibe los parámetros externos (`flow_token`, `buyer_name_hint`, `operation_ref`) desde `flow_action_data`, muestra un saludo + ref de operación y un botón **Continuar** que hace `navigate` a `DATOS_CLIENTE` arrastrando los datos.
2. **`DATOS_CLIENTE`** (terminal, success): formulario con los 3 campos (nombre, fecha de nacimiento, email). El `Footer` dispara `complete` y envía el payload por `nfm_reply`.

> Esta división evita el error de validación `Required property '__example__' is missing` que Meta lanza cuando se intenta usar una **única pantalla terminal con `data` de entrada**. Los 3 campos `data` llevan `__example__` en **ambas** pantallas.

**Archivo completo:** `flows-whatsapp/postventa-survey.flow.json` (pegar tal cual al importar en Meta Business Manager).

### 4.2 Campos del formulario (preguntas)

Este set mínimo v1 es un **array modificable** en el JSON; para ampliar preguntas edita `flows-whatsapp/postventa-survey.flow.json`, añade el nuevo `TextInput`/`DatePicker`/`RadioButtonsGroup`, inclúyelo también en el `payload` del `Footer.on-click-action` y extiende `handlePostventaFormNfmReply` para persistir el nuevo campo.

| Campo                | Tipo        | Obligatorio | Variable en payload   |
| -------------------- | ----------- | ----------- | --------------------- |
| Nombre y apellidos   | TextInput   | Sí          | `nombre_completo`     |
| Fecha de nacimiento  | DatePicker  | Sí          | `fecha_nacimiento`    |
| Email de contacto    | TextInput   | Sí          | `email`               |

### 4.3 Flujo de datos

1. `SEND_POSTVENTA_FORM` crea (o recupera) `PostventaSurveySession` con `id = flow_token`.
2. `sendPostventaFormulario` envía plantilla `postventa_formulario` con botón `FLOW` o, dentro de ventana 24h, mensaje interactivo `type=flow` abriendo la pantalla inicial `BIENVENIDA`.
3. El comprador pulsa **Continuar** y pasa a `DATOS_CLIENTE` (pantalla terminal).
4. Comprador completa el formulario → Meta envía `interactive.nfm_reply` al webhook.
5. `handlePostventaFormNfmReply` (`lib/postventa/form-response-handler.ts`) parsea respuestas, actualiza sesión, emite `POSTVENTA_FORMULARIO_COMPLETADO` y encola `SCHEDULE_POSTVENTA_BIRTHDAY` + `SCHEDULE_POSTVENTA_NAVIDAD`.

---

## 5. Componentes de código por flujo

| Archivo                                           | Responsabilidad                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `lib/postventa/start-cadence-handler.ts`          | Define `POSTVENTA_CADENCE` y encola los 6 steps base al disparar `OPERACION_CERRADA` |
| `lib/postventa/send-form-handler.ts`              | Job `SEND_POSTVENTA_FORM`: crea sesión y envía plantilla con Flow                    |
| `lib/postventa/whatsapp.ts`                       | `sendPostventaFormulario` (plantilla + Flow)                                         |
| `lib/postventa/form-response-handler.ts`          | Webhook `nfm_reply`: persiste datos y agenda cumple/navidad                          |
| `lib/postventa/schedule-birthday-handler.ts`      | Job `SCHEDULE_POSTVENTA_BIRTHDAY`: encola el próximo cumpleaños                      |
| `lib/postventa/schedule-navidad-handler.ts`       | Job `SCHEDULE_POSTVENTA_NAVIDAD`: encola la próxima Navidad                          |
| `lib/postventa/send-message-handler.ts`           | Job `SEND_POSTVENTA_MESSAGE`: envío siempre por plantilla y reagendado anual         |
| `lib/postventa/anniversary-schedule.ts`           | Utilidades tz Europe/Madrid + próxima ocurrencia anual                               |
| `lib/postventa/rearm-scanner.ts`                  | Red de seguridad mensual (cron `/api/cron/postventa-rearm`)                          |
| `lib/postventa/cadence-scanner.ts`                | Red de seguridad del flujo estándar (cron `/api/cron/postventa-cadences`)            |

---

## 6. Cron jobs (Upstash QStash)

| Cron                                | Frecuencia | Qué hace                                                               |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `POST /api/cron/postventa-cadences` | Cada 12 h  | Encola faltantes de la cadencia estándar (5 fases base + D0 formulario)|
| `POST /api/cron/postventa-rearm`    | Mensual    | Asegura que hay job para el próximo cumple y la próxima Navidad por operación |

Ambos requieren `CRON_SECRET`.

---

## 7. Eventos del Event Store añadidos

- `POSTVENTA_FORMULARIO_ENVIADO` — al enviar la plantilla con Flow.
- `POSTVENTA_FORMULARIO_COMPLETADO` — al recibir `nfm_reply`.

Se añaden a los ya existentes de post-venta: `INCIDENCIA_POSTVENTA_ABIERTA`, `INCIDENCIA_POSTVENTA_RESUELTA`, `OPERACION_CERRADA`, `RESENA_SOLICITADA`, etc.

---

## 8. Deprecación de `post-sale` legacy

A partir de 2026-04-17, la cadencia canónica es únicamente `lib/postventa/*`:

- `OPERACION_CERRADA` ya no dispara `handleOperacionCerrada` legacy (audit-only en `handlers.ts`).
- `/api/cron/cadences` deja de ejecutar `scanAndEnqueueMissingPostSaleJobs`.
- `lib/post-sale/*` permanece solo para leer mensajes históricos (no encola nuevos).
- La lectura del pipeline (`lib/postventa/pipeline-read-model.ts`) sigue combinando ambas fuentes para no romper operaciones cerradas antes de esta fecha.

---

## 9. Cómo crear las plantillas en Meta (paso a paso)

1. Entra a **Meta Business Suite → WhatsApp Manager → Plantillas de mensajes**.
2. Por cada plantilla listada en la sección 3:
   1. Nombre: el indicado (`postventa_agradecimiento`, etc.).
   2. Categoría: **Utility**.
   3. Idioma: **Español (`es`)** o el que coincida con `WHATSAPP_TEMPLATE_LANGUAGE`.
   4. Body: copia el texto sugerido. Sustituye las variables por `{{1}}`, `{{2}}`, etc., en el mismo orden documentado.
   5. Si la plantilla lleva botones (Quick Reply o Flow en `postventa_formulario`), añádelos en el apartado "Botones".
3. Para `postventa_formulario`:
   - Crea primero el Flow `postventa_survey` en **WhatsApp Flows → Crear Flow → Importar JSON** y pega el contenido de `flows-whatsapp/postventa-survey.flow.json`.
   - Publica el Flow y copia su `flow_id`.
   - En la plantilla, añade botón tipo **Flow** apuntando a ese `flow_id`.
   - Configura `WHATSAPP_FLOW_POSTVENTA_SURVEY_ID=<flow_id>` en `.env`.
4. Espera aprobación de Meta (normalmente < 1h para UTILITY).
5. Una vez aprobadas, no hace falta tocar código: el handler ya las referencia por nombre/env.
