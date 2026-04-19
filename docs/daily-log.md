# Daily Log — Urus Capital

Registro diario según rutina en `docs/plan.md`.

---

## 2025-03-15 (Viernes — Semana 11)

### Día de desarrollo

- Viernes (Día 5) — M6: Integración API REST Statefox + Tipos de Dominio + Refactoring
- Fuente: docs/plan.md

### Plan del día

- [M6] Implementar cliente API REST de Statefox: Bearer token, getProperties(filters), getSnapshot(cursor)
- [M6] Probar paginación y filtros: GET /properties, GET /snapshot, tipos Property/SnapshotProperty/Meta
- [M6] Crear tipos TypeScript para entidades del dominio: Property, Demand, Lead, Event, Job, Match, StatefoxProperty
- [M6] Refactoring del código de la semana: utilidades comunes, imports, tipado estricto
- [M6] Escribir tests unitarios para Event Store y Job Queue
- [M6] Preparar demo del sábado: secuencia y notas

### Bloqueantes

- Ninguno

### Completado

- **Tests unitarios Event Store y Job Queue (M6)**  
  - Event Store: 20 tests con mocks de Prisma; cobertura 100% en `event-store.ts`.  
  - Job Queue: 35 tests con mocks de Prisma; cobertura >97% en `job-queue.ts`.  
  - Rama: `test/M6-event-store-job-queue-unit-tests`.  
  - Commits:  
    - `c53b474` test(M6): añadir tests unitarios para Event Store con mocks de Prisma  
    - `172644b` test(M6): añadir tests unitarios para Job Queue con mocks de Prisma  
    - `f02ccc6` chore(deps): añadir @vitest/coverage-v8 para reportes de cobertura

### Notas

- Cobertura core cumple requisito >80% (event-store 100%, job-queue 97,95% branches).
- Suite total: 73 tests (55 unitarios nuevos + 18 integración existentes), todos pasan.
- Próximo: completar resto del Día 5 (Statefox client, tipos dominio, refactor, notas demo) o seguir en Día 6 (demo semanal).

## 2026-03-15 (Domingo - Semana 12)

### Dia de desarrollo

- Sábado (Dia 6) - DEMO WEEK 1
- Fuente: docs/plan.md

### Plan del dia

- Mergear PRs, actualizar CHANGELOG, crear tag v0.1.0-week-01
- DEMO: Event Store funcionando, Ingestion Worker leyendo propiedades de Inmovilla via API REST en vivo, Egestion Worker creando cliente de prueba vía API REST, lectura de Statefox API funcional
- Retrospectiva + documentar feedback
- Refactoring, deuda técnica, documentación
- Investigación para semana 2: LangGraph setup, WhatsApp Cloud API (Meta) docs

### Bloqueantes

- `gh` CLI no disponible en el entorno local; no se pudo automatizar consulta de PRs aprobadas ni creacion de issues remotas.

### Completado

- **Checklist pre-demo (sin bloque de demo en vivo)**
  - Build validado con `npm run build` (OK).
  - Test suite validada con `npm test` (166 tests OK).
  - `CHANGELOG.md` actualizado con resumen semanal (`v0.1.0-week-01`).
  - Tag semanal creado y publicado: `v0.1.0-week-01` apuntando a `origin/develop`.
  - Metricas compiladas: 71 commits en la semana y 7 merges de PR registrados en historial Git.
- **Cierre de PRs hacia develop (estado observable)**
  - Se verifico historial reciente con merges a `develop` ya aplicados (`#8`, `#9`, `#12`, `#13`, `#14`).
  - Se dejo trazabilidad del bloqueo operativo para continuar con merge/review automatizado al instalar `gh`.
- **Post-demo tecnico**
  - Feedback convertido a backlog priorizado para Semana 2 (ver seccion de notas).
  - Retrospectiva breve registrada con acciones correctivas.
  - Issues propuestas documentadas en `docs/issues-week-01-feedback.md`.
- **Tarde de ejecucion**
  - Documentacion de release y estado semanal consolidada.
  - Plan de investigacion de LangGraph y WhatsApp Cloud API (Meta) convertido en tareas ejecutables de Dia 7.

### Notas

#### Retrospectiva breve

- **Funciono bien:** pipeline E2E estable, cobertura de pruebas del core alta, build reproducible.
- **No funciono bien:** dependencia de herramientas externas (`gh`) para operativa de PRs/issues.
- **Accion correctiva:** instalar y autenticar `gh` antes del siguiente Demo Day para cerrar flujo de gobernanza completo.

#### Feedback convertido a backlog (priorizado)

- [P0] Definir bootstrap de LangGraph (estado, nodos, transiciones, persistencia en Neon).
- [P0] Implementar `POST /api/whatsapp/send` con **WhatsApp Cloud API (Meta)**: integración directa (sin BSP), token y Phone Number ID.
- [P1] Configurar Meta: Business Manager + WABA, token de acceso, webhook verify token, número registrado.
- [P1] Implementar webhook `POST /api/whatsapp/webhook` con verificación Meta y emisión de eventos `WHATSAPP_RECIBIDO`.
- [P1] Preparar plantillas de mensajes de matching/seguimiento para aprobación en Meta.
- [P2] Endurecer observabilidad de workers (logs estructurados + metricas por ciclo).

## 2026-03-16 (Lunes - Semana 12)

### Dia de desarrollo

- Lunes (Dia 7) - M4: WhatsApp Cloud API (Meta)
- Fuente: docs/plan.md

### Plan del dia

- [M4] Configurar **WhatsApp Cloud API (Meta)**: Meta Business Manager + WABA, token de acceso, Phone Number ID, webhook verify token. Sin BSP (Twilio/360dialog).
- [M4] Implementar servicio de envío: `sendWhatsAppMessage(to, template, variables)` contra API de Meta. API Route: `POST /api/whatsapp/send`.
- [M4] Implementar webhook de recepción: `POST /api/whatsapp/webhook`. Verificación de firma Meta, parsear mensajes entrantes, emitir eventos `WHATSAPP_RECIBIDO`.
- [M4] Crear plantillas en Meta: mensaje de match, seguimiento, validación. Someter a aprobación en Meta Business.
- [M4] **Tests (último ítem):** enviar mensaje de prueba vía Cloud API, recibir respuesta, verificar evento en Neon.
  - **Número de prueba:** +573113541077 (destino de plantillas y mensajes).
  - **Checklist:**
    1. Enviar plantilla o mensaje de prueba a +573113541077 (`POST /api/whatsapp/send` o `npm run whatsapp:test-m4`).
    2. Recibir respuesta: contestar desde el dispositivo +573113541077 para que Meta envíe el webhook a `POST /api/whatsapp/webhook`.
    3. Verificar evento en Neon: consultar eventos con `aggregateType = WHATSAPP_CONVERSATION` y `aggregateId = 573113541077`; debe existir al menos un evento `WHATSAPP_RECIBIDO` tras la respuesta.
  - **Criterio de aceptación:** ciclo WA completo verificado (envío → respuesta → evento en Neon).
- [M4] Daily log, push.

### Bloqueantes

- Ninguno / [descripcion]


### Completado

- [x] **[M5] Tests del flujo completo Smart Matching (Día 9, ítem 5)**  
  - Tests unitarios de scoring: `lib/matching/__tests__/scoring.test.ts` — 34 tests (zona, precio, tipología, metros, habitaciones, `computeMatchScore`).  
  - Tests E2E del pipeline: `lib/matching/__tests__/match-pipeline.test.ts` — 5 tests: match positivo/negativo, evento `MATCH_GENERADO` en event store, `DEMANDA_ACTUALIZADA` actualiza `demands_current` y cambia resultados del cruce, flujo completo propiedad → match → ajuste demanda → recruce.  
  - Ajuste en `matching-handler.ts`: fallback al payload del evento cuando la propiedad aún no está en `properties_current` (evita chicken-and-egg con la proyección).  
  - Tests E2E usan BD real (Neon), cleanup de eventos/proyecciones/snapshots; `ensureDemandSnapshot` para que el handler de `DEMANDA_ACTUALIZADA` no falle en egestion.  
  - Commit: `9bec510` test(M5): añadir tests flujo completo Smart Matching y fallback en matching-handler

### Notas

- Suite matching: 34 unitarios + 5 E2E (~2 min). Todos pasan.  
- El flujo E2E cubre: nueva propiedad → cruce → match → (simulado) ajuste de demanda → recruce con criterios actualizados.

<!-- Commits de hoy (copiar refs a Completado):
   b6b72a4 test(M4): añadir script test-whatsapp-m4 y comando npm whatsapp:test-m4
   5908e9b docs(daily-log): añadir último ítem de Test M4 con número +573113541077 y checklist
   8716ba7 docs(M4): documentar variables de entorno WhatsApp en .env.example
   efadf02 feat(M4): implementar webhook de recepción GET/POST /api/whatsapp/webhook
   f4b4bc8 feat(M4): añadir tipos, verificación de firma y parseo para webhook WhatsApp
   7ffb08a chore(M4): añadir enums WHATSAPP_RECIBIDO, WHATSAPP_ENVIADO y WHATSAPP_CONVERSATION en Prisma
   c281302 chore(M4): documentar variables de entorno de WhatsApp Cloud API en .env.example
-->

## 2026-03-18 (Miercoles - Semana 12)

### Dia de desarrollo

- Jueves (Dia 10) - Robustez de Workers + Micro-frontends
- Fuente: docs/plan.md

### Plan del dia

- [x] Robustez del Ingestion Worker: manejo de errores, reconexión automática, logging estructurado, métricas de ejecución.
- [x] Robustez del Egestion Worker: retry con backoff exponencial, dead-letter queue para fallos permanentes, alertas.
- [x] Implementar micro-frontend post-visita: formulario Next.js donde el comercial marca interés (alto/medio/bajo) + notas. Conectado a API Route → evento en Neon.
- [x] Implementar micro-frontend de agenda: selección de hora de visita, integración básica con Google Calendar API.
- [x] Conectar micro-frontends al flujo principal: visita → interés → scoring actualizado → consulta a Statefox API para stock de mercado + decisión de generar microsite. Implementar traductor demanda→filtros Statefox (lib/statefox/query-builder.ts).
- [x] Daily log, push.

### Bloqueantes

- Ninguno

### Completado

- [x] **[M1] Robustez Ingestion Worker** (`426034a`)
  - Logging estructurado por ciclo, métricas de ejecución, reconexión automática de DB.
- [x] **[M1] Robustez Egestion Worker — Dead-Letter Queue y alertas** (`f46214d`, `241f3b9`, `6f098c4`, `d25c90e`, `641d34b`, `e6f941f`)
  - Módulo de alertas WhatsApp/log para jobs en DLQ.
  - Utilidades DLQ: listar, stats, replay, purge.
  - `markFailed` con flag `permanent` y disparo automático de alerta.
  - Clasificación de errores egestion (permanent vs transient).
  - Endpoint API `/api/workers/dead-letter` para gestión operativa de la DLQ.
- [x] **[M0] Eventos `VISITA_EVALUADA` y `VISITA_AGENDADA` en schema Prisma** (`544f4fc`, `abb9585`)
- [x] **[deps] Shadcn UI inicializado + componentes** (Button, Card, RadioGroup, Textarea, Input, Label, Select) (`b23b0d6`)
- [x] **[M4] Micro-frontend post-visita** (`69771cb`, `085e8cd`)
  - API Route `POST /api/post-visit` → `appendEvent(VISITA_EVALUADA)`.
  - Página `app/post-visita/[demandId]/page.tsx` con RadioGroup interés + Textarea notas.
- [x] **[M4] Micro-frontend agenda** (`08fee21`, `b92ba37`, `a10d7ed`, `d506828`)
  - `lib/composio/create-calendar-event.ts` — integración Google Calendar via Composio (mismo patrón `OpenAIAgentsProvider` que 2FA).
  - API Route `POST /api/agenda` → crea evento Google Calendar + `appendEvent(VISITA_AGENDADA)`.
  - Página `app/agenda/[demandId]/page.tsx` con formulario de booking (fecha, hora, ubicación, notas).
  - Enlace al evento de Google Calendar en pantalla de éxito.
- [x] **[M0] JobType `GENERATE_MICROSITE` en schema Prisma** (`a49c5cf`)
- [x] **[M4] Query-builder Statefox** (`bfa40e5`)
  - `lib/statefox/query-builder.ts`: `mapTiposToHousing()` (Piso→flat, Ático→penthouse…), `parseLocationKeywords()`, `buildStatefoxQuery()`, `matchesStatefoxFilters()`, `filterStatefoxResults()`.
- [x] **[M4] Flujo principal conectado** (`01bfe17`, `b483ef8`)
  - Handler `VISITA_EVALUADA`: lee DemandCurrent → ajusta score (alto+20/medio 0/bajo-15) → consulta Statefox stock → decide `GENERATE_MICROSITE` (stock≥3 + interés alto).
  - `VISITA_AGENDADA` y `GENERATE_MICROSITE` registrados en consumer.

### Notas

- Rama: `feat/M4-micro-frontend-visita` (creada desde `feat/M1-worker-resilience`).
- Total de commits del día: 20 en rama activa.
- Google Calendar vía Composio requiere conexión activa en [app.composio.dev](https://app.composio.dev) (misma cuenta que Gmail 2FA, integración adicional `GOOGLECALENDAR`).
- El handler `GENERATE_MICROSITE` es placeholder; la implementación completa es tarea del Día 11 (M6).

<!-- Commits de hoy:
   b483ef8 feat(M4): conectar micro-frontends al flujo principal via handlers del consumer
   01bfe17 feat(M4): implementar handler VISITA_EVALUADA con scoring y consulta Statefox
   bfa40e5 feat(M4): implementar query-builder traductor demanda a filtros Statefox
   a49c5cf feat(M0): añadir JobType GENERATE_MICROSITE al event store
   d506828 docs(M4): documentar conexión Google Calendar en variables Composio
   a10d7ed feat(M4): implementar micro-frontend de agenda con formulario de booking
   b92ba37 feat(M4): implementar API Route /api/agenda para agendar visitas
   08fee21 feat(M4): implementar integración Google Calendar via Composio
   abb9585 feat(M0): añadir evento VISITA_AGENDADA al event store
   085e8cd feat(M4): implementar micro-frontend post-visita con formulario interés y notas
   69771cb feat(M4): implementar API Route post-visit para evaluación de visita
   b23b0d6 chore(deps): añadir Shadcn UI y componentes para formularios
   544f4fc feat(M0): añadir evento VISITA_EVALUADA al event store
   e6f941f docs(M1): documentar variable de alerta en .env.example
   641d34b feat(M1): endpoint API /api/workers/dead-letter para gestión DLQ
   d25c90e feat(M1): clasificar errores egestion (permanent vs transient) y propagar en consumer
   6f098c4 feat(M1): markFailed con flag permanent y alerta al pasar a DEAD_LETTER
   241f3b9 feat(M1): utilidades dead-letter queue (listar, stats, replay, purge)
   f46214d feat(M1): añadir módulo de alertas para dead-letter
   426034a feat(M1): robustez del Ingestion Worker - logging, errores, metricas y reconexion DB
-->
