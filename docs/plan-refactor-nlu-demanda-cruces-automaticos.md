# Plan de Refactorizacion e Implementacion — NLU de Demanda, Cruces y Visitas

## Objetivo

Este documento define el plan tecnico para implementar el sistema descrito en `docs/analisis-flujo-nlu-demanda-cruces-automaticos.md`.

El objetivo no es construir un flujo paralelo, sino refactorizar lo existente para que el ciclo real de negocio quede cubierto:

1. Demanda nueva o reactivada.
2. Conversacion NLU natural con el comprador.
3. Cruces y microsites con validacion manual o auto-validacion IA.
4. Deteccion de interes real.
5. Visita pre-creada para el comercial.
6. Agenda manual por el comercial con propietario/agencia.
7. Decision post-visita: verde, amarillo o rojo.
8. Operaciones, re-perfilado o baja.

## Estado Actual del Sistema

### Ya existe y se debe reutilizar

| Area | Estado actual | Archivos principales |
| --- | --- | --- |
| NLU WhatsApp comprador | Clasifica feedback, extrae variables y emite eventos. | `lib/agents/nlu-graph.ts`, `lib/workers/consumer/whatsapp-nlu-handler.ts` |
| Feedback por propiedad | Persiste `SELECCION_COMPRADOR` y notifica al comercial si hay `ME_INTERESA`. | `lib/workers/consumer/seleccion-comprador-handler.ts` |
| Microsite | Genera seleccion, valida manualmente o auto-valida con IA, envia al comprador. | `lib/microsite/selection.ts`, `lib/microsite/auto-validate.ts`, `app/validar-seleccion/[validationToken]/page.tsx` |
| Configuracion auto-validacion | CEO/Admin activa `autoValidateMicrosite` por comercial. | `components/configuracion/microsite-auto-validation.tsx`, `app/platform/configuracion/page.tsx` |
| Paquete operativo de visita | Construye comprador, propiedad y contacto propietario/agencia desde feedback `ME_INTERESA`. | `lib/visitas/interest-package.ts` |
| Notificacion al comercial | Envia WhatsApp con paquete de visita. | `lib/visitas/notify-commercial.ts` |
| Agenda manual | Crea calendario, `VisitSchedulingSession`, `PropertyVisitSlot`, `VISITA_AGENDADA` y Flow de parte de visita. | `lib/visitas/manual-schedule.ts`, `app/api/visitas/schedule/route.ts` |
| Post-visita generico | `POST /api/post-visit` emite `VISITA_EVALUADA`; handler puede generar microsite si interes alto. | `app/api/post-visit/route.ts`, `lib/workers/consumer/visita-evaluada-handler.ts` |
| Baja de demanda | Endpoint marca `PERDIDO` y encola escritura de estado en Inmovilla cuando puede resolver datos. | `app/api/demands/[codigo]/deactivate/route.ts` |

### Brechas principales

| Brecha | Impacto |
| --- | --- |
| No hay entidad clara de visita pre-creada. | La UI depende de paquetes derivados de feedback, pero no hay estado propio de "pendiente de programar", "incompleta", "decidida". |
| `/platform/visitas` no soporta query parameters. | El comercial puede llegar desde WhatsApp a una pantalla vacia o no seleccionada. |
| La UI de visitas mezcla listado de demandas y registro de visita. | Falta un panel izquierdo de visitas por programar y un panel derecho amplio de detalle/acciones. |
| Post-visita usa `interes=alto/medio/bajo`. | El negocio requiere decisiones explicitas: verde, amarillo, rojo. |
| Rama amarilla no reabre formalmente el feedback loop NLU. | Hoy `VISITA_EVALUADA` con interes alto genera microsite; no hay evento especifico para "busca algo diferente". |
| Rama verde no enlaza explicitamente con Operaciones. | Se necesita evento/endpoint que inicie o vincule operacion desde visita. |
| Rama roja debe garantizar baja local + Inmovilla con reintento. | Existe baja, pero debe integrarse desde la decision post-visita y dejar estado pendiente si falla Inmovilla. |

## Principios de Implementacion

- Reutilizar Event Store y Job Queue. No introducir un workflow sin eventos.
- Mantener Inmovilla como CRM de criterios y baja, no como fuente del pipeline operativo.
- Reutilizar `VisitSchedulingSession` para visita confirmada, pero introducir una capa previa para visita pre-creada.
- Hacer el refactor en fases pequeñas, manteniendo compatibilidad con la pantalla actual mientras se migra.
- El comercial debe tener siempre contacto del propietario o contacto operativo de agencia/anunciante antes de coordinar.
- El comprador no debe recibir microsites en `PENDING_VALIDATION`; debe existir aprobacion manual o auto-validacion IA.
- La UI debe soportar modo mock por query parameter al tocar flujo visual.

## Decision Tecnica Principal: Visita Pre-Creada

Se recomienda crear una entidad persistente nueva para representar la visita antes de tener horario.

### Nuevo modelo propuesto

`VisitWorkItem` o `VisitPrecreation`.

Campos minimos:

| Campo | Uso |
| --- | --- |
| `id` | Identificador estable para links y query parameters. |
| `demandId` | Demanda compradora. |
| `selectionId` | Microsite/seleccion origen, si existe. |
| `propertyId` / `propertyCode` | Propiedad interesada. |
| `propertySource` | `internal` o `external`. |
| `comercialId` | Comercial responsable. |
| `buyerName` | Nombre comprador en el momento de creacion. |
| `buyerPhone` | Telefono comprador. |
| `propertySnapshot` | JSON con datos de propiedad mostrados al comercial. |
| `contactSnapshot` | JSON con propietario/agencia/anunciante y telefonos. |
| `nluSummary` | Motivo de interes y preferencias relevantes. |
| `status` | Estado operativo de la visita pre-creada. |
| `scheduledSessionId` | Referencia a `VisitSchedulingSession` cuando se agenda. |
| `missingContactPhone` | Bloquea o marca como incompleta si falta contacto. |
| `createdAt` / `updatedAt` | Auditoria. |

Estados sugeridos:

| Estado | Significado |
| --- | --- |
| `INCOMPLETE` | Falta contacto operativo o datos minimos. |
| `PENDING_SCHEDULE` | Lista para que el comercial coordine horario. |
| `SCHEDULED` | Ya se creo `VisitSchedulingSession`. |
| `COMPLETED` | La visita ocurrio y esta pendiente o lista para decision. |
| `DECIDED_GREEN` | Va a comprar. |
| `DECIDED_YELLOW` | Busca algo diferente. |
| `DECIDED_RED` | Dar de baja. |
| `CANCELLED` | Cancelada antes de realizarse. |

### Por que no basta con `MicrositeSelectionFeedback`

`MicrositeSelectionFeedback` registra interes o rechazo por propiedad. No representa la tarea operativa del comercial. La visita pre-creada necesita estado, link propio, contacto congelado, decision post-visita, trazabilidad y relacion con agenda.

## Fases de Implementacion

### Fase 1 — Modelo de visita pre-creada y eventos

**Objetivo:** convertir el interes real en una unidad operativa persistente.

Cambios:

1. Crear modelo Prisma `VisitWorkItem` con los campos descritos.
2. Añadir enum `VisitWorkItemStatus`.
3. Añadir eventos al schema si se decide tiparlos:
   - `VISITA_PRECREADA`
   - `POST_VISITA_DECIDIDA`
   - `DEMANDA_REPERFILADO_SOLICITADO`
   - Opcional: `VISITA_PRECREADA_INCOMPLETA`
4. Crear helper `lib/visitas/work-items.ts`:
   - `createOrUpdateVisitWorkItemFromInterest()`
   - `listVisitWorkItems()`
   - `getVisitWorkItem()`
   - `markVisitWorkItemScheduled()`
   - `decideVisitWorkItem()`
5. Hacer idempotencia por `demandId + selectionId + propertyId`.

Criterios de aceptacion:

- Un `SELECCION_COMPRADOR` con `ME_INTERESA` crea o actualiza un `VisitWorkItem`.
- Si falta telefono de propietario/agencia, queda `INCOMPLETE`.
- Si tiene contacto, queda `PENDING_SCHEDULE`.
- Se emite `VISITA_PRECREADA`.

### Fase 2 — Integracion con `SELECCION_COMPRADOR` y notificacion comercial

**Objetivo:** que el paquete enviado al comercial apunte a una visita concreta.

Cambios:

1. Refactorizar `lib/workers/consumer/seleccion-comprador-handler.ts`:
   - Mantener persistencia de feedback.
   - Crear `VisitWorkItem` por propiedad interesada.
   - Mantener `leadStatus = VISITA_PENDIENTE`.
2. Refactorizar `lib/visitas/notify-commercial.ts`:
   - Incluir link directo a `/platform/visitas?visitId={id}`.
   - Mantener contacto propietario/agencia como campo obligatorio visible.
   - Si hay varios intereses, enviar resumen con links o un link a la lista filtrada por `demandId`.
3. Ajustar plantilla WhatsApp `visita_paquete_comercial` si las variables actuales no incluyen URL directa.

Criterios de aceptacion:

- El comercial recibe una notificacion que abre directamente la visita pre-creada.
- El link contiene `visitId` o parametros suficientes.
- La notificacion indica claramente si falta telefono de propietario/agencia.

### Fase 3 — API de visitas por programar

**Objetivo:** reemplazar la API basada solo en paquetes derivados por una API de tareas operativas.

Cambios:

1. Refactorizar `GET /api/visitas` para devolver `VisitWorkItem[]`.
2. Mantener un fallback temporal a `listVisitInterestPackages()` mientras se migra.
3. Añadir filtros:
   - `status`
   - `comercialId`
   - `demandId`
   - `visitId`
   - `selectionId`
   - `propertyId` / `propertyCode`
4. Añadir `GET /api/visitas/[id]` si la UI necesita cargar detalle independiente.
5. Añadir `POST /api/visitas/[id]/schedule` o extender `/api/visitas/schedule` para aceptar `visitId`.

Criterios de aceptacion:

- `GET /api/visitas?status=PENDING_SCHEDULE` devuelve visitas por programar.
- `GET /api/visitas?visitId=...` devuelve la visita seleccionada.
- Un comercial no puede ver visitas de otro comercial salvo CEO/Admin.

### Fase 4 — Refactor UI `/platform/visitas`

**Objetivo:** adaptar la interfaz al modelo operativo real.

Cambios:

1. Refactorizar `app/platform/visitas/visitas-client.tsx`.
2. Usar `useSearchParams()` para leer:
   - `visitId`
   - `demandId`
   - `propertyId` / `propertyCode`
   - `selectionId`
   - `mock=1` o `uiMock=1` para vista demo.
3. Layout:
   - Izquierda: visitas por programar.
   - Derecha: detalle amplio de la visita seleccionada.
4. Estados vacios:
   - Sin visitas.
   - Link con `visitId` inexistente.
   - Visita incompleta por falta de contacto.
5. Detalle derecho:
   - comprador,
   - propiedad,
   - propietario/agencia,
   - resumen NLU,
   - horario,
   - notas,
   - boton agendar,
   - botones post-visita cuando corresponda.
6. Tras agendar:
   - actualizar `VisitWorkItem.status = SCHEDULED`,
   - guardar `scheduledSessionId`,
   - mantener flujo actual de `scheduleManualVisit()`.

Criterios de aceptacion:

- Un link `/platform/visitas?visitId=...` abre la visita correcta.
- La columna izquierda resalta la visita seleccionada.
- La columna derecha nunca queda vacia si hay datos validos.
- Si falta telefono de propietario/agencia, la UI lo marca y no oculta el problema.

### Fase 5 — Decision post-visita verde, amarillo, rojo

**Objetivo:** convertir el post-visita en decisiones de negocio explicitas.

Cambios:

1. Crear endpoint `POST /api/visitas/[id]/decision`.
2. Body:
   - `decision`: `green` | `yellow` | `red`
   - `notes?`
   - `reason?`
3. Mapear decisiones:
   - `green` → `POST_VISITA_DECIDIDA` + `OPERACION_INICIADA` o `OPERACION_CREADA`.
   - `yellow` → `POST_VISITA_DECIDIDA` + `DEMANDA_REPERFILADO_SOLICITADO`.
   - `red` → `POST_VISITA_DECIDIDA` + `DEMANDA_BAJA_SOLICITADA`.
4. Actualizar estado del `VisitWorkItem`.
5. Actualizar `DemandCurrent.leadStatus`:
   - verde: `EN_NEGOCIACION`,
   - amarillo: vuelve a `CONTACTADO` o `EN_SELECCION` segun decision de producto,
   - rojo: `PERDIDO`.
6. Mantener compatibilidad con `VISITA_EVALUADA`:
   - verde puede emitir `VISITA_EVALUADA` con `interes=alto`,
   - amarillo puede emitir `VISITA_EVALUADA` con `interes=medio` o evento nuevo,
   - rojo puede omitir `VISITA_EVALUADA` y ejecutar baja.

Criterios de aceptacion:

- La UI muestra botones verde/amarillo/rojo cuando la visita esta realizada o marcada como lista para decision.
- Cada boton genera eventos trazables.
- No hay ambiguedad entre "alto/medio/bajo" y "va a comprar/busca diferente/dar de baja".

### Fase 6 — Rama verde: Operaciones

**Objetivo:** iniciar el flujo de cierre cuando el comercial marca "Va a comprar".

Cambios:

1. Reutilizar flujo existente de operaciones si ya existe `OPERACION_CREADA`.
2. Si falta endpoint, crear `POST /api/operaciones/from-visit`.
3. Payload minimo:
   - `visitWorkItemId`,
   - `demandId`,
   - `propertyCode`,
   - `buyerPhone`,
   - `comercialId`.
4. Emitir `OPERACION_INICIADA` o `OPERACION_CREADA`.
5. Pausar nuevos microsites/cruces proactivos para esa demanda mientras exista operacion activa.

Criterios de aceptacion:

- Verde crea o vincula operacion.
- La demanda pasa a `EN_NEGOCIACION`.
- No se siguen enviando nuevas opciones automaticas al comprador salvo reapertura manual.

### Fase 7 — Rama amarilla: re-perfilado NLU

**Objetivo:** reiniciar el ciclo con contexto de visita fallida.

Cambios:

1. Crear handler para `DEMANDA_REPERFILADO_SOLICITADO`.
2. Encolar un job o envio WhatsApp al comprador con plantilla/mensaje de reactivacion.
3. Incluir contexto:
   - propiedad visitada,
   - motivo de rechazo si existe,
   - resumen NLU previo,
   - criterios actuales.
4. Cuando el comprador responda, `whatsapp-nlu-handler` debe tratarlo como continuacion contextual.
5. Si extrae variables:
   - emitir `DEMANDA_ACTUALIZADA`,
   - escribir criterios en Inmovilla,
   - generar nuevo microsite/seleccion.

Criterios de aceptacion:

- Amarillo envia o prepara mensaje NLU de re-perfilado.
- La siguiente respuesta del comprador no se interpreta como conversacion aislada.
- Nuevos criterios afectan el siguiente cruce.

### Fase 8 — Rama roja: baja local e Inmovilla

**Objetivo:** formalizar baja desde la decision post-visita.

Cambios:

1. Reutilizar `POST /api/demands/[codigo]/deactivate` o extraer su logica a `lib/demands/deactivate.ts`.
2. Desde `POST /api/visitas/[id]/decision` con `red`, llamar a ese servicio interno.
3. Registrar:
   - `DEMANDA_BAJA_SOLICITADA`,
   - `DEMANDA_ACTUALIZADA` con `leadStatus=PERDIDO`,
   - job `WRITE_TO_INMOVILLA(updateDemandStatus)` cuando hay datos.
4. Si falta `clientId` o `agentId`, dejar estado local `PERDIDO` pero registrar warning operativo.
5. Si se quiere cumplir estrictamente "baja pendiente Inmovilla", añadir campo o tabla de sync status.

Criterios de aceptacion:

- Rojo marca demanda `PERDIDO`.
- Se intenta baja en Inmovilla.
- Si no se puede sincronizar con Inmovilla, queda trazabilidad y reintento posible.

### Fase 9 — Primer contacto NLU para demanda nueva

**Objetivo:** hacer que la demanda nueva active conversacion NLU, no solo feedback posterior.

Cambios:

1. Identificar punto de ingesta de demandas (`DEMANDA_CREADA` / ingestion worker).
2. Crear handler que:
   - valide telefono,
   - resuelva comercial,
   - cree o actualice `WhatsAppBuyerSession`,
   - envie plantilla inicial aprobada por Meta.
3. Crear evento `NLU_CONTACTO_INICIADO` si se tipa.
4. Definir anti-spam:
   - no enviar si ya hay sesion reciente,
   - no enviar si demanda esta `PERDIDO` o `CERRADO`,
   - respetar opt-out.

Criterios de aceptacion:

- Demanda nueva con telefono valido dispara primer contacto NLU.
- No se duplica el primer mensaje.
- La sesion queda vinculada a `demandId`.

### Fase 10 — Calidad, tests y migracion

**Tests unitarios**

- `buildVisitInterestPackageFromRows()` con propietario interno.
- `buildVisitInterestPackageFromRows()` con agencia/anunciante externo.
- Creacion idempotente de `VisitWorkItem`.
- Decision verde/amarillo/rojo.

**Tests API**

- `GET /api/visitas?visitId=...`.
- `POST /api/visitas/[id]/schedule`.
- `POST /api/visitas/[id]/decision`.
- Permisos comercial vs CEO/Admin.

**Tests E2E**

1. NLU detecta `ME_INTERESA`.
2. Se crea `VisitWorkItem`.
3. Comercial abre `/platform/visitas?visitId=...`.
4. Agenda visita.
5. Marca amarillo.
6. Se dispara re-perfilado y nuevo microsite.

**Scripts cercanos a produccion**

- `scripts/test-visit-workitem-flow.ts`
- `scripts/test-post-visit-decision-flow.ts`

**UI mock**

La ruta `/platform/visitas?mock=1` o `/platform/visitas?uiMock=1` debe mostrar:

- visita incompleta sin telefono,
- visita pendiente de horario,
- visita agendada,
- visita lista para decision,
- decision verde/amarillo/rojo.

## Orden Recomendado de Trabajo

1. Modelo `VisitWorkItem` + helpers.
2. Integracion con `SELECCION_COMPRADOR`.
3. API nueva/fallback de visitas.
4. Refactor UI con query params y modo mock.
5. Agenda usando `visitId`.
6. Decision post-visita.
7. Rama amarilla NLU.
8. Rama verde Operaciones.
9. Rama roja baja Inmovilla.
10. Primer contacto NLU para demanda nueva.
11. Tests E2E y scripts live/dry-run.

## Riesgos y Decisiones Pendientes

| Tema | Riesgo | Decision necesaria |
| --- | --- | --- |
| Auto-validacion IA | Puede enviar propiedades sin criterio humano si se activa masivamente. | Mantener control por CEO/Admin y trazabilidad `source=auto_validation`. |
| Falta contacto propietario | Bloquea coordinacion real. | Definir si `INCOMPLETE` bloquea agenda o solo alerta. Recomendado: bloquear agenda hasta resolver telefono. |
| Rama amarilla | Puede generar loops infinitos. | Definir maximo de rondas o cadencia de enfriamiento. |
| Baja en Inmovilla | RPA puede fallar o faltar datos legacy. | Registrar estado de sync y reintentos. |
| Operaciones | Puede existir flujo parcial ya implementado. | Integrar con `OPERACION_CREADA` existente antes de crear endpoints nuevos. |
| Primer contacto NLU | WhatsApp proactivo requiere plantilla Meta. | Confirmar nombre de plantilla y variables antes de implementar. |

## Entregable Final Esperado

Al finalizar el refactor, el comercial debe poder operar asi:

1. Recibe WhatsApp: "tienes una visita por gestionar".
2. Abre `/platform/visitas?visitId=...`.
3. Ve a la izquierda sus visitas por programar.
4. Ve a la derecha comprador, propiedad, propietario/agencia y resumen NLU.
5. Llama al propietario/agencia, acuerda horario y lo registra.
6. Tras la visita, marca verde, amarillo o rojo.
7. El sistema ejecuta automaticamente Operaciones, re-perfilado NLU o baja.

La medida de exito es que el comercial deje de buscar manualmente nuevas propiedades tras cada visita fallida y solo intervenga donde aporta valor: coordinar, visitar, decidir y cerrar.
