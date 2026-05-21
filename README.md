# Sistema de Automatización — Urus Capital Group

> **Real Estate & Investments** · Automatización total con Inmovilla + Statefox

---

## Estado del repo (implementación completa)

El sistema de automatización de Urus está implementado end-to-end en este repositorio (M0–M14). A continuación se resumen componentes clave operativos:

- **Auth y Autorización**: Better Auth con Prisma adapter, 3 roles (`ceo`, `admin`, `comercial`), invitaciones por email (Resend), protección de rutas con `proxy.ts` (Next.js 16). Ver `docs/auth-autorizacion.md`.

- **Pipeline interno del lead (`LeadStatus`)**: el estado de cada demanda/lead a lo largo del pipeline comercial se gestiona en `DemandCurrent.leadStatus` (enum propio en Neon), **no en Inmovilla**. Los estados (`NUEVO` → `CONTACTADO` → `EN_SELECCION` → `VISITA_PENDIENTE` → `VISITA_CONFIRMADA` → `VISITA_REALIZADA` → `EN_NEGOCIACION` → `EN_FIRMA` → `CERRADO` / `PERDIDO`) se avanzan automáticamente desde los event handlers del consumer. Inmovilla mantiene `keysitu=20` (Buscando) como valor fijo; no se actualiza programáticamente. Ver `docs/lead-status-pipeline.md`.


- **Event Store (Neon/PostgreSQL)**: tabla `events` (Prisma `Event`) + API en `lib/event-store/` (`appendEvent`, `getEventsByAggregate`, `getEventsSince`) con tests en `lib/event-store/__tests__/`.
- **Job Queue (Neon/PostgreSQL)**: tabla `job_queue` (Prisma `JobQueue`) + API en `lib/job-queue/` (`enqueueJob`, `dequeueJob`, `markCompleted`, `markFailed`) con reintentos, idempotencia y tests de ciclo completo en `lib/job-queue/__tests__/`.
- **Ingestion Worker (M1)**: lectura de propiedades y demandas desde Inmovilla vía `lib/inmovilla/api/` (paginación, normalización). Cron/scripts: `ingestion:properties`, `ingestion:demands`. Documentación: `docs/workers/inmovilla-endpoints.md`.
- **Egestion Worker / escritura (M2)**: módulo `lib/inmovilla/write/` con `writeToInmovilla(operation, payload)` — operaciones tipadas (`createDemand`, `updateDemandEmail`, `updateDemandPriority`), parsing de respuestas legacy, verificación post-escritura y reintento por sesión expirada. Script: `egestion:write`.
- **Observabilidad persistente**: capa compartida en `lib/observability/` para API Routes y workers con logs estructurados, `requestId`/correlación y métricas persistidas en Neon (`observability_logs`, `execution_metrics`). Documentación: `docs/observabilidad-workers-api.md`.
- **Trazabilidad de conversaciones WhatsApp**: vista interna `/platform/conversaciones` para auditar conversaciones reales desde el Event Store (`WHATSAPP_CONVERSATION`) y trazas del Coach emocional (`MENTAL_CONVERSATION`). Documentación: `docs/trazabilidad-conversaciones.md`.
- **Visitas (M4)**: el interés del comprador genera una visita pre-creada para el comercial (propiedades, dirección, referencias y teléfonos disponibles). El comercial coordina con propietario/agencia y registra día/hora en `/platform/visitas`; Urus crea el evento de calendario, emite `VISITA_AGENDADA` y programa el Flow de parte de visita. Ver `docs/visitas-gestion-comercial.md`.

Documentación de decisiones:

- `docs/adr/001-event-sourcing-sobre-crud.md`
- `docs/adr/002-neon-como-job-queue.md`
- **Dashboard Comercial (métricas / KPIs)**: `docs/dashboard-comercial-metricas.md`
- **Dashboard Comercial (UI / rutas / hooks)**: `docs/dashboard-comercial-ui.md`
- **Pipeline interno del lead (LeadStatus)**: `docs/lead-status-pipeline.md` — estados del lead gestionados en Neon, no en Inmovilla.
- **Finanzas CEO (costes/EBITDA/cash derivados)**: gastos por WhatsApp + ingresos manuales + tesorería inicial para derivar KPIs financieros en `/platform/bi/financiero`, `/platform/bi/vision-ejecutiva` y `/platform/bi/reinversion`. Ver `docs/finanzas-ceo.md`.

Escenario de migración a API REST (contactos, propiedades, propietarios) documentado en `docs/plan.md` — estrategia de transición sin romper el flujo actual.

**Mensajería:** se usa **WhatsApp Cloud API (Meta)** en integración directa; no se utiliza BSP (Twilio, 360dialog, MessageBird).

- **Catálogos Inmovilla (enums vía REST)**: `key_loca`, `key_tipo`, `key_zona` se resuelven desde Neon; sincronización con `scripts/sync-inmovilla-enums.ts` (rate limit 2/min). Lectura: `lib/inmovilla/rest/catalogs.ts`. Ver `docs/catalogos-inmovilla.md`.

### Comandos útiles

- **Tests**: `npm test` (requiere `DATABASE_URL` configurada en el entorno).
- **Tests integración dashboards**: `npm run test:dashboards` — evento `OPERACION_CERRADA` → hechos → APIs (`/api/dashboard/*`, `/api/ceo/overview`, `/api/colaboradores/dashboard`) y smoke UI (`KpiCard` / `Semaforo` con datos de `getCeoOverview()`). Ver `docs/dashboard-integration-tests.md`.
- **Smoke live dashboards (Neon + proveedores opcionales)**: `npm run dashboards:live-check` — ejecuta las mismas queries analíticas que alimentan los dashboards y, si existen credenciales, llama a Inmovilla REST (`INMOVILLA_API_TOKEN`) y Statefox (`STATEFOX_BEARER_TOKEN`). Detalle en `docs/dashboard-integration-tests.md`.
- **Verificación live finanzas (Neon)**: `npm run finance:verify -- --period=YYYY-MM` — valida agregación mensual de gastos/ingresos/EBITDA/cash con la DB real. Ver `docs/finanzas-ceo.md`.
- **Backfill buckets de gastos (Neon)**: `npm run finance:backfill-buckets` — recalcula `Expense.bucket` y `Expense.costType` según categoría para registros existentes.
- **Generación de recurrentes (Neon)**: `npm run finance:generate-recurring -- --date=YYYY-MM-DD` — crea gastos recurrentes del día en estado esperado (idempotente por periodo).
- **Testeo cercano a producción (lógica):** además de la suite anterior, el proyecto usa **scripts** (`scripts/` y comandos `npm run …`) para ejecutar flujos de negocio e integración con la misma configuración que el runtime real en la medida de lo posible. Detalle y reglas en `AGENTS.md` y en `docs/plan.md` (*Estrategia de testeo*).
- **UI con datos mock:** las rutas con interfaz relevante deben soportar un **query parameter** documentado que active fixtures/mock y permita **previsualizar la UI** sin datos reales. Convención y obligaciones descritas en `AGENTS.md` y `docs/plan.md`.
- **Build**: `npm run build`
- **Inmovilla — login**: `npm run inmovilla:login` (requiere `INMOVILLA_USER`, `INMOVILLA_PASSWORD`, `INMOVILLA_OFFICE_KEY` y Composio/Gmail para 2FA). Ver setup y troubleshooting de Composio en `docs/composio-gmail-2fa.md`.
- **Composio — debug 2FA Inmovilla**: `npx tsx scripts/debug-inmovilla-2fa.ts` — valida la conexión Gmail anclada (`COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID`), lista cuentas conectadas y reproduce el flujo del extractor sin pasar por Playwright.
- **Composio — health check Gmail (cron)**: `POST /api/cron/composio-gmail-health` (auth `CRON_SECRET` o firma QStash). Recomendado 1×/día. Detalle en `docs/composio-gmail-2fa.md`.
- **Inmovilla — lectura propiedades**: `npm run inmovilla:read-properties`
- **Egestion — escritura en Inmovilla**: `npm run egestion:write -- <operation> [--headless] [--no-verify] [--json]` — operaciones: `createDemand`, `updateDemandEmail`, `updateDemandPriority` (ver variables/args en el script).
- **Ingestion — propiedades**: `npm run ingestion:properties`
- **Ingestion — demandas**: `npm run ingestion:demands`
- **Backfill propietarios de propiedades**: `npm run owners:backfill -- --dry-run --limit=50` para validar, y sin `--dry-run` para escribir `propietario*` en `properties_current`. Usa checkpoint en `kv_store`. Ver `docs/owners-sync.md`.
- **Consumer (procesador de eventos)**: `npm run consumer` — procesa jobs `PROCESS_EVENT` y encola proyecciones.
- **Proyecciones (worker)**: `npm run projections` — materializa estado actual en `properties_current` y `demands_current` desde la job queue (`UPDATE_PROPERTY_PROJECTION`, `UPDATE_DEMAND_PROJECTION`). Cron: `POST /api/cron/projections` (requiere `CRON_SECRET`).
- **Reevaluación de pricing (M7)**: cron `POST /api/cron/pricing-reevaluation` — escanea `properties_current` y encola `RUN_PRICING_ANALYSIS` para inmuebles sin leads prolongados o con visitas sin oferta (ver sección *Motor de Pricing*). Requiere `CRON_SECRET`; orquestación recomendada con Upstash QStash (p. ej. 1×/día).
- **M7+ — importar densidad demográfica (INE)**: `npm run pricing:import-demographics-ine -- --file=data/demographics/ine_density.csv` (admite `--dry-run`).
- **M7+ — sincronizar POIs de zona (Google Places)**: `npm run pricing:sync-zone-pois -- --city=Cordoba --limit=20` (admite `--dry-run`).
- **M7+ — construir índice de tiempos (Google Distance Matrix)**: `npm run pricing:build-travel-time-index -- --city=Cordoba --city-center=37.8882,-4.7794` (admite `--dry-run`).
- **Sincronizar catálogos Inmovilla (enums)**: `npm run inmovilla:sync-enums` (opción `--skip-zonas` para omitir zonas). Requiere `INMOVILLA_API_TOKEN` y `DATABASE_URL`.
- **Fotocasa — scraper base ventas**: `npm run scrape:fotocasa -- --city cordoba --operation sale` o `--city sevilla`. Respeta `robots.txt`, extrae listados visibles y escribe `data/fotocasa/sales.jsonl`, `sales.csv` y `discovery-report.json`. Ver `docs/fotocasa-scraper.md`.
- **Idealista — scraper base ventas**: `npm run scrape:idealista -- --city cordoba --operation sale` o `--city sevilla`. Usa validación estricta de `robots.txt`; si Idealista devuelve `403`, admite `--storage-state` para sesiones autorizadas y falla con diagnóstico claro. Ver `docs/idealista-scraper.md`.
- **Feedback loop NLU (test aislado)**: `npx tsx scripts/test-feedback-loop.ts` — valida `classifyBuyerFeedback` con propiedades mock y NLU real. Requiere `OPENAI_API_KEY`.
- **Feedback loop E2E (Vitest)**: `npm test -- feedback-loop-e2e` — test de integración determinista del pipeline completo (WA → eventos → jobs → proyección). Usa BD real + NLU stub.
- **Feedback loop live-RPA**: `npx tsx scripts/test-feedback-loop-live-rpa.ts` — pipeline completo con NLU real y escritura en Inmovilla (RPA). Requiere `FEEDBACK_LOOP_DEMAND_ID` y `FEEDBACK_LOOP_LIVE=true` para escritura real. Sin ese flag ejecuta dry-run. Ver `docs/microsite-feedback-loop.md`.
- **Primer contacto NLU demanda (dry-run)**: `npm run test:nlu-initial-contact:dry-run -- --demandId=DEM-XXXX` — valida sesion WhatsApp, plantilla y evento `NLU_CONTACTO_INICIADO` sin enviar WhatsApp real.
- **Primer contacto NLU demanda (manual UI)**: `/platform/demandas` → `Poner en contacto` por demanda — reutiliza la misma plantilla `NLU_DEMANDA_CONTACTO_INICIAL` y respeta los skips anti-duplicado (`recent_session`, `opt_out`, `missing_phone`, `terminal_status`).
- **Visita pre-creada (dry-run)**: `npm run test:visit-workitem:dry-run -- --demandId=DEM-XXXX [--propertyId=PROP-XXXX]` — valida `VisitWorkItem` y link `/platform/visitas?visitId=...`.
- **Decision post-visita (dry-run)**: `npm run test:post-visit-decision:dry-run -- --visitId=... --decision=yellow` — valida ramas verde/amarillo/rojo sin envios externos reales.
- **E2E NLU demanda → visita (Vitest dry-run)**: `npm test -- nlu-demand-to-visit-flow-e2e` — valida primer contacto NLU, work item y re-perfilado amarillo con mocks deterministas.
- **Firma live E2E (Neon + Cloudinary + WhatsApp + OTP real)**: `npm run firma:live-e2e -- --check-env` para validar prerequisitos y `npm run firma:live-e2e -- --confirm-live` para ejecutar el flujo completo con firma humana. Detalle en `docs/firma-live-e2e.md`.
- **WhatsApp — sincronizar plantillas WABA**: `npm run whatsapp:templates:sync` — descarga plantillas aprobadas/configuradas desde Meta y actualiza `whatsapp_templates` para renderizar texto real y variables en `/platform/conversaciones`. Requiere `WHATSAPP_ACCESS_TOKEN` con `whatsapp_business_management` y `WHATSAPP_BUSINESS_ID`.
- **WhatsApp — crear plantilla genérica en WABA**: `npm run whatsapp:template:create -- --name <nombre> --category <MARKETING|UTILITY|AUTHENTICATION> --body-text "..." [--language es_ES] [--body-example '["x"]']` o usando `--components-json '[...]'`. Script TS directo a Meta Graph API.
- **WhatsApp — consultar plantilla por nombre**: `npm run whatsapp:template:get-by-name -- --name <nombre> [--language es_ES]` — lista coincidencias desde WABA con payload completo.
- **WhatsApp — crear plantilla `follow_up_demanda` en WABA**: `npm run whatsapp:template:create:follow-up-demanda` — script TS que llama directo a Meta Graph API para solicitar la plantilla de seguimiento al comercial. Requiere `WHATSAPP_ACCESS_TOKEN` con `whatsapp_business_management` y `WHATSAPP_BUSINESS_ID`.
- **WhatsApp — crear plantilla `microsite_listo_comprador` en WABA**: `npm run whatsapp:template:create:microsite-listo-comprador` — mensaje inicial al comprador con el enlace al micrositio (2 variables: nombre, URL). Detalle del flujo en `docs/microsite-me-encaja-flow.md`.
- **WhatsApp — crear plantilla `microsite_propiedad_me_encaja` en WABA**: `npm run whatsapp:template:create:microsite-propiedad-me-encaja` — acuse al comprador tras pulsar "Me encaja" en una ficha (2 variables: nombre, título de la propiedad).
- **WhatsApp — sync periódico de plantillas (cron)**: `POST /api/cron/whatsapp-templates-sync` (auth `CRON_SECRET` o firma QStash) — ejecuta el mismo sync en modo automatizado. Frecuencia recomendada: 1 vez al día.
- **Statefox — cache propio de imágenes (Cloudinary + Bright Data opcional)**: `npm run statefox:images:test -- --portal-url <URL>` para validar discovery contra un anuncio real (dry-run) y `... --upload --statefox-id <ID>` para subir a Cloudinary. Las imágenes se persisten en `statefox_comparable_images` y la UI (pricing/microsites) las usa antes que las `pImages` de Statefox. Si `BRIGHTDATA_SCRAPING_BROWSER_URL` o las variables `BRIGHTDATA_RESIDENTIAL_PROXY_*` están definidas, el extractor usa Bright Data para mitigar bloqueos de Idealista. Para Idealista, con CDP configurada se usa Scraping Browser directo (`--cdp`); fallback híbrido warm session DataDome + residencial (`--warm`, `--invalidate`, `--no-warm`, `--no-cdp`) y navegación humana con `ghost-cursor`. Detalle en `docs/statefox-image-cache.md`.
- **Nota de Encargo — matching diferido**: `npm run nota-encargo:test-matching` simula una sesión creada por referencia URUS antes de existir la propiedad y valida que la ingesta la vincule después. Ver `docs/nota-encargo-matching-diferido.md`.
- **Post-venta (M9) — plantillas Meta + Flow + anuales**: la cadencia post-venta se envía 100% con plantillas Meta (`postventa_agradecimiento`, `postventa_resena`, `postventa_referidos`, `postventa_recaptacion`, `postventa_cumpleanos`, `postventa_navidad`, `postventa_formulario`). En D0 se envía un WhatsApp Flow (`postventa_survey`) que recoge nombre, fecha de nacimiento y email; con eso el sistema programa mensajes anuales indefinidos (cumpleaños 12:00 Europe/Madrid, Navidad 24-dic 12:00). Ver `docs/postventa-plantillas-whatsapp.md` (plantillas, Flow JSON, variables). Cron complementario: `POST /api/cron/postventa-rearm` (mensual, `CRON_SECRET`).
- **Bootstrap post-deploy**: `npm run bootstrap` — script idempotente para inicialización tras despliegue. Controlado por `BOOTSTRAP_ON_DEPLOY=true` y `BOOTSTRAP_MODE=safe|full`. Modo `safe`: seed CEO + check DB. Modo `full`: además sync catálogos Inmovilla y backfill operaciones. El `build` de Vercel solo ejecuta compilación (`next build`); las sincronizaciones pesadas nunca se ejecutan dentro del build.

### Despliegue en Vercel (estrategia DB)

La base de datos operativa es la **rama `develop` de Neon** (no `production`). Esto es intencional: la rama `production` de Neon contiene datos corruptos de testing mezclados con datos reales. Al desplegar en Vercel:

1. `DATABASE_URL` debe apuntar a la rama `develop` de Neon.
2. Tras el primer deploy, ejecutar `npm run bootstrap` manualmente o configurar como post-deploy hook.
3. Los cron endpoints (`/api/cron/*`) autenticados con `CRON_SECRET` mantienen la sincronización en tiempo real.
4. **Migración a `production` de Neon**: solo tras limpiar datos de testing en la rama production y verificar integridad.

**Contribuir:** ramas, commits, PRs y releases siguen la [Guía de contribución (CONTRIBUTING.md)](CONTRIBUTING.md).

## Tabla de Contenidos

1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Flujo de Vida en Producción](#flujo-de-vida-en-producción)
3. [Módulo 1 — Subida de Propiedad y Cruce Automático](#módulo-1--subida-de-propiedad-y-cruce-automático-de-demandas)
4. [Módulo 2 — Notificación Automática al Comprador](#módulo-2--notificación-automática-al-comprador)
5. [Módulo 3 — Respuesta del Comprador y Ajuste de Demanda](#módulo-3--respuesta-del-comprador-y-ajuste-automático-de-la-demanda)
6. [Módulo 4 — Visita y Afinado Humano](#módulo-4--visita-y-afinado-humano)
7. [Módulo 5 — Búsqueda de Stock Externo (Statefox API)](#módulo-5--búsqueda-de-stock-externo-statefox-api-rest)
8. [Módulo 6 — Microsite de Selección para el Comprador](#módulo-6--microsite-de-selección-para-el-comprador)
9. [Módulo 7 — Orquestación IA del Microsite](#módulo-7--orquestación-ia-del-microsite)
10. [Módulo 8 — Envío del Microsite y Feedback Loop](#módulo-8--envío-del-microsite-al-comprador-y-feedback-loop)
11. [Resultado Final del Sistema Base](#resultado-final-del-sistema-base)
12. [Diagrama de Flujo End-to-End](#diagrama-de-flujo-end-to-end)
13. [SOPs Internos](#sops-internos)
14. [Motor de Pricing y Posicionamiento](#motor-inteligente-de-pricing-y-posicionamiento-inmobiliario)
15. [Smart Closing — Contratos y Revisión por Voz](#smart-closing--contratos-autorrellenables-y-revisión-por-voz)
16. [Sistema de Gobierno del CEO](#sistema-de-gobierno-estratégico-del-ceo)
17. [Dashboard de Rentabilidad por Comercial](#dashboard-de-rentabilidad-por-comercial)
18. [Motor de Decisión y Priorización de Leads](#motor-de-decisión-para-la-gestión-y-priorización-de-leads)
19. [Control de Colaboradores Externos](#sistema-de-control-de-colaboradores-externos)
20. [Automatización Post-Venta](#automatización-post-venta)
21. [Soporte Mental y Alto Rendimiento](#sistema-de-soporte-mental-y-alto-rendimiento-para-comerciales)
22. [Stack Técnico Consolidado](#stack-técnico-consolidado)
23. [Conclusión Estratégica](#conclusión-estratégica)

---

## Visión General de la Arquitectura

### Orquestador Híbrido: Event Sourcing + API REST + RPA Legacy

El principio fundacional de esta arquitectura es la **Segregación de Responsabilidades**. Inmovilla dispone de una API REST v1 para clientes, propiedades y propietarios, pero no cubre demandas, estados operativos ni webhooks. Se relega a ser una **"Bóveda"** (repositorio pasivo de datos legales) mientras se construye un ecosistema moderno, asíncrono y orientado a eventos que lo envuelve: la API REST se usa donde existe, y RPA legacy donde no.

El sistema se compone de **cuatro capas principales** que interactúan en un flujo continuo.

---

### Capa 1 — La Bóveda (Inmovilla CRM)

Es la **fuente de verdad inamovible**. Su única función es almacenar los datos finales y legales:

- Propiedades activas
- Historiales de clientes (contactos)
- Facturas
- Demandas y cruces

**Ningún dato estructurado vive de forma definitiva fuera de Inmovilla** cuando existe cobertura en su API. Sin embargo, la API REST no expone gestión documental (adjuntar PDFs/DOCXs a propiedades, clientes ni propietarios), por lo que **los documentos legales (contratos, audit trails) se almacenan en Cloudinary/S3 con metadatos en Neon** — mismo patrón que colaboradores externos y microsites. Expone API REST v1 (`procesos.inmovilla.com/api/v1`) para clientes, propiedades y propietarios. No cubre demandas (que requieren polígonos geoespaciales), no mide tiempos y no dispara automatizaciones.

**El estado del pipeline (en qué fase está cada lead) vive exclusivamente en Neon** (`DemandCurrent.leadStatus`), no en Inmovilla. El campo `keysitu` de Inmovilla permanece fijo en `20` (Buscando) y solo lo modifican los agentes manualmente desde el CRM. Ver `docs/lead-status-pipeline.md`.

> **Nota terminológica:** En Inmovilla no existe una entidad "Lead". Lo que el sector llama "lead" se materializa como un **Contacto** (persona) + una **Demanda** (búsqueda activa con polígono geoespacial). Los contactos son accesibles vía API REST; las demandas solo vía RPA legacy.

---

### Capa 2 — Workers de Integración (API REST + RPA Legacy)

Se construye una red de **workers server-side** que conectan con Inmovilla y Statefox por dos vías según la cobertura de cada API.

**Vía API REST** (clientes, propiedades, propietarios en Inmovilla; propiedades de mercado en Statefox):
- Cliente HTTP autenticado con token estático (`Token: ...` para Inmovilla, `Bearer` para Statefox).
- CRUD directo, respuestas JSON tipadas, sin necesidad de Playwright ni sesiones.
- Rate limits Inmovilla: 10 propiedades/min, 20 clientes/min, 20 propietarios/min.

**Vía RPA Legacy** (creación/actualización de demandas y polígonos geoespaciales en Inmovilla):
- Login silente con Playwright → código 2FA vía **Composio + Gmail** → captura cookies de sesión → token CSRF → XHR clonado a `guardar.php`.
- Necesario porque la API REST no cubre demandas (que requieren polígonos geoespaciales dibujados en mapa).
- **Nota:** los cambios de estado del pipeline **no** se envían a Inmovilla vía RPA. El estado del lead se gestiona en `DemandCurrent.leadStatus` (Neon). Solo se escriben en Inmovilla los criterios de la demanda (precio, zona, habitaciones, tipos) cuando el NLU los actualiza.

#### Ingestion Worker (Lectura)

- **Orquestación de cron-jobs**: todos los cron-jobs del sistema se disparan con **Upstash QStash**.
- **Polling programático**: consultas regulares a los endpoints de lectura disponibles.
- **Scraping headless**: cuando no existe endpoint, un navegador headless (Playwright) extrae datos del DOM.

Cron-job en Node.js orquestado con **Upstash QStash**:

- **API REST Inmovilla**: `GET /propiedades/?listado` para detectar cambios por `fechaact`, `GET /propiedades/?cod_ofer` para datos completos.
- **Polling legacy**: lectura de demandas activas (no cubiertas por REST).
- **API REST Statefox**: `GET /properties` y `GET /snapshot` para datos de mercado (solo lectura).

Su trabajo: detectar cambios y **emitir eventos** inmutables hacia la Capa 3.

#### Egestion Worker (Escritura)

- **API REST**: para clientes/propiedades/propietarios (`POST/PUT/DELETE` directo).
- **RPA Legacy**: para demandas y estados (login silente con Composio 2FA → CSRF → XHR clonado).

Las demandas creadas programáticamente requieren **polígonos geoespaciales válidos** (módulo `lib/geo/`). Sin polígono, la demanda es inútil para cruce automático.

---

### Capa 3 — Plano de Control y Orquestación IA (El Cerebro)

Aquí reside la verdadera propiedad intelectual y la lógica de negocio. Es un entorno moderno, escalable y 100% bajo nuestro control.

| Componente | Tecnología | Función |
|---|---|---|
| **Framework** | Next.js (App Router) + TypeScript | API Routes, SSR, micro-frontends |
| **Base de datos** | Neon (PostgreSQL serverless) | Event Sourcing, Job Queue, estado transaccional |
| **Motor IA** | LangGraph + modelos o3 | Flujos agénticos, razonamiento profundo |
| **Cola de trabajo** | Neon (tabla `job_queue`) | Reintentos, idempotencia, resiliencia |

#### Event Sourcing

En lugar de guardar fotos estáticas del estado, se registra **cada evento inmutable**:

- `CONTACTO_INGESTADO`
- `SLA_INICIADO`
- `DEMANDA_ACTUALIZADA`
- `PREAPROBACION_SUBIDA`
- `CONTRATO_GENERADO`

Si Inmovilla se cae, las órdenes de escritura se acumulan en la **Job Queue** de Neon y se reintentan automáticamente sin perder un solo dato.

#### Motor de Inteligencia (LangGraph)

Se orquestan flujos agénticos avanzados donde modelos de razonamiento profundo ejecutan el trabajo:

- Interpretan respuestas de WhatsApp para afinar demandas (**Smart Matching**).
- Procesan audios de los gestores (Speech-to-Text) para mutar cláusulas (**Smart Closing**).
- Calculan el **Score** de rentabilidad y urgencia de cada nuevo lead.
- Generan recomendaciones de pricing basadas en análisis de mercado.

---

### Capa 4 — Interfaces Satélite y Omnicanalidad (Las Ventanillas)

Para evitar que clientes, colaboradores externos o comerciales peleen con la interfaz del CRM, el Orquestador genera **ventanillas de interacción efímeras y sin fricción**.

| Canal | Implementación |
|---|---|
| **WhatsApp** | **WhatsApp Cloud API (Meta)** — integración directa con la API de Meta, sin BSP (Twilio/360dialog/MessageBird). Precalificación de compradores, seguimiento post-venta y notificaciones de matches |
| **Micro-Frontends** | Rutas dinámicas en Next.js para flujos propios que Inmovilla no modela bien, como gestión interna de hitos de colaboradores, subida documental y validaciones rápidas del equipo |
| **Notificaciones internas** | Webhooks propios hacia Slack/WhatsApp del equipo |

Una vez que el usuario interactúa con la interfaz ligera, la información viaja a la **Capa 3** para ser procesada y, finalmente, escrita en Inmovilla por la **Capa 2** cuando sea necesario persistir el resultado final en el CRM.

Esto es especialmente importante en el flujo de colaboradores: Inmovilla no modela hitos operativos de bancos, abogados ni tasadores (no hay entidad colaborador en su modelo). Ese flujo vive 100% en Neon como fuente operativa y se gestiona desde el **dashboard interno** por el Comercial o el CEO — los colaboradores externos no acceden directamente al sistema. No hay datos de colaboradores que reconciliar desde Inmovilla.

---

## Flujo de Vida en Producción

Ejemplo 100% automatizado, de principio a fin:

1. **Ingestión**: Entra un contacto de Idealista. El `Ingestion Worker` lo detecta vía API REST (`GET /propiedades/?leads`) o por polling legacy de demandas.
2. **Orquestación**: La Capa 3 lo recibe. LangGraph evalúa el texto, extrae que busca un piso de 350k€ y le asigna un **Score de 85/100**. Neon inicia un **SLA de 5 minutos**.
3. **Interacción**: El sistema enruta al mejor comercial y le avisa por **WhatsApp Business API**.
4. **Egestión**: El `Egestion Worker` persiste el contacto perfilado en Inmovilla vía API REST (`POST /clientes/`) y crea/actualiza la demanda vía RPA legacy (con polígono geoespacial).

Todo ocurre en el servidor, sin intervención humana. El SLA mide desde el evento `CONTACTO_INGESTADO` en Neon hasta la notificación WhatsApp al comercial.

---

## Módulo 1 — Subida de Propiedad y Cruce Automático de Demandas

### Alta de inmueble en Inmovilla

El agente introduce:

- Datos completos del propietario (nombre, DNI, contacto)
- Autorizaciones
- Variables duras del inmueble:
  - Precio
  - Zona
  - Metros
  - Tipología
  - Estado
  - Extras

### Automatización: Cruce inmediato

El `Ingestion Worker` detecta la nueva alta mediante polling. La Capa 3 ejecuta el cruce contra **todas las demandas activas** almacenadas en Neon:

- Se generan **matches reales**, no sugerencias.
- LangGraph aplica un scoring semántico que pondera zona, precio, tipología y preferencias históricas del comprador.
- Los resultados se persisten como eventos (`MATCH_GENERADO`) y se propagan a los módulos siguientes.

---

## Módulo 2 — Notificación Automática al Comprador

A cada comprador compatible se le envía automáticamente un mensaje vía **WhatsApp Business API** (integración directa por código, sin intermediarios no-code):

> "Hola [Nombre], somos **U Capital Group**.
> Hace tiempo trabajaste con nosotros y hemos captado una nueva propiedad que encaja con lo que buscabas.
>
> Ver inmueble: [enlace ficha]
>
> ¿Te encaja?
> 1. Me encaja
> 2. No me encaja
> 3. Busco algo diferente"

El agente **no interviene**. El mensaje se genera con plantillas aprobadas y se envía desde una API Route de Next.js que conecta directamente con **WhatsApp Cloud API (Meta)** — sin intermediarios BSP.

---

## Módulo 3 — Respuesta del Comprador y Ajuste Automático de la Demanda

### La clave del sistema: Smart Matching

El webhook de WhatsApp Business API entrega la respuesta del comprador a una API Route de Next.js. LangGraph interpreta respuestas de texto libre como:

- "No me cuadra, es caro"
- "Quiero otra zona"
- "Más metros"
- "Con terraza"
- "Subo presupuesto"

### Acción directa en Inmovilla (vía Egestion Worker)

Automáticamente:

1. LangGraph extrae las variables modificadas (precio, zona, características).
2. Se emite un evento `DEMANDA_ACTUALIZADA` en Neon.
3. El `Egestion Worker` escribe los **criterios** de la demanda en Inmovilla mediante network interception (login silente → CSRF → XHR clonado).
4. Se guarda histórico del cambio como evento inmutable.
5. La demanda queda **más afinada**.

El CRM aprende. El comercial no reescribe nada.

> **Sobre el estado del lead:** el avance por las etapas del pipeline (`CONTACTADO`, `EN_SELECCION`, `VISITA_PENDIENTE`, etc.) **no se refleja en Inmovilla** (`keysitu` permanece fijo). El estado del pipeline vive en `DemandCurrent.leadStatus` en Neon y se actualiza automáticamente desde los event handlers del consumer. Ver `docs/lead-status-pipeline.md`.

---

## Módulo 4 — Visita y Afinado Humano

Aquí entra el agente, pero con rol **limitado y claro**.

### El agente SOLO hace:

- Marcar:
  - Visitado
  - Nivel de interés (alto / medio / bajo)
- Ajustar manualmente 1–2 variables estratégicas si el cliente lo verbaliza.
- Nota cualitativa breve (máx. 2 líneas).

**Nada más.** Todo lo demás ya está automatizado. Los datos del agente se recogen mediante un micro-frontend en Next.js (formulario rápido post-visita) que alimenta la Capa 3 directamente.

El endpoint `POST /api/post-visit` emite `VISITA_EVALUADA` sobre la demanda. Para que el **cron de reevaluación de pricing** pueda contar visitas por inmueble, el cuerpo puede incluir **`propertyCode`** (opcional, código de oferta / ficha en Inmovilla); si no se envía, el trigger “visitas sin ofertas” no atribuye visitas a una propiedad concreta.

---

## Módulo 5 — Búsqueda de Stock Externo (Statefox API REST)

Cuando una demanda cumple las condiciones:

- Está activa
- Está perfilada (variables afinadas con polígono geoespacial definido)
- Ha mostrado interés real (visita completada o score alto)

El sistema consulta el mercado externo:

1. La Capa 3 emite un evento `BUSQUEDA_MERCADO_INICIADA`.
2. Se consulta la **API REST de Statefox** (`GET /properties`) traduciendo los criterios de la demanda a filtros Statefox: zona (`pCity`/`pZone`), tipología (`pHousing`), rango de precio (`pPrice`), metros (`pMeters`).
3. Se filtran y seleccionan las propiedades más relevantes del mercado (particulares + agencias + stock de portales).

> **Nota:** Statefox es una API de **solo lectura**. No se sincronizan demandas a Statefox, no se generan búsquedas ni enlaces en su plataforma. Los datos se consumen directamente por API REST con Bearer token.

---

## Módulo 6 — Microsite de Selección para el Comprador

Con las propiedades relevantes del mercado (de Statefox API), el sistema genera un **microsite propio** (micro-frontend Next.js con branding Urus Capital):

- Página con token único: `/seleccion/{token}`
- **Vista demo (mocks):** en desarrollo, abre `/seleccion/demo` para ver fichas de ejemplo sin Neon ni Statefox. En producción, opcionalmente `NEXT_PUBLIC_MICROSITE_MOCK=true` (ver `.env.example`).
- Fichas completas con imágenes, descripción, precio, metros, zona, extras, certificado energético, mapa
- Página de detalle de propiedad con carrusel, ficha técnica y navegación entre propiedades
- Feedback del comprador exclusivamente vía WhatsApp (NLU contextual con LangGraph)
- Tracking de qué se mostró, a quién, cuándo (persistido en Neon)

> Este microsite reemplaza completamente la dependencia de enlaces privados de Statefox, que no ofrece esta funcionalidad vía API.

---

## Módulo 7 — Orquestación IA del Microsite

Flujo canónico actual:

1. `GENERATE_MICROSITE` crea la selección y ejecuta aprobación automática por IA.
2. La IA mejora descripciones, aplica reglas de rebranding y marca la selección como `APPROVED`.
3. Se emite `SELECCION_VALIDADA` y se encola `SEND_MICROSITE_TO_BUYER`.
4. El comprador recibe por WhatsApp el enlace público **`/seleccion/{token}`**.

**Contexto histórico encapsulado:** existió una etapa de validación manual por comercial (`/validar-seleccion/*` + SLA de 2h), hoy retirada del runtime canónico.

Variables clave: `NEXT_PUBLIC_APP_URL` (enlaces absolutos en WhatsApp) — ver `.env.example`.

---

## Módulo 8 — Envío del Microsite al Comprador y Feedback Loop

El sistema envía el enlace del microsite propio al comprador vía WhatsApp Business API para que:

- Explore el **portal de selección** (listado + ficha detalle en el propio dominio).
- Comunique interés, descartes o nuevos criterios **respondiendo por WhatsApp** (único canal de feedback; no hay botones de valoración en la web pública).

### Feedback Loop (Sistema Vivo)

El feedback del comprador llega por el **webhook de WhatsApp** (`WHATSAPP_RECIBIDO`). La Capa 3 resuelve demanda y microsite activo (`WhatsAppBuyerSession`, contexto de respuesta) y ejecuta **NLU contextual LangGraph** (`classifyBuyerFeedback`): propiedades mostradas + historial conversacional → salida estructurada (intención, `propertyFeedback[]`, variables, `wantsMoreOptions`).

1. Eventos `SELECCION_COMPRADOR` por propiedad (persistencia de feedback) y, si aplica, `DEMANDA_ACTUALIZADA` con variables extraídas.
2. Proyección y **Egestion Worker** escriben la demanda en Inmovilla vía RPA legacy (polígono/criterios).
3. Nueva consulta a Statefox con criterios ajustados → job `GENERATE_MICROSITE` para regenerar el microsite; si el comprador pide más opciones, también se puede disparar la regeneración según reglas del handler.

Documentación ampliada: `docs/microsite-feedback-loop.md`.

### Suite de evaluación NLU (AI-to-AI)

Para regresión y KPIs del NLU de comprador sin depender de pruebas manuales sesgadas: agente comprador sintético, juez híbrido (reglas + LLM), escenarios por categoría, persistencia en Neon (`EvalRun` / `EvalResult`) y dashboard en `/eval`. Ejecución: `npm run eval:nlu`. Detalle: `docs/nlu-eval-suite.md`.

---

## Resultado Final del Sistema Base

### Ahorro de tiempo real

| Métrica | Mejora estimada |
|---|---|
| Gestión manual | –60/70% |
| Mensajes repetitivos | –80% |
| Visitas inútiles | –50% |

### Inteligencia comercial acumulativa

- Demandas cada vez más precisas.
- Menos desgaste del equipo.
- Mayor ratio visita → oferta → cierre.

### Nuevo rol del comercial

| Antes | Después |
|---|---|
| Teclear, perseguir y filtrar | Validar, decidir y cerrar |

---

## Diagrama de Flujo End-to-End

```mermaid
flowchart TD
    A[Alta de Propiedad en Inmovilla] --> B[Ingestion Worker detecta alta por polling]
    B --> C[Capa 3: Cruce automático contra demandas en Neon]
    C -->|Match| D[WhatsApp Business API: mensaje al comprador]
    C -->|Sin match| E[Propiedad en stock + difusión portales]

    D --> F{Respuesta del comprador vía webhook}
    F -->|Me encaja| G[Precalificación rápida + propuesta de visita]
    F -->|No me encaja| H[LangGraph extrae motivo: precio/zona/metros/extras]
    F -->|Busco diferente| I[LangGraph captura nuevas preferencias]

    H --> J[Egestion Worker actualiza demanda en Inmovilla]
    I --> J
    J --> K[Recruce automático en Capa 3]
    K -->|Nuevo match| D
    K -->|Sin match| L[Demanda activa y afinada]

    G --> M[Agenda visita vía micro-frontend]
    M --> N[Visita realizada]
    N --> O[Post-visita: agente marca interés + ajustes]
    O --> P{¿Interés real?}
    P -->|No| J
    P -->|Sí| Q[Capa 3: consulta Statefox API con criterios de demanda]

    Q --> R[Statefox API: propiedades de mercado filtradas]
    R --> S[Generar microsite propio Next.js con selección]
    S --> T[Notificación al comercial vía WhatsApp/micro-frontend]
    T --> U{Validación comercial 30-60s}
    U -->|Aprobado| V[WhatsApp Business API: envío enlace microsite al comprador]
    U -->|Ajustes| W[Ajuste rápido + aprobar]
    W --> V

    V --> X{Selección del comprador}
    X -->|Elige inmuebles| Y[Pipeline: contactar / agendar visitas]
    X -->|No le encaja| Z[Feedback → LangGraph → actualiza demanda]
    Z --> J

    Y --> AA[Visitas a inmuebles seleccionados]
    AA --> AB{¿Oferta / cierre?}
    AB -->|Oferta| AC[Negociación + Smart Closing]
    AB -->|No| J
    AC --> AD[Cierre + post-venta automatizada]
```

---

## SOPs Internos

### Roles del sistema

| Código | Rol | Descripción |
|---|---|---|
| **AP** | Agente de Propiedades / Captación | Alta y calidad de fichas |
| **AD** | Agente de Demandas / Comercial | Validación, visitas y cierres |
| **BO** | Backoffice / Coordinación | Documentación y formalización |
| **SYS** | Sistema (automatizaciones) | Workers + Capa 3 + Capa 4 |

---

### SOP 1 — Alta de Propiedad (AP)

**Objetivo:** cargar bien una vez para que el sistema haga el resto.

1. En Inmovilla, crear ficha de inmueble con:
   - Propietario completo (DNI, contacto, autorización, cuenta para señal si aplica).
   - Características (precio, zona, metros, extras, estado).
   - Material (fotos, notas, llaves, disponibilidad).
2. Publicar anuncio (Idealista u otros) desde Inmovilla si procede.
3. **Checklist de calidad** (obligatorio):
   - [ ] Precio correcto
   - [ ] Dirección/zona correcta
   - [ ] Tipología correcta
   - [ ] Extras bien marcados (terraza, ascensor, parking...)

Al guardar, el `Ingestion Worker` detecta el alta y la Capa 3 dispara el cruce + mensajes.

---

### SOP 2 — Gestión Automática de Match y Mensajes (SYS)

**Objetivo:** notificar sin intervención humana.

1. Si la Capa 3 detecta match:
   - Envía WhatsApp al comprador con enlace y 3 respuestas guiadas (vía WhatsApp Business API).
2. Registra en Neon:
   - Fecha/hora del envío.
   - Propiedad enviada.
   - Estado `PENDIENTE_RESPUESTA`.

---

### SOP 3 — Respuesta del Comprador y Perfilado Automático (SYS + AD)

**Objetivo:** que el sistema aprenda y el AD solo supervise.

- **SYS (automático):**
  - Interpreta respuesta con LangGraph.
  - Si cambia preferencias → actualiza demanda en Inmovilla (vía `Egestion Worker`).
- **AD (solo cuando el sistema marque "ambigua"):**
  - 1 llamada o 3 preguntas por WhatsApp (máx. 2 min).
  - Ajusta 1–2 variables si el comprador lo deja claro.

---

### SOP 4 — Visita a Propiedad (AD)

**Objetivo:** convertir "me encaja" en visita con mínimo trabajo.

1. Si el comprador responde "Me encaja":
   - Enviar link de agenda (micro-frontend Next.js con integración calendario) o 2 opciones de hora.
   - Confirmar y registrar la cita (evento `VISITA_AGENDADA` en Neon, sincronizado con Inmovilla).
2. Tras la visita (máximo 3 minutos):
   - Marcar interés (alto/medio/bajo) en el micro-frontend post-visita.
   - 1–2 notas cualitativas.
   - Si hay cambios de criterio → el sistema actualiza demanda.

---

### SOP 5 — Búsqueda de Mercado + Microsite (AD + SYS)

**Disparador:** demanda con interés real o visita hecha + búsqueda activa.

1. **SYS:** consulta Statefox API REST (`GET /properties`) con filtros traducidos desde la demanda (zona, precio, tipología, metros).
2. **SYS:** genera microsite propio (Next.js) con las propiedades relevantes del mercado.
3. **AD** (validación 30–60s):
   - Revisa la selección de propiedades.
   - Oculta/ajusta fichas si hace falta.
   - Aprueba.
4. **SYS:** envía enlace del microsite al comprador vía WhatsApp, registra `MICROSITE_ENVIADO`.

---

### SOP 6 — Selección del Comprador (SYS + AD)

- **SYS:**
  - Recoge selección (clics/guardados/descartes) vía eventos del microsite propio (persistidos en Neon).
  - Si el NLU detecta cambios de criterios (precio, zona, habitaciones), actualiza la demanda en Inmovilla vía RPA legacy.
  - Avanza `DemandCurrent.leadStatus` automáticamente según las decisiones del comprador (→ `EN_SELECCION`, → `VISITA_PENDIENTE`). El estado de pipeline **no** se escribe en Inmovilla.
- **AD** solo actúa si:
  - "Elige inmuebles" → agenda visitas.
  - "Pide cambios" → valida 1 ajuste si es necesario.

---

### SOP 7 — Oferta, Arras y Cierre (BO + AD)

**Objetivo:** documentación semi-automática con plantillas + Smart Closing.

1. **SYS** genera contrato desde plantillas con campos rellenados automáticamente (datos extraídos de Neon + Inmovilla).
2. **BO** revisa y ajusta con revisión por voz (ver módulo Smart Closing).
3. **AD** negocia y cierra.
4. **BO** formaliza y archiva.

---

## Stack Técnico del Sistema Base

### Orquestación y Backend

| Componente | Tecnología | Detalles |
|---|---|---|
| Framework principal | **Next.js (App Router) + TypeScript** | API Routes como orquestador central |
| ORM | **Prisma** | Schema-first, migraciones, tipos generados |
| Workers (Ingestion/Egestion) | **Node.js + Playwright (solo legacy)** | API REST para clientes/propiedades; RPA legacy solo para demandas/estados |
| Scheduler de cron-jobs | **Upstash QStash** | Disparo y orquestación de todos los cron-jobs del sistema |
| Base de datos | **Neon (PostgreSQL serverless)** | Event store, job queue, estado transaccional |
| Motor IA | **LangGraph + modelos o3** | Flujos agénticos: scoring, clasificación, recomendaciones |
| API REST Inmovilla | **`procesos.inmovilla.com/api/v1`** | CRUD de clientes, propiedades, propietarios. Token estático. No cubre demandas. |
| API REST Statefox | **`statefox.com/public/aapi/props`** | Propiedades de mercado y snapshots. Solo lectura, Bearer token. |

### Canal de Mensajería (WhatsApp)

| Requisito | Implementación |
|---|---|
| Proveedor | **WhatsApp Cloud API (Meta)** — integración directa, sin BSP. Cuenta Meta Business Manager + WABA. |
| Plantillas aprobadas | Para primer contacto (obligatorio por política de Meta) |
| Mensajes interactivos | Botones de respuesta rápida (1/2/3) |
| Webhooks de entrada | Captura de respuestas → API Route en Next.js |

### Interpretación de Texto (NLU)

| Caso | Implementación |
|---|---|
| Clasificación de intención | **LangGraph** con modelos o3 |
| Extracción de variables | Zona, precio, metros, extras → campos estructurados |
| Fallback por baja confianza | Tarea al agente: "respuesta ambigua" |
| **Feedback comprador (microsite)** | **NLU contextual** (`classifyBuyerFeedback`): mensaje WhatsApp + fichas del microsite activo + historial → `SELECCION_COMPRADOR`, `DEMANDA_ACTUALIZADA`, regeneración de microsite |
| **Calidad / regresión NLU** | Suite **AI-to-AI** (escenarios, juez, DB, `/eval`); ver `docs/nlu-eval-suite.md` |

### Calendario / Agenda

| Componente | Implementación |
|---|---|
| Booking | Micro-frontend Next.js con integración Google Calendar API |
| Confirmación | Automática vía WhatsApp Business API |
| Registro en CRM | `Egestion Worker` escribe cita en Inmovilla |

### Autenticación Inmovilla

| Componente | Implementación |
|---|---|
| API REST (clientes, propiedades, propietarios) | Token estático en header `Token: ...`. Generado en Ajustes > Opciones > Token para API Rest. **Sin login, sin 2FA, sin cookies, sin Playwright.** |
| RPA Legacy (demandas, estados) | Login en dos pasos: POST a `comprueba.php` (credenciales) + POST a `login2Fa/verifyCode` (código 2FA). Ver `docs/workers/inmovilla-endpoints.md`. |
| Código 2FA (solo legacy) | **Composio**: conexión Gmail (OAuth), búsqueda de correos de Inmovilla, extracción del código de 6 dígitos, envío al endpoint de verificación. Solo necesario para operaciones de demandas y estados. |

### Documentación y Plantillas

| Componente | Implementación |
|---|---|
| Motor de plantillas | Generación programática en TypeScript (docx/PDF) con variables y bloques condicionales |
| Almacenamiento | Cloudinary o sistema de archivos del servidor |
| Versionado | Naming estándar: `OP-2026-XXXX_Arras_v1.pdf` |

### Tracking y Observabilidad

| Componente | Implementación |
|---|---|
| Dashboard | Micro-frontend Next.js con datos de Neon |
| Alertas | Cron-jobs que evalúan SLAs y emiten notificaciones vía WhatsApp/Slack |
| Métricas | Tablas de Neon con queries analíticas y métricas operativas persistentes (`ingestion_cycle_metrics`, `execution_metrics`) |
| Logging | Logs estructurados y persistentes en Neon (`observability_logs`) para API Routes y workers |

---

## Motor Inteligente de Pricing y Posicionamiento Inmobiliario

> Bot estratégico de comparación automática de mercado y recomendación comercial.

### Principio

- **Inmovilla** ordena y decide.
- **Statefox** observa el mercado y compara.
- **El sistema recomienda, el comercial decide.**

### Objetivo

Cuando se sube o modifica un inmueble en Inmovilla, el sistema:

1. Detecta el cambio vía `Ingestion Worker` (API REST `GET /propiedades/?listado`).
2. Consulta la **API REST de Statefox** (`GET /snapshot`) filtrando en memoria por zona (`pCity`/`pZone`), tipología (`pHousing`), rango de precio y metros para obtener comparables del mercado.
3. Analiza el mercado real (particulares vs profesionales, segmentando por `pAdvert.type`).
4. Compara precio (`pPricePerMeter` ya calculado por Statefox), calidades, posicionamiento y visibilidad.
5. Devuelve al comercial un **diagnóstico claro**.

> No es una tasación. Es **inteligencia comercial en tiempo real**.

### Disparadores (Triggers)

**Reactivos (ingestión + cola)**  
El `Ingestion Worker` detecta cambios en Inmovilla y la Capa 3 materializa eventos en Neon; el consumer encola `RUN_PRICING_ANALYSIS` cuando aplica:

| Origen | Descripción |
|---|---|
| Alta de inmueble | Tras `PROPIEDAD_CREADA` (cruce de demandas + análisis de pricing). |
| Cambio de precio, metros, habitaciones o baños | Tras `PROPIEDAD_MODIFICADA` cuando el diff de ingesta incluye alguno de esos campos (otros cambios de ficha no encolan pricing por sí solos). |

**Proactivos (cron de reevaluación)**  
Además, un **cron-job** evalúa el stock ya proyectado en Neon sin esperar un nuevo diff de Inmovilla:

| Condición | Fuentes de datos (schema Prisma) | Comportamiento implementado |
|---|---|---|
| Inmueble sin leads X días | Tabla `properties_current` (edad vía `fechaAlta` o `createdAt`) + tabla `events` con `type = MATCH_GENERADO` y `aggregateId` terminado en `:{codigo}` (demanda:propiedad) | Si no hay ningún match y la ficha lleva al menos **14 días** (constante en `lib/pricing/reevaluation-scanner.ts`), se encola reevaluación. |
| Inmueble con visitas sin ofertas | `events` con `type = VISITA_EVALUADA` y `payload.propertyCode` = código + `events` `ESTADO_CAMBIADO` sobre la propiedad con `newEstado` que indique oferta aceptada (mismas palabras clave que Smart Closing: reserva, señal, arras) | Si hay **≥3** visitas con `propertyCode` y **ningún** cambio de estado de oferta, se encola reevaluación. |

Orquestación: `POST /api/cron/pricing-reevaluation` (`CRON_SECRET`) → `scanPropertiesForPricingReevaluation()` → jobs `RUN_PRICING_ANALYSIS` con payload que reduce carga (ver siguiente apartado).

**Mitigación de cuellos de botella** en esas reevaluaciones en lote: menos páginas de Statefox por job (`maxPages` reducido), sin llamada a LangGraph por defecto (`generateRecommendation: false`, solo semáforo y cluster estadístico), `availableAt` escalonado entre jobs, `idempotencyKey` diaria por propiedad, exclusión si hubo `PRICING_ANALISIS_GENERADO` en los últimos **7 días** (cooldown), y tope de **100** propiedades encoladas por ejecución del scanner.

**Lectura del informe materializado**: el análisis persistido se guarda también en la proyección Prisma `pricing_reports`. La UI consulta `GET /api/pricing/report/{code}` para leer el último informe sin recalcular por defecto; el recálculo explícito sigue entrando por `POST /api/pricing/analyze`.

### Diagrama de Flujo

```mermaid
flowchart TD
    A[Ingestion Worker detecta alta/modificación en Inmovilla] --> B[Extracción de variables clave]
    B --> C[Capa 3: consulta Statefox API REST con filtros de zona/tipo/precio]
    C --> D[Statefox API: comparables del mercado real]
    D --> E[Capa 3: construye cluster comparativo]
    E --> F[Capa 3: Análisis de precios vs mercado]
    F --> G[Capa 3: Análisis de calidades y extras]
    G --> H[Capa 3: Análisis de posicionamiento en portales]
    H --> I[LangGraph: Motor de recomendación estratégica]
    I --> J[Informe automático al comercial vía micro-frontend]
    J --> K{Decisión comercial}
    K -->|Mantener| L[Seguimiento automático]
    K -->|Ajustar precio| M[Propuesta de nuevo precio]
    K -->|Reposicionar| N[Recomendaciones de mejora]
```

**Reevaluación proactiva (cron)** — flujo paralelo cuando el disparador es tiempo/inactividad, no un diff nuevo de Inmovilla:

```mermaid
flowchart TD
    Cron["POST /api/cron/pricing-reevaluation"] --> Scan["scanPropertiesForPricingReevaluation"]
    Scan --> PC["properties_current nodisponible=false"]
    PC --> Cool["Skip si PRICING_ANALISIS_GENERADO reciente"]
    Cool --> Eval["Triggers: sin leads 14d sin match o visitas sin oferta"]
    Eval --> Job["RUN_PRICING_ANALYSIS opciones reducidas"]
    Job --> Consumer["Consumer y runPricingAnalysis"]
    Consumer --> WA["NOTIFY_PRICING_WHATSAPP e informe"]
```

### Datos que se vuelcan desde Inmovilla

Variables mínimas del inmueble:

- Precio
- Zona / distrito / barrio
- Metros construidos y útiles
- Tipología
- Estado (obra nueva, reformado, origen)
- Planta / ascensor
- Extras (terraza, parking, trastero)
- Año de construcción (si existe)

> Si faltan datos, el sistema avisa al agente en lugar de analizar con información incompleta.

### Análisis de Statefox + Capa 3

#### Búsqueda de comparables reales

La Capa 3 consulta la API REST de Statefox (`GET /properties`) filtrando por zona, tipo y rango de precio. Con los resultados, LangGraph crea **clusters comparativos**:

- Misma zona/distrito
- ±15–20% metros
- Tipología similar
- Estado comparable

#### Análisis automatizado

**Precio:**
- Precio medio €/m² del cluster.
- Rango bajo / medio / alto.
- Desviación del inmueble vs mercado (%).

**Calidades:**
- Extras del inmueble vs competencia.
- Qué falta para justificar el precio.
- Qué tiene de más (argumento comercial).

**Posicionamiento en portales:**
- Tramo de aparición (alto, medio, bajo).
- Si compite con inmuebles "mejor percibidos".
- Si queda enterrado por precio/fotos/orden.

### Motor de Recomendación (LangGraph)

El sistema no solo analiza, **recomienda**. En análisis disparados por **alta o modificación** de propiedad, el flujo completo incluye recomendación textual vía LangGraph cuando está habilitado. En jobs originados por el **cron de reevaluación**, la recomendación LLM se omite por defecto para limitar coste y latencia en lote; el comercial sigue recibiendo semáforo, gap y comparables vía el mismo informe y notificación.

Ejemplos reales de output (cuando el LLM está activo):

**Diagnóstico automático:**
> "El inmueble está un 8,7% por encima del precio medio del mercado para su zona y tipología."

**Recomendaciones estratégicas:**
> "Para competir con los 5 primeros anuncios del portal, el precio óptimo sería –5%."
>
> "Si se mantiene el precio actual, el inmueble pasará a competir con propiedades reformadas."
>
> "Bajar 3.000–5.000€ mejora visibilidad sin devaluar."

**Alternativas (no solo bajar precio):**
> "Reposicionar el anuncio destacando terraza + orientación."
>
> "Cambiar orden de fotos y primera imagen."
>
> "Subir ligeramente el precio (+2%) para reposicionar en otro tramo menos saturado."

### Entrega al Comercial

El comercial recibe automáticamente (vía micro-frontend o WhatsApp), tanto tras **alta o cambio** de ficha como tras una **reevaluación por cron** cuando el job completa con datos suficientes:

- **Informe resumen** (1 página).
- **Semáforo:**
  - `VERDE` — Bien posicionado.
  - `AMARILLO` — Riesgo comercial.
  - `ROJO` — Fuera de mercado.
- **Recomendación accionable:** mantener / ajustar precio (con rango) / reposicionar anuncio.

Todo queda registrado en Neon como evento y se sincroniza con Inmovilla como nota estratégica (vía `Egestion Worker`).

### SOP del Motor de Pricing

**Comercial:**
1. Revisa el informe (2–3 min).
2. Decide: seguir igual / proponer ajuste al propietario.
3. Usa el informe como argumento objetivo, no como opinión.

**Dirección / Coordinación:**
- Detecta inmuebles "quemándose".
- Decide relanzamientos estratégicos.
- Controla pricing del stock total.

### Tiempo Ahorrado

| Proceso | Manual | Automatizado |
|---|---|---|
| Buscar competencia | 20–40 min | 0 (sistema) |
| Comparar precios y calidades | 15–30 min | 0 (sistema) |
| Preparar argumento para propietario | 10–20 min | 3–5 min (revisión) |
| **Total** | **45–90 min** | **3–5 min** |

**Ahorro: ~70%–85% por inmueble.**

---

## Smart Closing — Contratos Autorrellenables y Revisión por Voz

### Objetivo

Cuando una operación pasa a "Reserva/Señal / Arras / Cierre acordado" en Inmovilla, el sistema:

1. Extrae datos (comprador + vendedor + inmueble + comercial + precio).
2. Genera contrato(s) desde plantillas programáticas.
3. El gestor revisa hablando (modo conversación) y pide modificaciones.
4. El sistema aplica cambios, genera nueva versión y vuelve a presentar.
5. Se envía a firma digital.
6. Se archiva en Cloudinary/Neon y se actualiza el estado de la propiedad en Inmovilla (la API REST de Inmovilla no soporta adjuntar documentos).

### Disparador

El `Ingestion Worker` detecta un cambio de estado/fase a:

- "Reserva/Señal"
- "Arras"
- "Operación aceptada / lista documentación"

**Condición mínima para disparar:**

| Dato | Campos requeridos |
|---|---|
| Comprador | DNI/NIE, domicilio, email/teléfono |
| Vendedor | DNI/NIE, domicilio, contacto |
| Inmueble | Dirección + referencia interna |
| Operación | Precio, importes (señal/arras), plazos y forma de pago |
| Agencia | Comercial asignado, honorarios/comisión |

> Si faltan campos, el sistema no genera el contrato y crea una tarea `DATOS_INCOMPLETOS` para el comercial.

### Diagrama de Flujo

```mermaid
flowchart TD
    A[Ingestion Worker: operación pasa a Reserva/Arras] --> B{Validación campos obligatorios}
    B -->|Faltan| C[Tarea al comercial: completar datos]
    B -->|OK| D[Capa 3: extraer datos de Neon + Inmovilla]
    D --> E[Seleccionar plantilla correcta]
    E --> F[Generar borrador v1 programáticamente]
    F --> G[Gestor: revisión por voz en micro-frontend]
    G --> H{¿Cambios solicitados?}
    H -->|No| I[Gestor aprueba: OK para firma]
    H -->|Sí| J[STT captura voz → LangGraph extrae instrucciones]
    J --> K[Aplicar cambios en variables/cláusulas]
    K --> L[Regenerar contrato v2 + resumen de cambios]
    L --> G

    I --> M[Enviar a firma digital]
    M --> N{¿Firmado?}
    N -->|No| O[Recordatorios WhatsApp +1/+3/+5 días + escalado SLA 5d]
    N -->|Sí| P[Guardar firmado en Cloudinary/Neon + actualizar estado en Inmovilla]
    P --> Q[Egestion Worker: actualizar estado de propiedad en Inmovilla vía API REST]
```

### Pipeline de Revisión por Voz

El sistema utiliza tres piezas ejecutadas en código puro:

| Pieza | Tecnología | Función |
|---|---|---|
| **Speech-to-Text** | OpenAI Whisper API (llamada desde Next.js API Route) | Transcribe la voz del gestor a texto |
| **Intérprete de instrucciones** | LangGraph + modelos o3 | Convierte lo verbal en acciones estructuradas |
| **Motor de plantillas** | Generación programática en TypeScript | Aplica variables, bloques condicionales, anexos dinámicos |

**Ejemplo de interpretación:**

| Instrucción verbal | Variable/bloque afectado |
|---|---|
| "Cambia honorarios a 3% + IVA" | `honorarios = 3% + IVA` |
| "Arras penitenciales" | `tipo_arras = penitenciales` |
| "Plazo para firma ante notario: 45 días" | `plazo_escritura = 45 días` |
| "Incluye anexo de mobiliario" | `clausula_mobiliario = sí` |

Si hay ambigüedad (confidence score bajo), el sistema pregunta al gestor: "¿quieres 45 días naturales o hábiles?"

### Firma Digital

Firma electrónica simple **in-house** (sin SaaS de firma de terceros):

- **Motor:** Next.js + Neon; hash SHA-256, token de enlace, firma manuscrita en lienzo, **OTP por SMS** antes de sellar, PDF con sello visual y pista de auditoría.
- **Flujo:** `POST /api/contracts/sign` normaliza a **PDF obligatorio**, calcula SHA-256, genera token seguro, y devuelve `signingUrl` = `{NEXT_PUBLIC_APP_URL}/firma/{token}`. En la página pública, el firmante verifica un código SMS y luego `POST /api/firma/{token}/sign` completa el proceso (integridad, evidencia IP/UA/timestamp, `FIRMA_COMPLETADA`). Detalle en [docs/firma-digital.md](docs/firma-digital.md).
- **Seguridad del endpoint de envío:** proteger con `SIGNATURIT_SIGN_API_TOKEN` (o fallback `CRON_SECRET`) para evitar uso público no autorizado.
- **Recordatorios si no se firma:** canal **WhatsApp Cloud API (Meta)** — misma integración directa que el resto del producto. No se definen recordatorios genéricos sin canal: el seguimiento operativo al firmante es por **WhatsApp** usando **plantillas aprobadas por Meta** cuando la política de la plataforma lo requiera.

**SLAs y cadencia (construcción):**

| Concepto | Valor documentado | Notas |
| --- | --- | --- |
| **SLA de firma completa** | **5 días naturales** desde el envío de la solicitud hasta la firma completada | Parametrizable vía config/env. Fuente de verdad del “completado”: estado en **Neon** y evento `FIRMA_COMPLETADA`. |
| **Recordatorios al firmante** | **Día +1**, **día +3** y **día +5** (naturales desde el envío) | Solo mientras el estado siga pendiente. El mensaje del día +5 indica **último recordatorio automático** antes del escalado. |
| **Escalado por SLA** | Tras **5 días naturales** sin firma completa | **WhatsApp** al **comercial asignado** y al **gestor (BO)** con operación, documento y enlace de seguimiento; registro en **Neon** (evento o tarea) para auditoría. |

**Orquestación:** evaluación periódica del estado pendiente mediante **cron-job** (p. ej. **Upstash QStash**) o jobs en la cola del proyecto; evitar envíos duplicados el mismo día.

**Plantillas WhatsApp (Meta Business Manager)** — categoría **UTILITY**, idioma **`es_ES`**. Los nombres coinciden con el `name` en la Cloud API. El cuerpo usa variables en el orden indicado (equivalente a `{{1}}`, `{{2}}`, … en Meta y al orden de `components[].parameters` en el envío).

| Nombre en Meta | Uso | Variables del cuerpo (orden) |
| --- | --- | --- |
| `contrato_firma_recordatorio_d1` | Recordatorio al firmante, **día +1** natural desde el envío | **{{1}}** nombre corto del firmante · **{{2}}** tipo de documento (p. ej. «Contrato de arras», alineado con `ContractDocumentKind`) · **{{3}}** referencia de operación (`operationId` o stem `OP-…_Arras_vN`) · **{{4}}** URL de firma (`/firma/{token}`) |
| `contrato_firma_recordatorio_d3` | Igual, **día +3** | Mismo orden: **{{1}}**–**{{4}}** |
| `contrato_firma_recordatorio_d5` | Igual, **día +5**; el texto fijo de la plantilla debe indicar **último recordatorio automático** antes del escalado por SLA | Mismo orden: **{{1}}**–**{{4}}** |
| `contrato_firma_sla_escalado` | Tras **5 días naturales** sin firma completa: **comercial asignado** y **gestor (BO)** | **{{1}}** referencia de operación · **{{2}}** tipo de documento · **{{3}}** enlace absoluto de seguimiento (`{NEXT_PUBLIC_APP_URL}/platform/legal/contratos/{id}`) |

**Variables de entorno opcionales** (si el código resuelve el nombre de plantilla por config): `WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D1`, `WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D3`, `WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D5`, `WHATSAPP_TEMPLATE_CONTRATO_FIRMA_SLA_ESCALADO` — valores por defecto los nombres de la tabla anterior.

**Resto de implementación:** IDs internos de plantilla en Meta (si se usan), variable `FIRMA_TOKEN_SECRET` y tabla de mapeo de estados en [docs/firma-digital.md](docs/firma-digital.md).

### Control de Versiones y Auditoría

Naming estándar:

```
OP-2026-000123_Arras_v1_Borrador.pdf
OP-2026-000123_Arras_v2_CambiosGestor.pdf
OP-2026-000123_Arras_Firmado.pdf
```

Registro en Neon (evento `CONTRATO_VERSIONADO`): versión, fecha, autor (gestor), resumen de cambios. Persistido en la tabla `legal_documents` de Neon. El estado de la propiedad se sincroniza con Inmovilla vía `Egestion Worker` (la API de Inmovilla no tiene endpoints de gestión documental).

### Qué se autorellena (regla de oro)

No es "editar texto a mano". Es editar **variables** y **bloques**:

- **Variables:** importes, plazos, honorarios, domicilios, DNIs, cuentas.
- **Bloques condicionales:**
  - Arras penitenciales vs confirmatorias.
  - Condición hipotecaria sí/no.
  - Entrega de llaves en firma vs en fecha posterior.
  - Mobiliario incluido (anexo).

El gestor dice "modifica X", el sistema cambia variable/bloque, regenera el documento entero sin romper formato y deja trazabilidad.

### SOP del Smart Closing

**Comercial (mínimo):**
- Cambia el estado a "Reserva/Arras".
- Completa campos faltantes si el sistema lo pide.

**Gestor (control legal y calidad — modo voz):**
1. Abre el borrador v1 en el micro-frontend.
2. Habla con el sistema para solicitar cambios.
3. El sistema aplica cambios, genera v2, muestra resumen.
4. El gestor confirma: "OK para firma".

**SYS:**
- Genera borradores, versiona y registra cambios.
- Interpreta voz y transforma en instrucciones estructuradas.
- Envía a firma digital **in-house** (`POST /api/contracts/sign`, cierre en `/api/firma/{token}/sign` con OTP) y archiva en Cloudinary/Neon (tabla `legal_documents`).
- Lanza **recordatorios por WhatsApp** (+1/+3/+5 días) y **escalado** a comercial y gestor si se incumple el **SLA de 5 días naturales**.
- Actualiza el estado de la propiedad en Inmovilla vía Egestion Worker (`PUT /propiedades/` con `estadoficha`). Los documentos se almacenan en Cloudinary/Neon porque la API de Inmovilla no tiene endpoints de gestión documental.

### Tiempo Ahorrado

| Proceso | Manual | Automatizado |
|---|---|---|
| Preparar contrato señal/arras | 20–45 min | 2–3 min (sistema) |
| Revisar y ajustar | 10–25 min | 5–12 min (gestor por voz) |
| Versiones + enviar + perseguir firma | 10–20 min | 2–5 min (sistema) |
| Archivar y actualizar CRM | 5–10 min | 0 (automático) |
| **Total humano** | **45–100 min** | **7–20 min** |

**Ahorro: ~60%–85% por operación.**

> En operaciones complejas (cargas, herencias, varios compradores), el ahorro se acerca a 40–60% por mayor intervención del gestor.

---

## Sistema de Gobierno Estratégico del CEO

> Control Total · Decisión · Escalado Nacional

### Para qué sirve

Este sistema existe para que el CEO:

- Vea la empresa completa en **tiempo real**.
- No tenga que "preguntar cómo vamos".
- Sepa qué funciona, qué se está rompiendo y qué **va a romperse pronto**.
- Tome decisiones **antes** de que el mercado las fuerce.
- Escale con método, no con intuición.
- Convierta la empresa en un **sistema replicable a nivel nacional**.

> Sin este sistema: el CEO reacciona.
> Con este sistema: el CEO **dirige con anticipación**.

### Estructura del Sistema (6 Capas)

Integra todos los módulos anteriores y añade inteligencia estratégica. Todos los datos provienen de Neon (Event Store) y se visualizan en micro-frontends de Next.js.

---

#### CAPA 1 — Visión Ejecutiva en Tiempo Real

**Objetivo:** que el CEO sepa en 2 minutos cómo está la empresa.

**Métricas clave globales:**

- Facturación mensual / trimestral / anual
- Objetivo vs real
- EBITDA estimado
- Coste operativo total
- Margen por operación
- Cash disponible
- Capacidad de reinversión

**Estado visual** (semáforo verde/amarillo/rojo) por: facturación, equipo, expansión, costes.

> El CEO no interpreta datos, **ve estado**.

---

#### CAPA 2 — Rendimiento Comercial por Ciudad y Persona

**Objetivo:** entender dónde se genera y dónde se pierde dinero.

**Vista por ciudad** (Córdoba / Málaga / Sevilla):

- N.º comerciales activos
- Carga media por comercial
- Propiedades activas
- Operaciones/mes
- Facturación/mes
- Rentabilidad por comercial
- Coste de oportunidad

**Vista por comercial:** ranking de rentabilidad, conversión real, carga actual, saturación/infrautilización.

El sistema responde automáticamente: ¿faltan comerciales? ¿Sobran? ¿Dónde?

---

#### CAPA 3 — Estado Psicológico y Sostenibilidad del Equipo

**Objetivo:** proteger el activo humano de alto rendimiento.

Sin mostrar conversaciones privadas, el sistema agrega:

- Nivel de uso del bot de soporte mental.
- Patrones de bloqueo.
- Fatiga por zona.
- Presión sostenida.

**Indicadores:** riesgo de burnout, riesgo de caída de rendimiento, estabilidad emocional media por equipo.

> El CEO ve riesgos **estructurales**, no intimidades.

---

#### CAPA 4 — Diagnóstico Automático y Recomendaciones

Aquí el sistema deja de mostrar datos y **empieza a pensar** (LangGraph).

Ejemplos de recomendaciones automáticas:

- "Córdoba: carga media por comercial > umbral → **contratar 1–2 comerciales**."
- "Málaga: conversión alta, carga baja → **aumentar captación**."
- "Sevilla: buen volumen, bajo cierre → **intervenir proceso**."

También: redistribución de leads, refuerzo de formación, ajuste de incentivos, intervención de jefe de zona.

> El sistema le dice al CEO **qué hacer** y **por qué**.

---

#### CAPA 5 — Motor de Expansión Geográfica

**Objetivo:** decidir CUÁNDO y DÓNDE expandirse.

**Métricas que habilitan expansión:**

- Facturación estable ≥ X meses.
- Margen operativo ≥ X%.
- Cash disponible ≥ X.
- Procesos estables.
- Capacidad de liderazgo interna.

**Análisis por ciudad candidata:** demanda potencial, ticket medio esperado, coste de implantación, break-even estimado, número óptimo de comerciales iniciales.

> "Valencia cumple criterios. Lanzamiento recomendado en 90 días con 3 comerciales."

La expansión no es una apuesta, es una **consecuencia lógica**.

---

#### CAPA 6 — Control Financiero, Costes y Reinversión

**Objetivo:** que el CEO sepa cuánto puede arriesgar sin poner en peligro la empresa.

**Control automático de:** costes fijos, costes variables, coste por comercial, coste por operación, ROI de automatizaciones.

**Recomendaciones:** cuánto reinvertir, en qué (tecnología, equipo, ciudad), cuándo frenar, cuándo acelerar.

> El CEO invierte con seguridad, no con fe.

### Desarrollo Técnico del Gobierno CEO

1. **Integrar todos los módulos previos:** CRM, dashboard de rentabilidad, colaboradores externos, bot de soporte mental, finanzas. Todo converge en la Capa 3 de Neon como Event Store unificado.
2. **Definir umbrales estratégicos:** carga máxima por comercial, facturación mínima por ciudad, margen mínimo para expansión, riesgo psicológico tolerable. El sistema actúa cuando se superan.
3. **Motor de recomendaciones:** LangGraph aplica reglas + IA. Cada recomendación se justifica con datos. Histórico de decisiones tomadas.
4. **Panel CEO (micro-frontend Next.js):** lectura rápida, foco estratégico, cero microgestión.

### Qué decisiones habilita

- Contratar / no contratar.
- Expandir / esperar.
- Invertir / proteger caja.
- Intervenir equipos.
- Cambiar estrategia por ciudad.
- Preparar rondas internas de crecimiento.

### Comunicación a Jefes de Zona

El CEO baja: decisiones claras, objetivos concretos, plazos, métricas de control.
No baja dudas. **Baja dirección.**

---

## Dashboard de Rentabilidad por Comercial

> Control · Optimización · Escalado

### Para qué sirve

No es un dashboard informativo, es un **sistema de gobierno del negocio**:

- Medir rentabilidad real por persona, no solo facturación.
- Detectar ineficiencias ocultas (mucho trabajo, poco resultado).
- Identificar top performers replicables.
- Justificar decisiones de formación, redistribución, incentivos o desvinculación.
- Gestión objetiva, no emocional.

> Sin dashboard: se gestiona por sensaciones.
> Con dashboard: **se gestiona por datos**.

### Implementación (M10) — Sistema de métricas (facts + queries)

Además de la parte conceptual, el repo incluye una implementación v1 del sistema de métricas para el dashboard:

- **Read-model analítico (facts)** en Neon/Prisma:
  - `commercial_lead_facts` (leads asignados/contactados/perdidos por falta de seguimiento)
  - `commercial_visit_facts` (visitas agendadas)
  - `commercial_visit_evaluation_facts` (evaluaciones post-visita)
  - `commercial_operation_facts` (cierres y volumen/facturación estimada)
- **Proyección “best-effort”** al consumir eventos (no bloquea el flujo si falla la analítica).
- **Queries analíticas** en `lib/dashboard/comercial/queries.ts`.
- **API Routes**:
  - `GET /api/dashboard/comerciales`
  - `GET /api/dashboard/comercial/:id`
- **UI (Rendimiento en plataforma)**:
  - Rutas reales: `/platform/rendimiento/comerciales` (ranking + KPIs + gráficos) y `/platform/rendimiento/comerciales/[id]` (detalle + evolución semanal).
  - La demo solo-mock que antes vivía en `/rendimiento/*` está en el repo aparte `urus-rendimiento-mock` (hermano de este proyecto bajo `~/code`).
  - Hook cliente: `lib/hooks/use-dashboard-comercial.ts`.
  - Navegación: pestaña y entrada de sidebar bajo **Rendimiento → Comerciales**.

Detalles de KPIs, facts y SQL: `docs/dashboard-comercial-metricas.md`. Infraestructura de la capa UI (rutas, componentes, límites): `docs/dashboard-comercial-ui.md`.

### Estructura (5 Capas)

---

#### CAPA 1 — Captura Automática de Datos

**Objetivo:** el dashboard se alimenta solo, sin manipulación humana.

Datos que entran automáticamente (el `Ingestion Worker` los extrae de Inmovilla y la Capa 3 los procesa):

- N.º de leads asignados
- Origen del lead
- N.º de contactos realizados
- N.º de visitas
- N.º de ofertas
- N.º de cierres
- Facturación generada
- Tiempo medio por operación
- Estado de cada lead

> **Regla clave:** si no está en CRM, no existe.

---

#### CAPA 2 — Normalización y Cálculo de Métricas

**Objetivo:** convertir actividad en indicadores económicos.

Se calculan automáticamente (queries analíticas sobre Neon):

| Métrica | Descripción |
|---|---|
| Conversión lead → visita | % de leads que llegan a visita |
| Conversión visita → cierre | % de visitas que terminan en cierre |
| Tiempo medio de cierre | Días desde lead hasta firma |
| Facturación por operación | Ingresos medios por cierre |
| Facturación mensual por comercial | Ingresos totales/mes |
| Ingresos por lead asignado | Eficiencia de asignación |
| % leads perdidos por falta de seguimiento | Oportunidades desperdiciadas |
| Rentabilidad ponderada por tiempo | Rendimiento ajustado al esfuerzo |

---

#### CAPA 3 — Dashboard Visual por Niveles

**Objetivo:** cada rol ve solo lo que necesita (micro-frontends con control de acceso).

| Vista | Contenido |
|---|---|
| **CEO** | Ranking rentabilidad por comercial y ciudad, coste de oportunidad, comparativa entre equipos |
| **Jefe de zona** | Rendimiento individual del equipo, cuellos de botella, alertas de bajo rendimiento, evolución mensual |
| **Comercial** | Su rendimiento vs media, objetivo mensual, qué métrica concreta debe mejorar |

---

#### CAPA 4 — Clasificación Automática del Comercial

**Objetivo:** segmentar para actuar. Clasificación **matemática**, no subjetiva.

| Perfil | Características |
|---|---|
| **Top performer** | Alta conversión, alta facturación, buen uso del sistema |
| **Productivo ineficiente** | Mucha actividad, baja conversión |
| **Dependiente del lead caliente** | Solo cierra leads muy buenos |
| **Bajo rendimiento estructural** | Mala conversión, mala gestión, mal seguimiento |

---

#### CAPA 5 — Recomendaciones Automáticas

El sistema deja de ser un "panel" y pasa a ser una **herramienta de mejora** (LangGraph genera recomendaciones):

- **Top performers:** asignar leads de mayor valor, replicar su método.
- **Ineficiencia detectada:** revisar tipo de lead asignado, ajustar cadencias.
- **Bajo rendimiento:** intervención del jefe de zona, plan de mejora con KPIs claros, decisión a 30–60 días.

### Desarrollo Técnico

1. **Definir KPIs obligatorios:** leads asignados/mes, % contacto efectivo, % conversión a visita, % conversión a cierre, facturación total, facturación por lead, tiempo medio de cierre.
2. **Automatizar la recogida desde CRM:** el `Ingestion Worker` extrae cada cambio de estado. Los eventos en Neon alimentan las métricas sin inputs manuales.
3. **Reglas de clasificación:** conversión < X% → alerta; tiempo de cierre > media + 30% → ineficiencia; facturación/lead < mínimo → mala asignación.
4. **Dashboard dinámico:** datos diarios, comparativas mensuales, tendencias trimestrales. El CEO no espera al cierre de mes.
5. **Alertas automáticas:** comercial cae 2 semanas seguidas, SLA incumplido, leads calientes sin contacto, desviación grave vs media. Notificaciones vía WhatsApp Business API o Slack.

### Comunicación al Comercial

No se dice: "Tienes que vender más."
Se dice:

- "Tu tasa de contacto está por debajo del equipo."
- "Estás perdiendo leads por no llamar en las primeras 2 horas."
- "Tu cierre mejora cuando el lead viene de X origen."

El comercial sabe: qué falla, cómo mejorarlo, cómo se le va a medir.

---

## Motor de Decisión para la Gestión y Priorización de Leads

### Arquitectura del Motor (6 Capas)

---

#### Capa A — Captura Unificada de Entradas

Fuentes:

- Portales (Idealista / Fotocasa / Habitaclia)
- Web (formularios)
- WhatsApp / Instagram / Facebook
- Llamadas (call tracking)
- Referidos / base de datos

El `Ingestion Worker` captura todas las entradas (vía API REST para contactos de portales, vía polling legacy para demandas) y las normaliza en Neon como eventos `CONTACTO_INGESTADO` con:

- Origen
- Ciudad (Córdoba / Málaga / Sevilla)
- Tipo (propietario / comprador / inversor)
- Timestamp
- Datos mínimos

---

#### Capa B — Normalización y Enriquecimiento

La Capa 3 convierte texto "sucio" en campos útiles:

| Proceso | Tecnología |
|---|---|
| Parseo de mensaje | Reglas + expresiones regulares (rápido y barato) |
| Clasificación de texto libre | LangGraph con modelos o3 |
| Geolocalización | Detección de zona/barrio |
| Detección de intención | Vender ya / solo curiosear / inversión |
| Detección de calidad | ¿Aporta datos o es genérico? |

---

#### Capa C — Scoring (0–100)

El motor de priorización devuelve:

- **Score total**
- **Motivo del score** (explicable)
- **Siguiente mejor acción** (NBA: Next Best Action)

Fórmula:

```
Score = 0.55 × Pclose + 0.30 × Value + 0.15 × Urgency
```

Donde:
- `Pclose` = Probabilidad de cierre
- `Value` = Valor económico esperado
- `Urgency` = Urgencia / SLAs

**Reglas rápidas (MVP):**

| Criterio (comprador) | Puntos |
|---|---|
| Preaprobación hipotecaria | +25 |
| Presupuesto definido | +15 |
| Plazo ≤ 30 días | +20 |
| Mensaje con detalles (zona, tipología) | +10 |
| Referido | +15 |
| "Solo estoy mirando" | −20 |

| Criterio (propietario) | Puntos |
|---|---|
| Urgencia de venta | +20 |
| Precio cercano a mercado | +15 |
| Exclusiva aceptable / motivación | +15 |
| Documentación disponible | +10 |
| "Quiero probar sin agencia" | −25 |

Con reglas se logra el 80% del valor. LangGraph refina el 20% restante con análisis semántico.

---

#### Capa D — Enrutado y SLA Automáticos

Con el score, la Capa 3 ejecuta:

| Score | SLA | Acción |
|---|---|---|
| ≥ 80 | < 5 min | Notificación inmediata al comercial vía WhatsApp |
| 60–79 | < 30 min | Notificación prioritaria |
| 40–59 | < 2 h | Tarea en cola |
| < 40 | Cadencia automática | Sin gasto de tiempo humano |

Asignación por: ciudad + especialidad + carga actual + conversión histórica.

---

#### Capa E — Seguimiento y Recirculación

Si no contesta / no avanza:

- Cadencias automáticas (D+1, D+3, D+7) ejecutadas por cron-jobs.
- Cambio de estado (eventos en Neon).
- Re-asignación si SLA incumplido.
- Recirculación a otro comercial si se enfría.

---

#### Capa F — Aprendizaje (Feedback Loop)

Cada lead que cierre o no cierre alimenta el modelo en Neon:

- Qué origen convierte mejor.
- Qué copy/guion funciona.
- Qué perfil de lead realmente compra.
- Qué comercial cierra mejor en cada segmento.

LangGraph usa estos datos para recalibrar los pesos del scoring periódicamente.

### Panel de Control de Priorización

KPIs imprescindibles:

- Tiempo medio de primera respuesta por score.
- Conversión por rango de score (80+, 60–79, etc.).
- Cierre por origen.
- Cierre por comercial y por segmento.
- Leads "perdidos por SLA".

Si el score no predice cierres, se ajusta.

### Orden de Implementación

1. Scoring por reglas + routing + SLA (rápido, robusto).
2. Cadencias automáticas (para no gastar tiempo humano).
3. LangGraph para extracción/clasificación semántica (mejorar precisión).
4. Aprendizaje con datos de cierre (para afinar y escalar).

---

## Sistema de Control de Colaboradores Externos

> Eficiencia · Rentabilidad · Escalado

### Para qué sirve

Este sistema es **gobierno del ecosistema externo** de la agencia:

- Eliminar cuellos de botella invisibles ("está en el banco", "lo ve el abogado").
- Medir rendimiento real por colaborador.
- Detectar colaboradores que restan rentabilidad.
- Priorizar a los que aceleran cierres.
- Profesionalizar la relación (menos dependencia personal).

> Sin sistema: retrasos, excusas, pérdida de cierres.
> Con sistema: **tiempos controlados, decisiones objetivas**.

### Estructura (5 Capas)

---

#### CAPA 1 — Captura Automática de Actividad

**Objetivo:** toda interacción con colaboradores queda registrada en Neon.

Se registra automáticamente:

- Colaborador asignado a operación.
- Tipo (banco, abogado, tasador, arquitecto, inversor, proveedor).
- Fecha de asignación.
- Hitos del proceso.
- Tiempos de respuesta.
- Resultado final (aprobado / rechazado / retrasado).

Los datos se capturan desde el **dashboard interno de Next.js** donde el Comercial o el CEO registra asignaciones, sube documentos en nombre de los colaboradores, avanza hitos y cambia estados. Los colaboradores externos **no acceden al sistema directamente**; toda la interacción se gestiona internamente. Inmovilla no modela hitos operativos de bancos/abogados/tasadores (no hay entidad colaborador en su modelo), por lo que no hay datos que reconciliar desde el CRM. Todo el flujo vive en Neon.

> **Regla clave:** la gestión de colaboradores la realiza el equipo interno (Comercial/CEO), no el colaborador externo.

---

#### CAPA 2 — Normalización y Métricas de Rendimiento

Se calculan automáticamente (queries sobre Neon):

| Métrica | Descripción |
|---|---|
| Tiempo medio de respuesta | Desde solicitud hasta primera acción |
| Tiempo medio hasta resolución | Desde solicitud hasta cierre del hito |
| % operaciones desbloqueadas | Cuántas avanzaron gracias al colaborador |
| % operaciones bloqueadas | Cuántas se atascaron por el colaborador |
| Impacto en tiempo de cierre | Días añadidos/ahorrados vs media |
| Impacto en facturación | Correlación con velocidad de cierre |
| Ratio de retrabajo | Cuántas veces hay que repetir/corregir |

---

#### CAPA 3 — Dashboard por Niveles

| Vista | Contenido |
|---|---|
| **CEO** | Ranking de colaboradores por impacto en facturación, coste de oportunidad, dependencias excesivas, comparativa entre ciudades |
| **Jefe de zona** | Qué colaborador bloquea operaciones, alertas por retrasos, recomendaciones de cambio |
| **Comercial** | Estado de cada colaboración, qué está pendiente y de quién, próxima acción sugerida |

---

#### CAPA 4 — Clasificación Automática

| Perfil | Características |
|---|---|
| **Partner estratégico** | Rápido, fiable, alto impacto positivo |
| **Colaborador funcional** | Cumple, no destaca, no bloquea |
| **Colaborador lento** | Genera retrasos, aumenta tiempo de cierre |
| **Colaborador crítico** | Bloquea operaciones, genera incidencias, daña conversión |

Clasificación basada en datos, no en afinidad personal.

---

#### CAPA 5 — Recomendaciones Automáticas

LangGraph genera recomendaciones para el CEO:

- **Partners estratégicos:** concentrar operaciones, negociar mejores condiciones.
- **Colaboradores lentos:** reducir asignaciones, renegociar SLA.
- **Colaboradores críticos:** cortar colaboración, sustituir, redistribuir operaciones.

### Desarrollo Técnico

1. **Definir colaboradores como entidades en Neon:** tipo, ciudad, especialidad, SLA esperado, operaciones asociadas, métricas históricas.
2. **Definir hitos estándar por tipo:**
   - Banco: documentación enviada → estudio iniciado → preaprobación → aprobación final.
   - Abogado: revisión contrato → observaciones → validación final.
3. **Tracking de tiempos:** cada cambio de estado registra timestamp en Neon, el sistema calcula retrasos.
4. **Reglas de alerta (cron-jobs):** banco supera SLA → alerta jefe de zona; abogado genera incidencias repetidas → alerta CEO.
5. **Dashboard interno (Next.js):** rendimiento semanal, tendencias mensuales, impacto económico acumulado. Gestionado por el Comercial y el CEO, no por los colaboradores externos.

---

## Automatización Post-Venta

### Para qué sirve

La post-venta no es "cortesía", es un **activo económico**. Bien automatizada:

1. Cierra el ciclo profesionalmente (experiencia premium).
2. Reduce incidencias y reclamaciones.
3. Genera reseñas públicas positivas.
4. Activa referidos sin pedirlos directamente.
5. Re-capta al cliente como vendedor/inversor.
6. Crea base de datos de alto valor (clientes reales).

> Sin sistema: se olvida al cliente.
> Con sistema: **el cliente sigue generando ingresos**.

### Estructura (5 Capas Temporales)

Se activan automáticamente cuando Neon registra el evento `OPERACION_CERRADA` (detectado por el `Ingestion Worker` al cambiar el estado en Inmovilla).

---

#### CAPA 1 — Cierre Inmediato (Día 0)

**Objetivo:** cerrar emocional y operativamente la operación.

- Mensaje automático de agradecimiento (personalizado, vía WhatsApp Business API).
- Email resumen de la operación: fecha de firma, partes, documentación clave.
- Checklist interno de "operación cerrada correctamente" (evento en Neon).

---

#### CAPA 2 — Soporte Temprano (Día 3–7)

**Objetivo:** evitar fricción post-firma.

- Mensaje automático: "¿Todo correcto con la entrega, llaves, suministros…?"
- Enlace a mini-guía (micro-frontend Next.js): cambio de suministros, empadronamiento, IBI/comunidad.
- Detección de incidencias: botón "Todo OK" / botón "Necesito ayuda" → crea tarea interna en Neon.

> Un problema no resuelto = mala reseña futura.

---

#### CAPA 3 — Reputación Online (Día 10–14)

**Objetivo:** generar reseñas cuando el cliente está satisfecho.

- Solicitud automática de reseña (Google / portal / redes) vía WhatsApp Business API.
- Copy emocional breve + directo.
- Recordatorio suave si no responde (cadencia automática).

**Regla:** solo se envía si **no hay incidencias abiertas** (verificación automática en Neon).

---

#### CAPA 4 — Activación de Referidos (Día 21–30)

**Objetivo:** nuevos leads sin "pedir favores".

- Mensaje: "Si conoces a alguien que esté pensando en comprar o vender, estaremos encantados de ayudarle como hicimos contigo."
- Enlace directo a WhatsApp / formulario de referido (micro-frontend).

> Se pide cuando la satisfacción es alta, no en frío.

---

#### CAPA 5 — Re-captación y Relación a Largo Plazo (90–180 días)

**Objetivo:** convertir cliente en activo recurrente.

Segmentación automática (basada en eventos en Neon):

| Segmento | Comunicación |
|---|---|
| **Comprador residencial** | "¿Cómo va la vivienda?" / "¿Te planteas vender en X años?" |
| **Inversor** | Oportunidades off-market, rentabilidades |
| **Vendedor** | Valoración actualizada, evolución de precios |

### Desarrollo Técnico

1. **Evento disparador:** `OPERACION_CERRADA` en Neon activa la cadena completa.
2. **Workflows temporales:** cron-jobs que evalúan "días desde cierre" y ejecutan la capa correspondiente.
3. **Sistema de incidencias:** si el cliente indica problema → se pausa el flujo, se crea tarea, se reanuda solo al marcar "resuelto".
4. **Plantillas dinámicas:** mensajes y emails generados con variables (nombre, tipo de operación, ciudad, agente, fecha de firma) desde código TypeScript.
5. **Panel de control post-venta (micro-frontend):** % operaciones con post-venta completada, % incidencias, % reseñas obtenidas, n.º referidos por cliente, facturación derivada.

### Qué NO debe hacer el sistema

- Pedir reseñas con incidencias abiertas.
- Mensajes genéricos sin personalización.
- Saturar al cliente.
- No cerrar tickets de problemas.
- No medir resultados.

### Impacto Económico

| Métrica | Mejora estimada |
|---|---|
| Reseñas | +20–30% |
| Operaciones vía referidos | +10–20% |
| Coste de captación | –15% |
| LTV por cliente | Mayor |

---

## Sistema de Soporte Mental y Alto Rendimiento para Comerciales

> Mentalidad · Performance · Sostenibilidad

### Para qué sirve

Cuando se automatiza todo lo operativo, el comercial pasa a ser un **closer puro** con más presión, más dinero en juego y más exposición emocional. Este sistema:

- Sostiene el rendimiento alto en el tiempo.
- Evita bloqueos mentales (miedo a cerrar, autosabotaje).
- Convierte estrés en foco.
- Reduce burnout y rotación silenciosa.
- Crea comerciales emocionalmente profesionales.

> Sin sistema: el rendimiento sube y luego cae.
> Con sistema: **el rendimiento se estabiliza y escala**.

### Estructura (5 Capas)

---

#### CAPA 1 — Acceso Conversacional 24/7 (Bot Confidencial)

**Objetivo:** soporte inmediato sin fricción.

Implementado como agente conversacional con LangGraph, accesible vía WhatsApp Business API (canal privado):

- Conversación natural.
- Tono profesional, no motivacional vacío.
- **Confidencial** (clave para que se use).

El comercial puede escribir:

- "Estoy bloqueado con un cierre"
- "Tengo miedo de decir el precio"
- "Me noto desconectado"
- "Quiero mejorar mi cierre"

---

#### CAPA 2 — Diagnóstico Automático del Estado Mental

**Objetivo:** identificar en qué punto mental está el comercial.

LangGraph detecta:

| Dimensión | Ejemplos |
|---|---|
| Tipo de bloqueo | Miedo, inseguridad, presión, ego, fatiga |
| Nivel de energía | Alto / medio / bajo |
| Foco vs dispersión | Centrado / disperso / errático |
| Perfil operativo | Patrón de conversación + respuestas guiadas |

> No se juzga, se diagnostica.

---

#### CAPA 3 — Intervención Personalizada

**Objetivo:** desbloquear y mejorar rendimiento en el momento.

El agente LangGraph propone:

- Ejercicios de enfoque (2–5 minutos).
- Reencuadre mental para cierres.
- Simulaciones de conversación.
- Preguntas de claridad.
- Anclajes de seguridad antes de llamadas.
- Micro-rutinas pre-cierre.

Ejemplos:

> "Vamos a preparar este cierre en 3 pasos."
>
> "Te voy a hacer 5 preguntas para ordenar la llamada."
>
> "Ensayemos la objeción de precio."

No teoría. **Acción inmediata.**

---

#### CAPA 4 — Programas de Desarrollo Continuo

**Objetivo:** elevar el nivel base del comercial.

Programas automáticos ejecutados por LangGraph con cadencia:

- Mentalidad de alto ticket.
- Gestión del rechazo.
- Identidad de closer.
- Disciplina emocional.
- Toma de decisiones bajo presión.
- Desapego del resultado.

**Formato:** micro-ejercicios diarios, retos semanales, reflexiones guiadas, autoevaluaciones rápidas.

---

#### CAPA 5 — Feedback Estratégico (Sin Invadir)

**Objetivo:** mejorar rendimiento sin exponer vulnerabilidades.

El sistema **NO** reporta emociones al CEO. Solo reporta (datos agregados en Neon):

- Uso del sistema.
- Patrones agregados (nunca conversaciones).
- Alertas de riesgo operativo: caída de energía prolongada, bloqueo recurrente, sobrecarga.

Esto permite: intervención del jefe de zona, ajuste de carga, apoyo puntual.

> Se protege la confianza del comercial.

### Desarrollo Técnico

1. **Definir momentos críticos:** antes de llamadas importantes, después de objeción dura, tras una pérdida, antes de cierre grande, días de bajo rendimiento. Estos momentos activan sugerencias proactivas.
2. **Árbol de conversación (LangGraph):** flujos de bloqueo, preparación, simulación, descarga emocional, enfoque, crecimiento. Cada flujo con preguntas cortas, respuestas guiadas y acciones concretas.
3. **Integración con CRM (sin invadir):** el bot puede saber que hoy tiene cierres, que está en racha o que ha perdido una operación. Pero no accede a facturación individual ni métricas duras visibles al comercial.
4. **Aprendizaje:** el sistema aprende qué ejercicios funcionan mejor, qué bloqueos son más frecuentes, en qué momentos se usa más. Mejora intervenciones, timing y personalización.

### Recomendaciones Automáticas al CEO

El sistema ofrece lectura **estratégica**, no psicológica:

- **Alto uso del bot:** indica presión elevada (normal en alto rendimiento). Reforzar cultura.
- **Bajo uso + caída de rendimiento:** posible desconexión. Revisar carga o rol.
- **Patrones por zona:** problema estructural, no individual.

> El CEO gestiona contexto, no emociones.

---

## Stack Técnico Consolidado

### Core

| Componente | Tecnología | Función |
|---|---|---|
| Framework | **Next.js (App Router)** | API Routes, SSR, micro-frontends |
| Lenguaje | **TypeScript** | Tipado estricto en todo el stack |
| ORM | **Prisma** | Schema-first, migraciones, tipos generados |
| Base de datos | **Neon (PostgreSQL serverless)** | Event Store, Job Queue, analítica |
| Motor IA | **LangGraph** | Orquestación de flujos agénticos |
| Modelos LLM | **Familia o3 (OpenAI)** | Razonamiento profundo, clasificación, generación |
| STT | **OpenAI Whisper API** | Speech-to-Text para Smart Closing |
| Cron Scheduler | **Upstash QStash** | Disparo y orquestación de todos los cron-jobs |

### Workers Server-Side

| Worker | Tecnología | Función |
|---|---|---|
| Ingestion Worker | **Node.js** (cron-job con **Upstash QStash**) | API REST para propiedades (Inmovilla + Statefox), polling legacy para demandas |
| Egestion Worker | **Node.js + fetch/Playwright** (job queue) | API REST para clientes/propiedades, RPA legacy para demandas/estados |

### Integraciones Externas

| Servicio | Proveedor | Integración |
|---|---|---|
| **Autenticación Inmovilla (2FA)** | **Composio + Gmail** | Obtención automática del código de verificación por correo: acción Composio sobre Gmail (listar/buscar correos de Inmovilla), extracción del código de 6 dígitos, envío al endpoint `login2Fa/verifyCode`. Ver `docs/workers/inmovilla-endpoints.md`. |
| WhatsApp | **WhatsApp Cloud API (Meta)** | Integración directa con Meta (sin BSP): API REST, webhooks, plantillas. Cuenta Meta Business + WABA. |
| Firma digital | **In-house** | Motor propio (SHA-256, OTP por SMS, PDF sellado + audit trail). Página `/firma/{token}`. Recordatorios SLA vía WhatsApp Cloud API. |
| Calendario | **Google Calendar API** | Micro-frontend de booking |
| Almacenamiento | **Cloudinary** | Documentos, contratos, adjuntos |

### Interfaces

| Interfaz | Tecnología | Usuarios |
|---|---|---|
| Dashboard CEO | **Micro-frontend Next.js** | CEO, dirección |
| Dashboard comercial | **Micro-frontend Next.js** | Comerciales, jefes de zona |
| Gestión de colaboradores | **Dashboard interno Next.js** | Comerciales, CEO |
| Formularios post-visita | **Micro-frontend Next.js** | Comerciales en campo |
| Bot de soporte | **LangGraph + WhatsApp** | Comerciales (canal privado) |

### Patrones Arquitectónicos

| Patrón | Implementación |
|---|---|
| **Event Sourcing** | Todos los cambios se registran como eventos inmutables en Neon |
| **Job Queue** | Tabla `job_queue` en Neon con reintentos y idempotencia |
| **API REST Integration** | Clientes REST tipados para Inmovilla y Statefox con auth por token, rate limiting y reintentos |
| **Server-Side RPA (legacy)** | Workers con Playwright que simulan interacción humana — solo para **crear/actualizar criterios** de demandas en Inmovilla; los estados del pipeline no se escriben en Inmovilla |
| **Network Interception** | Cookies + CSRF + clonación de XHR — solo para operaciones no cubiertas por las APIs REST (creación/edición de demandas) |
| **CQRS** | Lectura (queries analíticas) separada de escritura (eventos) |
| **Ports & Adapters** | `InmovillaWritePort` / `InmovillaReadPort` con adaptadores REST y legacy intercambiables por feature flag |

---

## Conclusión Estratégica

Esta arquitectura **aísla el código legacy y asume su fragilidad**, protegiendo las reglas de negocio en un ecosistema moderno. Le da al CEO:

- **Telemetría real** sobre toda la operación.
- **Capacidades de IA avanzadas** que ningún CRM tradicional puede ofrecer.
- **Resiliencia total:** si Inmovilla se cae, las órdenes se acumulan en Neon y se ejecutan al volver.
- **Escalabilidad nacional** sin multiplicar los cuellos de botella técnicos o humanos.

Inmovilla se mantiene como el **sistema de registro legal** (la Bóveda). Todo lo demás — inteligencia, automatización, experiencia de usuario, decisiones — vive en el ecosistema propio.

> Es la única forma de escalar la agencia a nivel nacional sin multiplicar los cuellos de botella técnicos o humanos.

### Por Qué Automatizar (Resumen Ejecutivo)

La automatización no sustituye personas. **Libera a las personas de tareas que no generan ingresos.**

| Antes | Después |
|---|---|
| Comerciales multitarea (vender + gestionar + perseguir) | El sistema prioriza, asigna y hace seguimiento |
| Leads perdidos por falta de seguimiento | El sistema nunca olvida un cliente |
| Decisiones por intuición | Decisiones por datos |
| Escalar = contratar más sin control | Escalar = **replicar un sistema probado** |

### Tiempo Liberado por Perfil

| Perfil | Ahorro semanal | Se destina a... |
|---|---|---|
| **Comercial** | 15–20 horas | Llamadas de calidad, visitas, cierres |
| **Jefe de equipo** | 15–20 horas | Mejorar al equipo, detectar problemas, optimizar |
| **CEO** | Sale de microgestión | Control global, expansión, estrategia, reinversión |

### Bloques del Sistema

| Bloque | Función principal |
|---|---|
| **1. Captación y priorización** | Centraliza leads, clasifica por calidad/urgencia, prioriza |
| **2. Asignación y seguimiento** | Asigna por ciudad/carga, cadencias automáticas, recirculación |
| **3. Documentación y procesos** | Smart Closing, plantillas, firma digital |
| **4. Post-venta** | Seguimiento, reseñas, referidos, re-captación |
| **5. Dashboard de rentabilidad** | Métricas por comercial, clasificación automática |
| **6. Colaboradores externos** | Control de bancos, abogados, tasadores |
| **7. Bot de soporte mental** | Coaching automatizado, sostenibilidad del rendimiento |
| **8. Gobierno del CEO** | Visión global, diagnóstico, expansión, finanzas |
