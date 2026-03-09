# Plan de Acción — Sistema de Automatización Urus Capital Group

> **Versión:** 1.0
> **Fecha:** Marzo 2026
> **Duración:** 8 semanas (4 sprints de 2 semanas)
> **Horario:** Lunes a Sábado · 8:30 AM – 8:00 PM (11.5 h/día)
> **Demo semanal:** Cada sábado se presenta avance al equipo

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Técnico](#stack-técnico)
4. [Mapa de Módulos y Dependencias](#mapa-de-módulos-y-dependencias)
5. [Prerrequisitos](#prerrequisitos)
6. [Reglas Inquebrantables del Proyecto](#reglas-inquebrantables-del-proyecto)
7. [Plan de Ejecución: 8 Semanas](#plan-de-ejecución-8-semanas)
   - [Sprint 1 (Semanas 1–2)](#sprint-1-semanas-12-cimientos-del-orquestador)
   - [Sprint 2 (Semanas 3–4)](#sprint-2-semanas-34-módulos-avanzados-de-negocio)
   - [Sprint 3 (Semanas 5–6)](#sprint-3-semanas-56-bot-mental--refinamiento-ia--hardening)
   - [Sprint 4 (Semanas 7–8)](#sprint-4-semanas-78-producción--documentación-final)
8. [Criterios de Aceptación por Sprint](#criterios-de-aceptación-por-sprint)
9. [Resumen de Entregables por Semana](#resumen-de-entregables-por-semana)
10. [Métricas de Progreso](#métricas-de-progreso)
11. [Gestión de Riesgos](#gestión-de-riesgos)
12. [Glosario](#glosario)

---

## Resumen Ejecutivo

### Qué se construye

Un sistema de automatización integral para Urus Capital Group que envuelve el CRM existente (Inmovilla) y lo conecta con Statefox, WhatsApp Business, firma digital, y un motor de IA — creando un ecosistema que transforma la operativa inmobiliaria de manual a autónoma.

### Por qué

| Antes | Después |
|---|---|
| Comerciales multitarea (vender + gestionar + perseguir) | El sistema prioriza, asigna y hace seguimiento |
| Leads perdidos por falta de seguimiento | El sistema nunca olvida un cliente |
| Decisiones por intuición | Decisiones por datos |
| Escalar = contratar más sin control | Escalar = replicar un sistema probado |

### Tiempo liberado por perfil

| Perfil | Ahorro semanal | Se destina a... |
|---|---|---|
| Comercial | 15–20 horas | Llamadas de calidad, visitas, cierres |
| Jefe de equipo | 15–20 horas | Mejorar al equipo, detectar problemas, optimizar |
| CEO | Sale de microgestión | Control global, expansión, estrategia, reinversión |

### Hitos clave

| Semana | Hito |
|---|---|
| S2 | Pipeline completo de leads funcionando end-to-end |
| S4 | Smart Closing, Pricing, Dashboards y Post-venta operativos |
| S6 | Sistema integrado, IA refinada, seguridad y UI pulida |
| S8 | Sistema en producción con datos reales (v1.0.0) |

---

## Arquitectura del Sistema

### Orquestador Híbrido: Event Sourcing + Server-Side RPA

El principio fundacional es la **Segregación de Responsabilidades**. Inmovilla es un sistema cerrado, sin webhooks ni APIs modernas de escritura. Se relega a ser una "Bóveda" (repositorio pasivo de datos legales) mientras se construye un ecosistema moderno, asíncrono y orientado a eventos que lo envuelve y controla desde fuera.

### Las 4 Capas

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 4 — Interfaces Satélite (Las Ventanillas)        │
│  Micro-frontends · WhatsApp Business · Notificaciones   │
├─────────────────────────────────────────────────────────┤
│  CAPA 3 — Plano de Control (El Cerebro)                │
│  Next.js API Routes · Neon Event Store · LangGraph IA   │
├─────────────────────────────────────────────────────────┤
│  CAPA 2 — Workers de Intercepción (RPA Server-Side)    │
│  Ingestion Worker (polling) · Egestion Worker (XHR)     │
├─────────────────────────────────────────────────────────┤
│  CAPA 1 — La Bóveda (Inmovilla CRM)                   │
│  Propiedades · Historiales · Facturas · Demandas        │
└─────────────────────────────────────────────────────────┘
```

**Capa 1 — La Bóveda (Inmovilla CRM):** Fuente de verdad inamovible. Almacena datos finales y legales. No toma decisiones, no mide tiempos, no dispara automatizaciones. Repositorio pasivo que el sistema lee y escribe programáticamente.

**Capa 2 — Workers de Intercepción (RPA Server-Side):**
- **Ingestion Worker** (lectura): Cron-job en Node.js que monitorea Inmovilla por polling programático y scraping headless (Playwright). Detecta cambios y emite eventos inmutables hacia la Capa 3.
- **Egestion Worker** (escritura): Cuando la IA decide actualizar Inmovilla, ejecuta login silente → captura cookies de sesión → raspa token CSRF → dispara XHR clonado a los endpoints internos.

**Capa 3 — Plano de Control (El Cerebro):** Next.js App Router + TypeScript como framework principal. Neon PostgreSQL como Event Store + Job Queue. LangGraph + modelos o3 para flujos agénticos (scoring, clasificación, Smart Matching, Smart Closing, pricing).

**Capa 4 — Interfaces Satélite (Las Ventanillas):** Micro-frontends en Next.js (formularios de post-visita, validación de enlaces, dashboards), WhatsApp Business API para comunicación con compradores y comerciales, y webhooks internos.

---

## Stack Técnico

### Core

| Componente | Tecnología |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Base de datos | Neon (PostgreSQL serverless) |
| Motor IA | LangGraph + modelos o3 (OpenAI) |
| STT | OpenAI Whisper API |
| Workers | Node.js + Playwright |

### Integraciones Externas

| Servicio | Proveedor | Integración |
|---|---|---|
| WhatsApp Business | 360dialog / Twilio | API directa (webhooks + envíos) |
| Firma digital | Signaturit / DocuSign | API REST desde Next.js |
| Calendario | Google Calendar API | Micro-frontend de booking |
| Almacenamiento | S3-compatible | Documentos, contratos, adjuntos |

### Patrones Arquitectónicos

| Patrón | Implementación |
|---|---|
| Event Sourcing | Cambios registrados como eventos inmutables en Neon |
| Job Queue | Tabla `job_queue` en Neon con reintentos e idempotencia |
| Server-Side RPA | Workers que simulan interacción humana con sistemas cerrados |
| Network Interception | Cookies + CSRF + clonación de XHR para escritura en Inmovilla |
| CQRS | Lectura (queries analíticas) separada de escritura (eventos) |

---

## Mapa de Módulos y Dependencias

### Módulos del sistema (por orden de dependencia)

| ID | Módulo | Dependencias | Sprint |
|---|---|---|---|
| M0 | Infraestructura base (DB, Event Store, Job Queue, proyecto Next.js) | Ninguna | S1 |
| M1 | Ingestion Worker (polling/scraping Inmovilla) | M0 | S1 |
| M2 | Egestion Worker (network interception Inmovilla) | M0, M1 | S1 |
| M3 | Motor de Scoring y Priorización de Leads | M0, M1 | S1 |
| M4 | Integración WhatsApp Business API | M0 | S1 |
| M5 | Smart Matching (cruce demandas + ajuste por IA) | M1, M2, M3, M4 | S1 |
| M6 | Sincronización Statefox (Ingestion + Egestion) | M1, M2 | S1 |
| M7 | Motor de Pricing y Posicionamiento | M1, M6 | S2 |
| M8 | Smart Closing (contratos + voz + firma digital) | M1, M2 | S2 |
| M9 | Cadencias post-venta | M4, M0 | S2 |
| M10 | Dashboard Comercial (rentabilidad por persona) | M0, M1 | S2 |
| M11 | Dashboard Colaboradores Externos | M0 | S2 |
| M12 | Bot de Soporte Mental | M4 (WhatsApp), LangGraph | S3 |
| M13 | Dashboard CEO (gobierno estratégico) | M10, M11, M0 | S2 |
| M14 | Integración end-to-end y hardening | Todos | S3–S4 |

### Grafo de dependencias

```
M0 (Infra)
├── M1 (Ingestion) ──┬── M2 (Egestion) ──┬── M5 (Smart Matching)
│                     │                    ├── M6 (Statefox Sync)
│                     │                    ├── M7 (Pricing) ← M6
│                     │                    └── M8 (Smart Closing)
│                     ├── M3 (Scoring) ────┘
│                     └── M10 (Dash Comercial) ──┐
├── M4 (WhatsApp) ──┬── M5                      ├── M13 (Dash CEO)
│                    ├── M9 (Post-venta)         │
│                    └── M12 (Bot Mental)        │
└── M11 (Dash Colaboradores) ───────────────────┘
```

### Correspondencia módulos del plan ↔ flujo operativo

| Flujo operativo (doc.md) | Módulos del plan |
|---|---|
| Subida de propiedad y cruce automático | M0, M1, M5 |
| Notificación automática al comprador | M4, M5 |
| Respuesta del comprador y ajuste de demanda | M2, M4, M5 (Smart Matching) |
| Visita y afinado humano | Capa 4 micro-frontends |
| Sincronización Inmovilla → Statefox | M6 |
| Búsqueda automática en Statefox | M6 (Ingestion Statefox) |
| Validación del comercial | Capa 4 micro-frontend + M4 |
| Envío al comprador y feedback loop | M4, M5, M6 |
| Motor de Pricing | M7 |
| Smart Closing | M8 |
| Dashboard de Rentabilidad por Comercial | M10 |
| Motor de Priorización de Leads | M3 |
| Control de Colaboradores Externos | M11 |
| Automatización Post-Venta | M9 |
| Soporte Mental y Alto Rendimiento | M12 |
| Sistema de Gobierno del CEO | M13 |

---

## Prerrequisitos

### Cuentas y credenciales (obtener ANTES de Semana 1)

| Servicio | Qué se necesita | Estado |
|---|---|---|
| Neon | Proyecto creado, connection string | ☐ Pendiente |
| Inmovilla | Credenciales de acceso (usuario con permisos de lectura/escritura) | ☐ Pendiente |
| Statefox | Credenciales de acceso | ☐ Pendiente |
| OpenAI | API key con acceso a o3 y Whisper | ☐ Pendiente |
| WhatsApp Business | Cuenta con proveedor (360dialog/Twilio), API key, sandbox | ☐ Pendiente |
| Google Calendar | Proyecto en GCP, OAuth credentials | ☐ Pendiente |
| Signaturit / DocuSign | Cuenta sandbox + API key | ☐ Pendiente |
| S3-compatible | Bucket creado, access keys | ☐ Pendiente |
| Vercel (o hosting) | Cuenta para deploy de staging/producción | ☐ Pendiente |
| GitHub / Git remote | Repositorio creado, acceso configurado | ☐ Pendiente |

### Entorno de desarrollo

- Node.js ≥ 20 LTS
- npm o pnpm
- Git configurado
- Editor con soporte TypeScript (VSCode/Cursor)
- Playwright instalable (`npx playwright install`)

### Datos de prueba

- Al menos 1 lead de prueba en Inmovilla
- Al menos 1 propiedad de prueba en Inmovilla
- Al menos 1 demanda de prueba en Inmovilla
- Número de WhatsApp de prueba (sandbox)

---

## Reglas Inquebrantables del Proyecto

### 1. Disciplina Git (No negociable)

#### Estrategia de ramas

```
main              ← producción, siempre deployable
  └─ develop      ← integración, se mergea a main cada sábado post-demo
       ├─ feat/M0-event-store
       ├─ feat/M1-ingestion-worker
       ├─ feat/M2-egestion-worker
       ├─ fix/M1-polling-timeout
       ├─ refactor/M3-scoring-weights
       └─ docs/week-01-retro
```

**Convención de nombres de rama:**

```
<tipo>/<módulo>-<descripción-kebab-case>
```

Tipos permitidos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

#### Formato de commits (Conventional Commits obligatorio)

```
<tipo>(<alcance>): <descripción imperativa en español>

[cuerpo opcional — qué y por qué, no cómo]

[footer opcional — refs a issues, breaking changes]
```

**Ejemplos válidos:**

```
feat(M1): implementar polling básico de propiedades en Inmovilla
fix(M2): corregir extracción de token CSRF en login silente
refactor(M0): migrar event store a schema dedicado en Neon
test(M3): añadir tests unitarios para scoring de compradores
docs(M8): documentar flujo de revisión por voz en Smart Closing
chore(deps): actualizar playwright a v1.42
```

**Reglas de commit:**
- Commits **atómicos**: un commit = un cambio lógico. Prohibido commits tipo "arreglos varios" o "WIP".
- Mínimo **3 commits por día** de trabajo sustantivo.
- Todo commit debe compilar (`npm run build` sin errores).
- Nunca commitear secretos, `.env`, credenciales o tokens.

#### Pull Requests

Cada feature branch se mergea a `develop` mediante PR con:

- **Título:** misma convención que commits.
- **Descripción:** qué cambia, por qué, cómo probarlo.
- **Checklist obligatorio en cada PR:**
  - [ ] Build pasa sin errores
  - [ ] Tests relevantes añadidos o actualizados
  - [ ] Sin secretos ni credenciales hardcodeadas
  - [ ] Tipos de TypeScript correctos (sin `any` injustificado)
  - [ ] Variables de entorno documentadas en `.env.example`

#### Tags y releases semanales

Cada sábado después de la demo, se crea un tag:

```
git tag -a v0.1.0-week-01 -m "Sprint 1.1: Infraestructura base + Ingestion Worker v1"
git push origin v0.1.0-week-01
```

Versionado: `v0.<sprint>.<semana-dentro-del-sprint>-week-<número>`.

### 2. Documentación continua (No negociable)

#### Archivos obligatorios en el repositorio

| Archivo | Propósito | Frecuencia de actualización |
|---|---|---|
| `README.md` | Setup, arquitectura, cómo ejecutar | Cada vez que cambie el setup |
| `CHANGELOG.md` | Historial de cambios por semana/sprint | Cada sábado (pre-demo) |
| `docs/architecture.md` | Diagrama de arquitectura y decisiones técnicas | Cuando se tome una decisión de diseño |
| `docs/adr/` | Architecture Decision Records | Cada decisión significativa |
| `docs/api/` | Documentación de API Routes | Cuando se cree/modifique un endpoint |
| `docs/workers/` | Documentación de Ingestion/Egestion Workers | Cuando se modifique lógica de workers |
| `.env.example` | Variables de entorno necesarias (sin valores reales) | Siempre que se añada una variable |

#### Architecture Decision Records (ADR)

Para cada decisión técnica importante, crear un archivo en `docs/adr/`:

```
docs/adr/
  ├─ 001-event-sourcing-sobre-crud.md
  ├─ 002-playwright-vs-puppeteer.md
  ├─ 003-neon-como-job-queue.md
  └─ ...
```

Formato:

```markdown
# ADR-001: Event Sourcing sobre CRUD

## Estado: Aceptado
## Fecha: 2026-03-09

## Contexto
[Por qué se necesitaba tomar esta decisión]

## Decisión
[Qué se decidió]

## Consecuencias
[Positivas y negativas]
```

### 3. Rutina diaria del developer (No negociable)

#### Inicio de jornada (8:30 – 9:00)

1. `git pull origin develop` — sincronizar.
2. Revisar el tablero de tareas (issues del día).
3. Crear rama para la primera tarea del día si no existe.
4. Escribir en el **Daily Log** (issue fijado o archivo `docs/daily-log.md`):

```markdown
## 2026-03-10 (Lunes - Semana 1)
### Plan del día
- [ ] Tarea 1: ...
- [ ] Tarea 2: ...
### Bloqueantes
- Ninguno / [descripción]
```

#### Durante la jornada (9:00 – 19:00)

- Commits atómicos cada vez que se complete una unidad de trabajo.
- Push al remote **mínimo cada 2 horas** (protección contra pérdida de trabajo).
- Si se bloquea > 30 minutos en un problema: documentarlo como comentario en el issue y pivotar a otra tarea.

#### Cierre de jornada (19:00 – 20:00)

1. Push final de todos los cambios.
2. Actualizar el **Daily Log** con lo completado:

```markdown
### Completado
- [x] Tarea 1: descripción + commit refs
- [ ] Tarea 2: motivo de no completarse
### Notas
- Descubrimiento X sobre la API de Inmovilla...
```

3. Mover issues/tasks al estado correcto.
4. Si hay PR lista: auto-review rápido antes de dejarla.

### 4. Rutina de sábado (Demo Day)

#### Pre-demo (8:30 – 10:00)

1. Mergear PRs aprobadas a `develop`.
2. Actualizar `CHANGELOG.md` con resumen de la semana.
3. Crear tag semanal.
4. Preparar demo: qué funciona, qué se puede mostrar en vivo.
5. Compilar métricas de la semana:
   - Commits realizados.
   - PRs mergeadas.
   - Issues cerrados vs abiertos.
   - Bloqueantes encontrados y resueltos.

#### Demo (10:00 – 12:00)

1. **Mostrar funcionalidad en vivo** (no slides, no teoría).
2. Recorrer el flujo end-to-end hasta donde se ha llegado.
3. Mostrar el código clave (no todo, solo decisiones importantes).
4. Identificar riesgos y bloqueantes para la semana siguiente.

#### Post-demo (12:00 – 14:00)

1. Documentar feedback recibido como issues.
2. Retrospectiva breve: qué funcionó, qué no, qué cambiar.
3. Ajustar prioridades de la semana siguiente si es necesario.
4. Mergear `develop` → `main` si la demo fue exitosa.

#### Tarde del sábado (14:00 – 20:00)

- Refactoring y deuda técnica.
- Documentación pendiente.
- Preparación de la semana siguiente (issues, ramas, investigación).

---

## Plan de Ejecución: 8 Semanas

### Vista general

| Mes | Semanas | Foco | Entregable clave |
|---|---|---|---|
| **Mes 1** | S1–S4 | Infraestructura + Core Business Logic | Workers funcionando, leads ingresándose y escribiéndose en Inmovilla, WhatsApp enviando mensajes, scoring MVP, Smart Closing, Pricing, Dashboards |
| **Mes 2** | S5–S8 | Refinamiento IA + Hardening + Producción | Bot mental, IA refinada v2, seguridad, integración E2E, staging, go-live |

---

## Sprint 1 (Semanas 1–2): Cimientos del Orquestador

> **Objetivo:** Levantar la infraestructura, dominar los mecanismos de lectura/escritura de Inmovilla, y tener el pipeline de leads operativo con scoring, WhatsApp y Smart Matching.

### Semana 1 — Infraestructura Base + Ingeniería Inversa de Inmovilla

#### Lunes (Día 1) — M0: Event Store + Job Queue

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:00 | Setup del proyecto: estructura de carpetas, ESLint, Prettier, Husky (pre-commit hooks), `.env.example` | Repo con scaffolding completo |
| AM | 10:00–12:00 | Configurar Neon: crear proyecto, conexión desde Next.js, pool de conexiones | Conexión DB verificada con test de ping |
| PM | 12:00–14:00 | Diseñar schema de Event Store: tablas `events`, `job_queue`, `projections_checkpoint` | Migration v1 ejecutada en Neon |
| PM | 14:00–16:00 | Implementar capa de abstracción del Event Store: `appendEvent()`, `getEventsByAggregate()`, `getEventsSince()` | Funciones core con tests |
| PM | 16:00–18:00 | Implementar Job Queue: `enqueueJob()`, `dequeueJob()`, `markCompleted()`, `markFailed()` con reintentos | Job Queue funcional con test de ciclo completo |
| PM | 18:00–20:00 | Documentar ADR-001 (Event Sourcing), ADR-002 (Neon como Job Queue). Actualizar README. Push final. | ADRs + README actualizado |

**Git:** mínimo 6 commits. Branch: `feat/M0-event-store`, `feat/M0-job-queue`.

**Tipos de eventos a definir:**
- `PROPIEDAD_CREADA`, `PROPIEDAD_MODIFICADA`, `ESTADO_CAMBIADO`
- `LEAD_INGESTADO`, `SLA_INICIADO`
- `DEMANDA_ACTUALIZADA`, `MATCH_GENERADO`

#### Martes (Día 2) — M1/M2: Ingeniería Inversa de Inmovilla

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:00 | **Ingeniería inversa Fase 1:** Login manual, capturar con DevTools todas las peticiones de red (Network tab). Documentar endpoints descubiertos. | `docs/workers/inmovilla-endpoints.md` |
| AM | 10:00–12:30 | **Ingeniería inversa Fase 2:** Identificar flujo de autenticación (cookies de sesión, tokens CSRF, headers obligatorios). Documentar cada paso. | Flujo de auth documentado |
| PM | 12:30–15:00 | **Ingeniería inversa Fase 3:** Mapear operaciones CRUD principales: crear lead, modificar demanda, cambiar estado, subir documento. Capturar XHR de cada una. | Catálogo de operaciones con XHR samples |
| PM | 15:00–17:00 | Instalar Playwright. Escribir script de login silente: navegar a Inmovilla, rellenar credenciales, capturar cookies y CSRF token. | Script `scripts/inmovilla-login.ts` funcional |
| PM | 17:00–19:00 | Escribir script de lectura: listar propiedades activas desde Inmovilla (vía API de lectura si existe, o scraping headless). | Script `scripts/inmovilla-read-properties.ts` |
| PM | 19:00–20:00 | Daily log, push, organizar descubrimientos. | Documentación actualizada |

**Git:** mínimo 5 commits. Branch: `feat/M1-inmovilla-reverse-eng`.

#### Miércoles (Día 3) — M1 + M2: Workers de Lectura y Escritura

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | Implementar `Ingestion Worker` v1: cron-job que ejecuta lectura de propiedades cada X minutos. Detectar cambios comparando con estado previo (diff). | Worker ejecutable con detección de cambios |
| AM | 10:30–12:30 | Conectar Ingestion Worker al Event Store: cuando detecta un cambio, emitir evento (`PROPIEDAD_CREADA`, `PROPIEDAD_MODIFICADA`, `ESTADO_CAMBIADO`). | Eventos fluyendo a Neon |
| PM | 12:30–14:30 | Implementar Ingestion Worker para demandas: leer demandas activas de Inmovilla, detectar cambios, emitir eventos. | Lectura de demandas funcional |
| PM | 14:30–17:00 | **Egestion Worker v1:** Implementar función de escritura genérica: `writeToInmovilla(operation, payload)`. Usa login silente, captura CSRF, ejecuta XHR clonado. | Función core de escritura |
| PM | 17:00–19:00 | Test del Egestion Worker: escribir un campo de prueba en un lead de test en Inmovilla y verificar que se guardó. | Escritura verificada end-to-end |
| PM | 19:00–20:00 | Daily log, push, documentar limitaciones descubiertas. | |

**Git:** mínimo 6 commits. Branches: `feat/M1-ingestion-worker`, `feat/M2-egestion-worker`.

#### Jueves (Día 4) — M0: API Routes + Event Consumer + Proyecciones

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | Crear API Routes en Next.js: `POST /api/events` (recibir eventos de workers), `GET /api/events/:aggregate` (consultar eventos). | API Routes funcionales |
| AM | 10:30–12:30 | Crear API Route de health check y status de workers: `GET /api/workers/status`. | Endpoint de monitoreo |
| PM | 12:30–15:00 | Implementar el **procesador de eventos**: handler que escucha nuevos eventos en la `job_queue` y ejecuta acciones correspondientes (patrón Consumer). | Consumer funcional con retry logic |
| PM | 15:00–17:00 | Crear las proyecciones básicas: materializar estado actual de propiedades y demandas desde eventos (tabla `properties_current`, `demands_current`). | Proyecciones sincronizadas |
| PM | 17:00–19:00 | Tests de integración: simular ciclo completo — Ingestion detecta cambio → emite evento → Consumer procesa → proyección actualizada. | Test E2E del pipeline |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branch: `feat/M0-api-routes`, `feat/M0-event-consumer`.

#### Viernes (Día 5) — M6: Statefox + Tipos de Dominio + Refactoring

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | **Ingeniería inversa Statefox:** Repetir proceso del martes con Statefox. Mapear auth, endpoints, operaciones disponibles. | `docs/workers/statefox-endpoints.md` |
| AM | 10:30–13:00 | Implementar login silente en Statefox + lectura básica de datos. | Script `scripts/statefox-login.ts` |
| PM | 13:00–15:00 | Crear tipos TypeScript para todas las entidades del dominio: `Property`, `Demand`, `Lead`, `Event`, `Job`, `Match`. | `types/domain.ts` completo |
| PM | 15:00–17:00 | Refactoring del código de la semana: extraer utilidades comunes, limpiar imports, asegurar tipado estricto. | Codebase limpio |
| PM | 17:00–19:00 | Escribir tests unitarios para Event Store y Job Queue. | Test suite con cobertura > 80% en core |
| PM | 19:00–20:00 | Preparar demo del sábado: qué se puede mostrar, secuencia. | Notas de demo |

**Git:** mínimo 5 commits.

#### Sábado (Día 6) — DEMO WEEK 1

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear PRs, actualizar CHANGELOG, crear tag `v0.1.0-week-01` |
| AM | 10:00–12:00 | **DEMO:** Event Store funcionando, Ingestion Worker leyendo de Inmovilla en vivo, Egestion Worker escribiendo un dato de prueba |
| PM | 12:00–14:00 | Retrospectiva + documentar feedback |
| PM | 14:00–17:00 | Refactoring, deuda técnica, documentación |
| PM | 17:00–20:00 | Investigación para semana 2: LangGraph setup, WhatsApp Business API docs |

**Entregable semanal:**
- ✅ Event Store + Job Queue operativos en Neon.
- ✅ Ingestion Worker leyendo propiedades y demandas de Inmovilla.
- ✅ Egestion Worker capaz de escribir en Inmovilla.
- ✅ Documentación de endpoints de Inmovilla y Statefox.
- ✅ Estructura de proyecto con tipos, tests y ADRs.

---

### Semana 2 — Lead Scoring + WhatsApp + Smart Matching v1

#### Lunes (Día 7) — M4: WhatsApp Business API

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | Configurar WhatsApp Business API: cuenta con proveedor (360dialog/Twilio), obtener API keys, verificar sandbox. | Cuenta WA Business configurada |
| AM | 10:30–13:00 | Implementar servicio de envío de WhatsApp: `sendWhatsAppMessage(to, template, variables)`. API Route: `POST /api/whatsapp/send`. | Envío de mensajes funcional |
| PM | 13:00–15:00 | Implementar webhook de recepción de WhatsApp: `POST /api/whatsapp/webhook`. Parsear mensajes entrantes, emitir eventos `WHATSAPP_RECIBIDO`. | Webhook funcional |
| PM | 15:00–17:00 | Crear plantillas de WhatsApp: mensaje de match, mensaje de seguimiento, mensaje de validación. Someter a aprobación de Meta. | Plantillas creadas y en revisión |
| PM | 17:00–19:00 | Tests: enviar mensaje de prueba, recibir respuesta, verificar evento en Neon. | Ciclo WA completo verificado |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branch: `feat/M4-whatsapp-integration`.

#### Martes (Día 8) — M3: Scoring + SLA + Routing

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **motor de scoring MVP (reglas)**: `calculateScore(lead)` con pesos: Pclose 0.55, Value 0.30, Urgency 0.15. Reglas de puntuación para compradores y propietarios. | Función de scoring con tests |
| AM | 11:00–13:00 | Implementar **SLA automático**: según score, asignar SLA (≥80: <5min, 60–79: <30min, 40–59: <2h, <40: cadencia) y crear job de seguimiento en la Job Queue. | SLAs funcionando |
| PM | 13:00–15:00 | Implementar **routing de leads**: asignar comercial por ciudad + carga + rendimiento. Tabla `comerciales` en Neon. | Routing funcional |
| PM | 15:00–17:00 | Conectar scoring al flujo: Ingestion Worker detecta lead → scoring → SLA → asignación → notificación WhatsApp al comercial. | Flujo semi-automatizado |
| PM | 17:00–19:00 | Implementar cadencias automáticas: cron-job que revisa leads sin respuesta y envía follow-ups (D+1, D+3, D+7). | Cadencias programadas |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 6 commits. Branch: `feat/M3-lead-scoring`.

**Scoring de referencia (compradores):**

| Criterio | Puntos |
|---|---|
| Preaprobación hipotecaria | +25 |
| Presupuesto definido | +15 |
| Plazo ≤ 30 días | +20 |
| Mensaje con detalles (zona, tipología) | +10 |
| Referido | +15 |
| "Solo estoy mirando" | −20 |

**Scoring de referencia (propietarios):**

| Criterio | Puntos |
|---|---|
| Urgencia de venta | +20 |
| Precio cercano a mercado | +15 |
| Exclusiva aceptable / motivación | +15 |
| Documentación disponible | +10 |
| "Quiero probar sin agencia" | −25 |

#### Miércoles (Día 9) — M5: Smart Matching + LangGraph

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | Setup LangGraph: instalar dependencias, configurar conexión OpenAI, crear primer grafo de prueba. | LangGraph operativo |
| AM | 10:30–13:00 | Implementar **agente de clasificación de respuestas WhatsApp**: recibe texto libre del comprador → extrae intención (me encaja / no encaja / busco diferente) + variables (precio, zona, metros, extras). | Agente de NLU funcional |
| PM | 13:00–15:00 | Implementar **Smart Matching v1**: cuando el agente clasifica "no me encaja" + extrae variables → emitir evento `DEMANDA_ACTUALIZADA` → Egestion Worker escribe en Inmovilla. | Smart Matching end-to-end |
| PM | 15:00–17:00 | Implementar **cruce de demandas**: función `matchDemandsToProperty(property)` que cruza demandas activas en Neon contra una nueva propiedad. | Cruce funcional |
| PM | 17:00–19:00 | Tests del flujo completo: nueva propiedad → cruce → match → WhatsApp al comprador → respuesta → ajuste de demanda → recruce. | Test E2E del módulo 5 |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branch: `feat/M5-smart-matching`.

#### Jueves (Día 10) — Robustez de Workers + Micro-frontends

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–10:30 | Robustez del Ingestion Worker: manejo de errores, reconexión automática, logging estructurado, métricas de ejecución. | Worker robusto y observable |
| AM | 10:30–13:00 | Robustez del Egestion Worker: retry con backoff exponencial, dead-letter queue para fallos permanentes, alertas. | Worker resiliente |
| PM | 13:00–15:30 | Implementar **micro-frontend post-visita**: formulario Next.js donde el comercial marca interés (alto/medio/bajo) + notas. Conectado a API Route → evento en Neon. | Micro-frontend funcional |
| PM | 15:30–17:30 | Implementar **micro-frontend de agenda**: selección de hora de visita, integración básica con Google Calendar API. | Formulario de booking |
| PM | 17:30–19:30 | Conectar micro-frontends al flujo principal: visita → interés → scoring actualizado → decisión de sync a Statefox. | Flujo integrado |
| PM | 19:30–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branches: `feat/M1-worker-resilience`, `feat/M4-micro-frontend-visita`.

#### Viernes (Día 11) — M6: Statefox Sync + Validación + Refactoring

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **sync Inmovilla → Statefox v1**: cuando demanda cumple criterios → Egestion Worker envía datos a Statefox (presupuesto, zonas, tipología, prioridades reales). | Sync funcional |
| AM | 11:00–13:00 | Implementar **detección de enlace Statefox**: Ingestion Worker de Statefox detecta generación de enlace privado → evento `ENLACE_STATEFOX_GENERADO`. | Detección funcional |
| PM | 13:00–15:00 | Implementar **flujo de validación**: notificación al comercial → micro-frontend de aprobación (revisión 30–60s) → evento `ENLACE_VALIDADO` → envío al comprador por WhatsApp. SLA de validación: 2 horas, escalado a jefe de zona si se incumple. | Flujo de validación end-to-end |
| PM | 15:00–17:00 | Refactoring general de Sprint 1: limpiar código, extraer utilidades, mejorar tipos. | Codebase limpio |
| PM | 17:00–19:00 | Tests de integración del Sprint 1 completo. | Suite de tests robusta |
| PM | 19:00–20:00 | Preparar demo del sábado. | |

**Git:** mínimo 5 commits. Branch: `feat/M6-statefox-sync`.

#### Sábado (Día 12) — DEMO WEEK 2

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.1.1-week-02` |
| AM | 10:00–12:00 | **DEMO:** Flujo completo en vivo: lead entra → scoring → WhatsApp al comercial → respuesta del comprador → Smart Matching → cruce → sync Statefox → validación → envío enlace |
| PM | 12:00–14:00 | Retrospectiva Sprint 1 |
| PM | 14:00–20:00 | Deuda técnica, docs, prep Sprint 2 |

**Entregable Sprint 1:**
- ✅ Pipeline completo de leads (ingestión → scoring → asignación → WhatsApp).
- ✅ Smart Matching v1 (ajuste de demanda por IA).
- ✅ Sync bidireccional Inmovilla ↔ Statefox.
- ✅ Micro-frontends de post-visita y agenda.
- ✅ Workers resilientes con retry y logging.

---

## Sprint 2 (Semanas 3–4): Módulos Avanzados de Negocio

> **Objetivo:** Smart Closing, Motor de Pricing, Post-Venta, Dashboard Comercial, Dashboard Colaboradores, Dashboard CEO.

### Semana 3 — Smart Closing + Motor de Pricing

#### Lunes (Día 13) — M8: Motor de Plantillas de Contratos

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Diseñar el **motor de plantillas de contratos**: estructura de variables, bloques condicionales, tipos de documento (señal, arras, anexo mobiliario). Crear tipos TypeScript. | `types/contracts.ts` + diseño documentado |
| AM | 11:00–13:00 | Implementar generación programática de docx: usando librería TypeScript (docx.js o similar), crear plantilla de arras con variables inyectables. | Generación de docx funcional |
| PM | 13:00–15:30 | Implementar **extracción de datos para contratos**: función que recopila comprador + vendedor + inmueble + operación desde Neon + Inmovilla y construye el payload completo. | Función de extracción completa |
| PM | 15:30–18:00 | Implementar **validación de campos obligatorios**: si faltan datos (DNI, domicilio, precio, plazos), emitir evento `DATOS_INCOMPLETOS` y crear tarea para el comercial. | Validación funcional |
| PM | 18:00–20:00 | Test: cambiar estado en Inmovilla → Ingestion detecta → extraer datos → generar borrador v1 → guardar en S3. | Flujo de generación end-to-end |

**Git:** mínimo 5 commits. Branch: `feat/M8-smart-closing-templates`.

**Variables del motor de plantillas:**
- Variables: importes, plazos, honorarios, domicilios, DNIs, cuentas.
- Bloques condicionales: arras penitenciales vs confirmatorias, condición hipotecaria sí/no, entrega de llaves en firma vs fecha posterior, mobiliario incluido (anexo).

#### Martes (Día 14) — M8: Revisión por Voz + STT + Versionado

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Integrar **OpenAI Whisper API**: API Route que recibe audio → transcribe a texto. | Endpoint STT funcional |
| AM | 11:00–13:00 | Implementar **intérprete de instrucciones verbales** con LangGraph: recibe transcripción → extrae acciones estructuradas (cambiar honorarios, tipo de arras, plazos, cláusulas). | Agente de interpretación |
| PM | 13:00–15:00 | Conectar intérprete al motor de plantillas: instrucción interpretada → modificar variables/bloques → regenerar contrato v2. | Ciclo voz→cambio→regeneración |
| PM | 15:00–17:00 | Implementar **micro-frontend de revisión de contratos**: interfaz donde el gestor ve el borrador, graba audio, ve cambios aplicados, aprueba. | UI de Smart Closing |
| PM | 17:00–19:00 | Implementar versionado de contratos: naming estándar (`OP-2026-XXXX_Arras_v1.pdf`), registro de versiones en Neon (`CONTRATO_VERSIONADO`), diff de cambios entre versiones. | Versionado funcional |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branch: `feat/M8-smart-closing-voice`.

#### Miércoles (Día 15) — M8: Firma Digital + M7: Motor de Pricing

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Integrar **firma digital** (Signaturit o DocuSign): API para enviar documento a firma, webhook para recibir confirmación de firma. Recordatorios automáticos si no se firma. | Integración de firma |
| AM | 11:00–13:00 | Flujo post-firma: guardar documento firmado → adjuntar en Inmovilla vía Egestion Worker → actualizar estado de operación. | Flujo post-firma end-to-end |
| PM | 13:00–15:30 | Comenzar **Motor de Pricing v1**: función que extrae variables del inmueble de Neon (precio, zona, metros, tipología, estado, extras) y construye el request de comparación para Statefox. | Extracción de variables |
| PM | 15:30–18:00 | Implementar **análisis de cluster comparativo**: recibir comparables de Statefox (misma zona ±15–20% metros, tipología similar) → calcular precio medio €/m², desviación, rango. | Análisis estadístico funcional |
| PM | 18:00–20:00 | Implementar **motor de recomendación con LangGraph**: recibe análisis estadístico → genera diagnóstico textual + recomendaciones estratégicas (mantener/ajustar/reposicionar). | Agente de pricing |

**Git:** mínimo 5 commits. Branches: `feat/M8-firma-digital`, `feat/M7-pricing-engine`.

#### Jueves (Día 16) — M7: UI de Pricing + M9: Post-Venta

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **informe de pricing** para el comercial: micro-frontend con semáforo (VERDE: bien posicionado, AMARILLO: riesgo comercial, ROJO: fuera de mercado), diagnóstico, recomendaciones accionables. | UI de informe de pricing |
| AM | 11:00–13:00 | Conectar Motor de Pricing al flujo: Ingestion detecta alta/cambio → análisis → informe al comercial vía WhatsApp + micro-frontend. | Flujo automatizado |
| PM | 13:00–15:00 | Implementar triggers adicionales de pricing: inmueble sin leads X días, inmueble con visitas sin ofertas (cron-job que evalúa). | Triggers de reevaluación |
| PM | 15:00–17:30 | Implementar **cadencias de post-venta** (M9): cron-job que evalúa "días desde cierre" (`OPERACION_CERRADA`) y ejecuta: D0 agradecimiento, D3–7 soporte, D10–14 reseña, D21–30 referidos, D90–180 re-captación. | Cadencias programadas |
| PM | 17:30–19:30 | Implementar micro-frontend post-venta: botón "Todo OK" / "Necesito ayuda" + enlace a mini-guía. Sistema de incidencias: si ayuda → pausa cadencia, crea tarea, reanuda al resolver. | UI post-venta |
| PM | 19:30–20:00 | Daily log, push. | |

**Git:** mínimo 6 commits. Branches: `feat/M7-pricing-ui`, `feat/M9-post-sale`.

#### Viernes (Día 17) — M9: Reseñas/Referidos + M10: Dashboard Comercial

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **solicitud de reseñas**: verificar no-incidencias → enviar solicitud Google Review vía WhatsApp → recordatorio si no responde. | Flujo de reseñas |
| AM | 11:00–13:00 | Implementar **activación de referidos**: mensaje personalizado + enlace a formulario de referido (micro-frontend). Segmentación: comprador residencial / inversor / vendedor. | Flujo de referidos |
| PM | 13:00–15:00 | Comenzar **Dashboard Comercial v1** (M10): diseño del schema de métricas en Neon, queries analíticas para KPIs principales (conversión, facturación, tiempo medio de cierre). | Schema + queries |
| PM | 15:00–17:00 | Implementar API Routes para dashboard: `GET /api/dashboard/comerciales`, `GET /api/dashboard/comercial/:id`. | Endpoints de datos |
| PM | 17:00–19:00 | Tests de integración de Smart Closing y Motor de Pricing end-to-end. | Tests suite |
| PM | 19:00–20:00 | Preparar demo sábado. | |

**Git:** mínimo 5 commits.

#### Sábado (Día 18) — DEMO WEEK 3

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.2.0-week-03` |
| AM | 10:00–12:00 | **DEMO:** Smart Closing en vivo (generar contrato + revisión por voz + firma), Motor de Pricing con informe real, cadencias post-venta |
| PM | 12:00–20:00 | Retrospectiva, deuda técnica, documentación |

---

### Semana 4 — Dashboards + Colaboradores Externos

#### Lunes (Día 19) — M10: Dashboard Comercial UI + Clasificación

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | Implementar **UI Dashboard Comercial**: micro-frontend con tabla de métricas por comercial, gráficos de conversión, ranking de rentabilidad. | Dashboard funcional |
| PM | 12:00–15:00 | Implementar **clasificación automática de comerciales**: reglas que asignan perfil (top performer / productivo ineficiente / dependiente del lead caliente / bajo rendimiento estructural). | Clasificación funcional |
| PM | 15:00–18:00 | Implementar **alertas del dashboard**: cron-job que detecta caída de 2 semanas, SLA incumplido, desviación vs media → notifica vía WhatsApp. | Alertas funcionales |
| PM | 18:00–20:00 | Implementar vistas por rol (CEO ve todo, jefe de zona ve su equipo, comercial ve solo su perfil). | Control de acceso |

**Git:** mínimo 5 commits. Branch: `feat/M10-dashboard-comercial`.

**Métricas clave del dashboard:**

| Métrica | Descripción |
|---|---|
| Conversión lead → visita | % de leads que llegan a visita |
| Conversión visita → cierre | % de visitas que terminan en cierre |
| Tiempo medio de cierre | Días desde lead hasta firma |
| Facturación por operación | Ingresos medios por cierre |
| Facturación mensual | Ingresos totales/mes |
| Ingresos por lead asignado | Eficiencia de asignación |
| % leads perdidos por falta de seguimiento | Oportunidades desperdiciadas |

#### Martes (Día 20) — M11: Colaboradores Externos

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Diseñar schema de **colaboradores externos** en Neon: entidad colaborador, tipo (banco/abogado/tasador/arquitecto), ciudad, SLA, hitos, métricas. | Schema + migrations |
| AM | 11:00–13:00 | Implementar **micro-frontend portal de colaboradores**: interfaz donde banco/abogado/tasador ve sus operaciones asignadas, sube documentos, actualiza estados. | Portal funcional |
| PM | 13:00–15:30 | Implementar **tracking de hitos**: cada cambio de estado del colaborador registra timestamp en Neon. Cálculo automático de tiempos. Hitos estándar por tipo (banco: documentación → estudio → preaprobación → aprobación; abogado: revisión → observaciones → validación). | Tracking funcional |
| PM | 15:30–18:00 | Implementar **alertas SLA de colaboradores**: cron-job que detecta retrasos → alerta al jefe de zona o CEO según severidad. | Alertas funcionales |
| PM | 18:00–20:00 | Implementar **clasificación automática de colaboradores**: partner estratégico / funcional / lento / crítico (basada en datos, no afinidad). | Clasificación funcional |

**Git:** mínimo 5 commits. Branch: `feat/M11-colaboradores-externos`.

#### Miércoles (Día 21) — M11: Dashboard Colaboradores + M13: Dashboard CEO

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **Dashboard Colaboradores**: UI con ranking por impacto en facturación, tiempos medios, semáforos, recomendaciones. | Dashboard funcional |
| AM | 11:00–13:00 | Implementar **recomendaciones automáticas de LangGraph** para colaboradores: concentrar operaciones en partners, reducir en lentos, alertar sobre críticos. | Recomendaciones con IA |
| PM | 13:00–16:00 | Comenzar **Dashboard CEO** (M13): integrar datos de todos los módulos. Implementar las 6 capas del gobierno estratégico. API Routes para datos consolidados. | Schema + API Routes |
| PM | 16:00–19:00 | Implementar **Capa 1 del Dashboard CEO — Visión Ejecutiva**: semáforos globales, facturación vs objetivo, EBITDA, cash, margen por operación. | UI ejecutiva v1 |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits. Branches: `feat/M11-dashboard`, `feat/M13-dashboard-ceo`.

#### Jueves (Día 22) — M13: Dashboard CEO (Capas 2–6)

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | **Capa 2 — Rendimiento por ciudad**: comparativa Córdoba/Málaga/Sevilla, n.º comerciales, carga media, propiedades activas, operaciones/mes, facturación/mes, rentabilidad por comercial, coste de oportunidad. | Vista por ciudad |
| AM | 11:00–13:00 | **Capa 4 — Diagnóstico y recomendaciones automáticas con LangGraph**: analizar métricas → generar recomendaciones textuales justificadas con datos (contratar, expandir, intervenir proceso). | Motor de recomendaciones |
| PM | 13:00–15:00 | **Capa 5 — Motor de expansión**: evaluar criterios por ciudad candidata (facturación estable, margen ≥X%, cash disponible, capacidad de liderazgo), generar recomendación de expansión. | Evaluador de expansión |
| PM | 15:00–17:00 | **Capa 6 — Control financiero**: costes fijos/variables, coste por operación, ROI de automatizaciones, cuánto reinvertir y en qué. | Vista financiera |
| PM | 17:00–19:00 | Refactoring general de dashboards: componentes reutilizables, estilos consistentes, responsive. | UI pulida |
| PM | 19:00–20:00 | Daily log, push. | |

**Git:** mínimo 5 commits.

#### Viernes (Día 23) — Integración Sprint 2 + Feedback Loop

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Tests de integración de todos los dashboards. Verificar que los datos fluyen correctamente desde eventos hasta visualización. | Tests suite |
| AM | 11:00–13:00 | Implementar **feedback loop completo del comprador**: selección en Statefox → captura por Ingestion Worker → LangGraph interpreta → actualiza demanda en Neon → Egestion Worker escribe en Inmovilla → recruce automático. | Feedback loop end-to-end |
| PM | 13:00–16:00 | **Integración end-to-end Sprint 2**: verificar que todos los módulos interactúan correctamente. Ejecutar flujo completo desde lead hasta cierre. | Flujo verificado |
| PM | 16:00–19:00 | Corregir bugs encontrados en integración. Hardening de error handling. | Bugs resueltos |
| PM | 19:00–20:00 | Preparar demo + CHANGELOG. | |

**Git:** mínimo 5 commits.

#### Sábado (Día 24) — DEMO WEEK 4 (Fin Mes 1)

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.2.1-week-04` |
| AM | 10:00–12:00 | **DEMO MES 1:** Recorrido completo del sistema: dashboards CEO y comercial, Smart Closing con voz, Motor de Pricing, Portal de colaboradores, cadencias post-venta |
| PM | 12:00–14:00 | Retrospectiva Sprint 2 + retrospectiva de Mes 1 |
| PM | 14:00–20:00 | Deuda técnica, documentación exhaustiva del mes, planificación ajustada del Mes 2 |

**Entregable Sprint 2 (Mes 1 completo):**
- ✅ Smart Closing funcional (generación → voz → firma digital).
- ✅ Motor de Pricing con informes y recomendaciones IA.
- ✅ Post-venta con cadencias, incidencias y reseñas.
- ✅ Dashboard Comercial con clasificación y alertas.
- ✅ Dashboard Colaboradores con tracking y SLAs.
- ✅ Dashboard CEO v1 con visión ejecutiva y recomendaciones (6 capas).

---

## Sprint 3 (Semanas 5–6): Bot Mental + Refinamiento IA + Hardening

> **Objetivo:** Bot de soporte mental, refinar todos los flujos de IA, robustez, observabilidad, seguridad e integración end-to-end.

### Semana 5 — Bot de Soporte Mental + Refinamiento Smart Matching

#### Lunes (Día 25) — M12: Bot de Soporte Mental

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Diseñar el **grafo LangGraph del Bot de Soporte Mental**: flujos de bloqueo (miedo/inseguridad/presión/ego/fatiga), preparación pre-cierre, simulación de objeciones, descarga emocional, enfoque, crecimiento. | Diseño del grafo documentado |
| AM | 11:00–13:00 | Implementar el grafo base: nodo raíz → clasificación del estado mental (tipo de bloqueo, nivel de energía, foco vs dispersión) → routing a subflujo correspondiente. | Grafo base funcional |
| PM | 13:00–15:30 | Implementar **subflujo de preparación pre-cierre**: 5 preguntas guiadas, anclajes de seguridad, simulación de objeciones, micro-rutinas pre-cierre. | Subflujo funcional |
| PM | 15:30–18:00 | Implementar **subflujo de bloqueo**: detección de tipo (miedo, ego, fatiga), ejercicios de reencuadre de 2–5 min, acción inmediata (no teoría). | Subflujo funcional |
| PM | 18:00–20:00 | Conectar bot a WhatsApp Business API como canal privado. El comercial escribe al bot y recibe respuesta del grafo LangGraph. Confidencialidad garantizada. | Bot accesible vía WhatsApp |

**Git:** mínimo 5 commits. Branch: `feat/M12-bot-mental`.

#### Martes (Día 26) — M12: Desarrollo Continuo + Refinamiento IA

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **programas de desarrollo continuo**: micro-ejercicios diarios, retos semanales (mentalidad alto ticket, gestión rechazo, identidad closer, disciplina emocional) → cadencia automática vía WhatsApp. | Cadencias de desarrollo |
| AM | 11:00–13:00 | Implementar **Capa 5 del bot — Feedback estratégico**: métricas agregadas de uso sin exponer conversaciones → alertas de riesgo operativo al CEO (caída de energía prolongada, bloqueo recurrente, sobrecarga). | Reporting agregado |
| PM | 13:00–15:00 | Integrar bot con contexto CRM (sin invadir): el bot sabe si hoy hay cierres pendientes, si perdió operación reciente, si está en racha. No accede a facturación individual. | Contexto CRM integrado |
| PM | 15:00–17:30 | **Refinar Smart Matching v2**: mejorar prompts de LangGraph para mejor extracción de variables desde texto libre. Añadir más edge cases. | Smart Matching v2 |
| PM | 17:30–20:00 | Refinar **scoring de leads v2**: añadir más señales (origen, tipo de mensaje, historial), ajustar pesos basado en datos acumulados. | Scoring v2 |

**Git:** mínimo 5 commits.

#### Miércoles (Día 27) — Refinamiento IA + Observabilidad

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | **Refinar Motor de Pricing v2**: mejorar prompts de recomendación, añadir análisis de tendencia temporal, mejorar formato de informe. | Pricing v2 |
| AM | 11:00–13:00 | **Refinar Smart Closing v2**: mejorar intérprete de instrucciones verbales, añadir más cláusulas soportadas, mejorar fallback de ambigüedad (preguntar al gestor si confidence baja). | Smart Closing v2 |
| PM | 13:00–16:00 | Implementar **observabilidad completa**: logging estructurado (JSON) en todos los workers y API Routes, métricas de latencia, errores, throughput. | Sistema de logging |
| PM | 16:00–18:00 | Implementar **panel de health**: micro-frontend que muestra estado de todos los workers, último poll exitoso, errores recientes, cola de jobs pendientes. | Health panel |
| PM | 18:00–20:00 | Tests de carga: simular múltiples leads simultáneos, verificar que Job Queue maneja concurrencia sin duplicados. | Tests de carga |

**Git:** mínimo 5 commits.

#### Jueves (Día 28) — Hardening de Workers

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | **Hardening Ingestion Worker**: manejar cambios de UI en Inmovilla (selectores rotos), implementar fallback a selectores alternativos, alertar si scraping falla. | Worker hardened |
| AM | 11:00–13:00 | **Hardening Egestion Worker**: implementar circuit breaker (si X escrituras fallan → pausar y alertar), verificación post-escritura (leer tras escribir). | Worker hardened |
| PM | 13:00–15:30 | Implementar **idempotencia total**: verificar que reprocessar eventos no causa duplicados ni inconsistencias. | Idempotencia verificada |
| PM | 15:30–18:00 | Implementar **dead-letter queue**: jobs que fallan N veces se mueven a DLQ con contexto completo para debugging manual. | DLQ funcional |
| PM | 18:00–20:00 | Documentar todo el sistema de Workers: `docs/workers/ingestion.md`, `docs/workers/egestion.md`, diagramas de flujo. | Docs de workers |

**Git:** mínimo 5 commits.

#### Viernes (Día 29) — Auth + Seguridad

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–11:00 | Implementar **autenticación y autorización** en micro-frontends: login para comerciales, gestores, CEO. Roles y permisos por vista. | Auth funcional |
| AM | 11:00–13:00 | Implementar **protección de API Routes**: middleware de auth, rate limiting, validación de input (zod). | API segura |
| PM | 13:00–16:00 | Tests de seguridad: verificar que un comercial no puede ver datos de otro, que roles se respetan, que API Routes no aceptan payloads malformados. | Tests de seguridad |
| PM | 16:00–19:00 | Refactoring y cleanup de Sprint 3. | Codebase limpio |
| PM | 19:00–20:00 | Preparar demo. | |

#### Sábado (Día 30) — DEMO WEEK 5

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.3.0-week-05` |
| AM | 10:00–12:00 | **DEMO:** Bot de soporte mental en vivo, panel de health, mejoras de IA (Smart Matching v2, Pricing v2, Smart Closing v2), auth |
| PM | 12:00–20:00 | Retrospectiva, deuda técnica |

---

### Semana 6 — Integración End-to-End + Refinamiento UI

#### Lunes (Día 31) — Test de Integración E2E

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM–PM | 8:30–14:00 | **Test de integración end-to-end completo**: ejecutar el flujo real desde lead de Idealista hasta cierre de operación, pasando por todos los módulos. Documentar cada paso y resultado. | Reporte de integración |
| PM | 14:00–20:00 | Corregir todos los bugs encontrados en integración. Priorizar por criticidad. | Bugs resueltos |

#### Martes (Día 32) — UI Final

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | **Pulir UI de todos los micro-frontends**: diseño consistente, responsive, accesibilidad, estados de loading/error. | UI pulida |
| PM | 13:00–18:00 | **Pulir Dashboard CEO**: visualizaciones claras, semáforos, drill-down desde visión ejecutiva hasta detalle por comercial/ciudad. | Dashboard CEO final |
| PM | 18:00–20:00 | **Pulir Dashboard Comercial**: gráficos de tendencia, comparativa con media, objetivos mensuales visuales. | Dashboard Comercial final |

#### Miércoles (Día 33) — Notificaciones + Aprendizaje + Documentación API

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | Implementar **notificaciones unificadas**: módulo central que decide cuándo y cómo notificar (WhatsApp, email, UI push). Sin sobre-notificar. | Módulo de notificaciones |
| PM | 12:00–16:00 | Implementar **feedback loop de aprendizaje del scoring**: query que analiza leads cerrados vs no cerrados, recalcular pesos de scoring. | Auto-calibración |
| PM | 16:00–20:00 | Documentación API: todos los endpoints documentados con request/response examples en `docs/api/`. | Documentación API |

#### Jueves (Día 34) — Performance + Arquitectura Final

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | **Performance tuning**: queries de Neon optimizadas (índices, explain analyze), caching donde sea necesario, lazy loading en UIs. | Rendimiento optimizado |
| PM | 13:00–18:00 | **Documentación de arquitectura final**: diagrama actualizado, flujos de datos, decisiones técnicas, guía de despliegue. | `docs/architecture.md` completo |
| PM | 18:00–20:00 | Actualizar `README.md` con setup completo, variables de entorno, cómo ejecutar cada componente. | README final |

#### Viernes (Día 35) — Tests Completos + Runbook

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM–PM | 8:30–16:00 | **Test suite completo**: ejecutar todos los tests (unit, integration, E2E). Corregir fallos. Asegurar cobertura > 70%. | Tests verdes |
| PM | 16:00–19:00 | Escribir **runbook de operaciones**: qué hacer si un worker falla, si Inmovilla cambia su UI, si WhatsApp rechaza mensajes, si Neon tiene problemas. | `docs/runbook.md` |
| PM | 19:00–20:00 | Preparar demo. | |

#### Sábado (Día 36) — DEMO WEEK 6

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.3.1-week-06` |
| AM | 10:00–12:00 | **DEMO:** Sistema completo integrado, UI final, performance, documentación |
| PM | 12:00–14:00 | Retrospectiva Sprint 3 |
| PM | 14:00–20:00 | Planificación Sprint 4 |

**Entregable Sprint 3:**
- ✅ Bot de soporte mental funcional vía WhatsApp (5 capas).
- ✅ Todos los módulos de IA refinados (v2).
- ✅ Observabilidad completa (logging, health panel).
- ✅ Workers hardened (circuit breaker, DLQ, idempotencia).
- ✅ Auth y seguridad en todos los micro-frontends.
- ✅ Integración end-to-end verificada.
- ✅ UI pulida y consistente.
- ✅ Documentación API, arquitectura, runbook completos.

---

## Sprint 4 (Semanas 7–8): Producción + Documentación Final

> **Objetivo:** Preparar para producción, testing exhaustivo, despliegue gradual, documentación final y v1.0.0.

### Semana 7 — Staging + Testing Exhaustivo

#### Lunes (Día 37) — Deploy a Staging

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | Configurar **entorno de staging**: desplegar Next.js (Vercel o servidor propio), configurar Neon de staging, variables de entorno. | Staging operativo |
| PM | 12:00–16:00 | Configurar **workers en staging**: cron-jobs ejecutándose contra Inmovilla/Statefox de prueba (o contra datos reales en modo lectura). | Workers en staging |
| PM | 16:00–20:00 | Deploy completo a staging. Verificar que todo funciona fuera de localhost. | Sistema en staging |

#### Martes (Día 38) — Testing en Staging

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM–PM | 8:30–15:00 | **Testing exhaustivo en staging**: ejecutar todos los flujos con datos reales o cuasi-reales. Documentar cada fallo. | Reporte de testing |
| PM | 15:00–20:00 | Corregir bugs de staging. Diferencias entre local y producción. | Bugs resueltos |

#### Miércoles (Día 39) — Edge Cases + Degradación + Monitoreo

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | **Testing de edge cases**: ¿qué pasa si Inmovilla está caído? ¿Si WhatsApp rechaza un envío? ¿Si LangGraph devuelve basura? ¿Si un lead no tiene datos mínimos? | Edge cases cubiertos |
| PM | 12:00–16:00 | Implementar **graceful degradation**: si un servicio externo falla, el sistema sigue operando lo que pueda y alerta. | Degradación controlada |
| PM | 16:00–20:00 | Implementar **monitoreo de producción**: alertas por correo/WhatsApp si workers se detienen, si hay errores > umbral, si la Job Queue crece sin procesarse. | Monitoreo funcional |

#### Jueves (Día 40) — Seguridad Final + Performance + Rollback

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | **Revisión de seguridad final**: credenciales rotadas, secrets en variables de entorno (no en código), HTTPS en todas las rutas, sanitización de inputs. | Checklist de seguridad |
| PM | 12:00–16:00 | **Revisión de performance final**: métricas de latencia en staging, optimizar queries lentas, verificar que polling no sature Inmovilla. | Performance verificada |
| PM | 16:00–20:00 | Documentar **plan de rollback**: cómo revertir si algo sale mal en producción. | Plan de rollback |

#### Viernes (Día 41) — Dry Run de Producción

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | **Dry run de producción**: simular un día completo de operación con datos reales. Cronometrar, medir errores, validar SLAs. | Reporte de dry run |
| PM | 13:00–17:00 | Corregir últimos bugs del dry run. | Bugs resueltos |
| PM | 17:00–20:00 | Preparar demo + documentación de release. | |

#### Sábado (Día 42) — DEMO WEEK 7

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Mergear, CHANGELOG, tag `v0.4.0-week-07` |
| AM | 10:00–12:00 | **DEMO:** Sistema en staging con datos reales, métricas de performance, plan de go-live |
| PM | 12:00–20:00 | Retrospectiva, ajustes finales |

---

### Semana 8 — Go-Live + Documentación Final

#### Lunes (Día 43) — Deploy a Producción

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–12:00 | **Deploy a producción**: desplegar Next.js, configurar Neon de producción, activar workers. | Sistema en producción |
| PM | 12:00–16:00 | **Activación gradual**: empezar con 1 comercial y 1 ciudad. Monitorear en tiempo real. | Piloto activo |
| PM | 16:00–20:00 | Monitorear, corregir incidencias en tiempo real. | |

#### Martes (Día 44) — Piloto + Expansión

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM–PM | 8:30–14:00 | Monitorear el piloto. Ajustar configuraciones basado en datos reales. | Ajustes documentados |
| PM | 14:00–20:00 | **Expandir piloto**: activar más comerciales/ciudades si todo es estable. | Expansión controlada |

#### Miércoles (Día 45) — Monitoreo + Documentación Final

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | Continuar monitoreo. Resolver incidencias prioritarias. | |
| PM | 13:00–20:00 | **Documentación final del proyecto**: actualizar toda la documentación con lo aprendido en producción. | Docs finales |

#### Jueves (Día 46) — Guías de Mantenimiento + Release Final

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | Escribir **guía de mantenimiento**: cómo actualizar plantillas, añadir comerciales, cambiar pesos de scoring, ajustar SLAs, añadir ciudades. | `docs/maintenance-guide.md` |
| PM | 13:00–18:00 | Escribir **guía de troubleshooting**: problemas comunes y cómo resolverlos. | `docs/troubleshooting.md` |
| PM | 18:00–20:00 | Hacer release final: `v1.0.0`. | Tag v1.0.0 |

#### Viernes (Día 47) — Buffer + Roadmap

| Bloque | Horario | Tarea | Entregable |
|---|---|---|---|
| AM | 8:30–13:00 | **Buffer**: resolver cualquier incidencia pendiente, completar documentación faltante. | |
| PM | 13:00–18:00 | Escribir **roadmap post-lanzamiento**: mejoras futuras, features pendientes, optimizaciones identificadas. | `docs/roadmap.md` |
| PM | 18:00–20:00 | Preparar demo final. | |

#### Sábado (Día 48) — DEMO FINAL

| Bloque | Horario | Actividad |
|---|---|---|
| AM | 8:30–10:00 | Tag final `v1.0.0`, CHANGELOG completo |
| AM | 10:00–12:00 | **DEMO FINAL:** Sistema en producción, métricas reales, dashboards con datos vivos, recorrido de todo el flujo |
| PM | 12:00–14:00 | Retrospectiva final del proyecto |
| PM | 14:00–16:00 | Celebración + planificación de fase 2 |

**Entregable Sprint 4:**
- ✅ Sistema desplegado y operativo en producción.
- ✅ Piloto ejecutado con datos reales.
- ✅ Monitoreo y alertas activos.
- ✅ Documentación completa (mantenimiento, troubleshooting, roadmap).
- ✅ Release v1.0.0 publicado.

---

## Criterios de Aceptación por Sprint

### Sprint 1 — Cimientos del Orquestador

| # | Criterio | Verificación |
|---|---|---|
| 1 | Event Store persiste y recupera eventos correctamente | Test unitario: append + get devuelve datos consistentes |
| 2 | Job Queue procesa y reintenta jobs | Test: job falla → se reintenta → completa |
| 3 | Ingestion Worker lee propiedades y demandas de Inmovilla | Demostración en vivo: ejecutar worker y ver eventos en Neon |
| 4 | Egestion Worker escribe en Inmovilla | Demostración: escribir campo de prueba, verificar en Inmovilla |
| 5 | WhatsApp envía y recibe mensajes | Demo: enviar mensaje a sandbox, recibir respuesta, evento en Neon |
| 6 | Scoring asigna score y SLA correcto | Test: lead con preaprobación obtiene score ≥80, SLA <5min |
| 7 | Smart Matching extrae variables de texto libre | Test: "quiero más metros y otra zona" → extrae metros y zona |
| 8 | Cruce de demandas genera matches correctos | Test: propiedad nueva → matches contra demandas compatibles |
| 9 | Sync Inmovilla → Statefox funciona | Demo: demanda sync'd visible en Statefox |
| 10 | Pipeline lead-to-notification funciona E2E | Demo: lead entra → scoring → asignación → WhatsApp |

### Sprint 2 — Módulos Avanzados

| # | Criterio | Verificación |
|---|---|---|
| 1 | Motor de plantillas genera contrato desde datos | Test: datos completos → docx generado con variables correctas |
| 2 | STT transcribe audio y extrae instrucciones | Demo: grabar "cambia honorarios a 3%" → variable modificada |
| 3 | Firma digital envía y captura firma | Test: enviar doc a firma, recibir webhook de confirmación |
| 4 | Motor de Pricing genera informe con semáforo | Demo: inmueble → análisis → informe con diagnóstico |
| 5 | Post-venta ejecuta cadencias según fecha de cierre | Test: simular cierre → verificar mensajes en D0, D3, D10, D21 |
| 6 | Dashboard Comercial muestra métricas por persona | Demo: datos de Neon → tabla con ranking y clasificación |
| 7 | Dashboard Colaboradores trackea hitos y tiempos | Demo: operación con banco → tiempos calculados, alerta si retraso |
| 8 | Dashboard CEO muestra las 6 capas | Demo: semáforos, rendimiento por ciudad, recomendaciones IA |
| 9 | Clasificación automática de comerciales funciona | Test: comercial con conversión baja → clasificado correctamente |
| 10 | Flujo completo lead→cierre funciona E2E | Demo: recorrer todo el pipeline en vivo |

### Sprint 3 — Bot Mental + Hardening

| # | Criterio | Verificación |
|---|---|---|
| 1 | Bot responde a comercial vía WhatsApp | Demo: escribir "estoy bloqueado" → respuesta personalizada |
| 2 | Bot no expone conversaciones al CEO | Verificar: dashboard CEO solo muestra datos agregados |
| 3 | IA v2 mejora extracción de variables | Test: comparar precisión v1 vs v2 con mismos inputs |
| 4 | Workers resisten fallos de Inmovilla | Test: simular fallo → circuit breaker activa → alerta |
| 5 | Idempotencia verificada | Test: reprocesar eventos → sin duplicados |
| 6 | Auth funciona en todos los micro-frontends | Test: comercial no ve datos de otro comercial |
| 7 | Panel de health muestra estado real | Demo: parar un worker → panel lo refleja |
| 8 | UI responsive y consistente | Demo: mostrar en mobile y desktop |
| 9 | Cobertura de tests > 70% | Ejecutar suite y verificar cobertura |
| 10 | Documentación API completa | Verificar: todos los endpoints documentados con examples |

### Sprint 4 — Producción

| # | Criterio | Verificación |
|---|---|---|
| 1 | Sistema funciona en staging fuera de localhost | Demo: acceder por URL pública |
| 2 | Edge cases manejados con graceful degradation | Test: apagar servicio externo → sistema alerta y continúa |
| 3 | Monitoreo envía alertas correctamente | Test: provocar error → recibir alerta por WhatsApp |
| 4 | Dry run completa un día sin errores críticos | Reporte de dry run |
| 5 | Seguridad verificada (no secrets en código, HTTPS) | Checklist de seguridad completado |
| 6 | Piloto con datos reales exitoso | Métricas del piloto documentadas |
| 7 | Documentación de mantenimiento completa | Verificar: guía cubre todos los escenarios |
| 8 | Plan de rollback documentado y probado | Verificar: procedimiento claro paso a paso |
| 9 | Release v1.0.0 publicado | Tag en repositorio |
| 10 | Roadmap post-lanzamiento definido | Documento con prioridades futuras |

---

## Resumen de Entregables por Semana

| Semana | Tag | Entregable principal |
|---|---|---|
| S1 | `v0.1.0-week-01` | Event Store + Workers lectura/escritura Inmovilla + Tipos de dominio |
| S2 | `v0.1.1-week-02` | Lead scoring + WhatsApp + Smart Matching + Statefox sync + Micro-frontends |
| S3 | `v0.2.0-week-03` | Smart Closing (plantillas + voz + firma) + Motor de Pricing + Post-venta |
| S4 | `v0.2.1-week-04` | Dashboards (Comercial + Colaboradores + CEO con 6 capas) |
| S5 | `v0.3.0-week-05` | Bot Mental + IA refinada v2 + Auth + Hardening Workers |
| S6 | `v0.3.1-week-06` | Integración E2E + UI final + Documentación completa |
| S7 | `v0.4.0-week-07` | Staging completo + Testing exhaustivo + Plan de rollback |
| S8 | `v1.0.0` | Producción + Go-live gradual + Documentación final |

---

## Métricas de Progreso

### Métricas semanales del developer

| Métrica | Objetivo mínimo |
|---|---|
| Commits / semana | ≥ 30 (mín. 5/día × 6 días) |
| PRs mergeadas / semana | ≥ 3 |
| Issues cerrados / semana | ≥ 8 |
| Cobertura de tests | > 70% al final de S6 |
| ADRs escritos | ≥ 1 por semana |
| CHANGELOG actualizado | Cada sábado |
| Daily Log completado | Todos los días |

### Métricas de calidad del código

| Métrica | Objetivo |
|---|---|
| Build exitoso | 100% de commits |
| Tests pasando | 100% en `develop` |
| Sin `any` injustificado | TypeScript estricto |
| Sin secretos en código | 0 credenciales hardcodeadas |
| Tiempo de build | < 60 segundos |

### Métricas de producto (post-lanzamiento)

| Métrica | Objetivo |
|---|---|
| Tiempo de primera respuesta a lead (score ≥80) | < 5 minutos |
| Tasa de leads procesados automáticamente | > 90% |
| Uptime de workers | > 99% |
| Tasa de errores de escritura en Inmovilla | < 2% |
| Contratos generados sin intervención manual | > 80% |

---

## Gestión de Riesgos

### Riesgos técnicos

| Riesgo | Prob. | Impacto | Mitigación | Contingencia |
|---|---|---|---|---|
| Inmovilla cambia su UI/endpoints | Alta | Alto | Selectores con fallback, alertas inmediatas, modo degradado | Activar modo manual mientras se adaptan selectores. DLQ acumula jobs. |
| WhatsApp rechaza plantillas | Media | Medio | Plantillas alternativas pre-aprobadas, texto conservador | Usar plantillas genéricas aprobadas mientras se resubmiten |
| LangGraph produce outputs inconsistentes | Media | Medio | Validación de schema con zod en outputs, fallback a reglas | Degradar a motor de reglas puro, alertar para revisión manual |
| Neon tiene latencia alta | Baja | Medio | Connection pooling, queries optimizadas, caché local | Caché de lectura local, reintentos con backoff |
| Statefox cambia su interfaz | Media | Medio | Ingeniería inversa documentada, selectores con fallback | Pausa de sync Statefox, workers siguen con Inmovilla |
| Firma digital falla o tarda | Baja | Bajo | Recordatorios automáticos, alternativa de firma presencial | Generar PDF sin firma digital, firmar manualmente |

### Riesgos de proyecto

| Riesgo | Prob. | Impacto | Mitigación | Contingencia |
|---|---|---|---|---|
| Developer se bloquea > 1 día | Media | Alto | Daily log documenta bloqueante, pivotar a otra tarea | Escalar al PM, replantear tarea, buscar enfoque alternativo |
| Scope creep (requisitos nuevos) | Alta | Alto | Backlog estricto, nuevas features van a fase 2 | Priorizar por valor, negociar trade-offs |
| Credenciales no disponibles a tiempo | Media | Alto | Lista de prerrequisitos entregada en día 0 | Usar mocks/sandbox mientras se resuelve |
| Rendimiento insuficiente con datos reales | Baja | Medio | Testing temprano con datos reales en S7 | Optimización intensiva, caching, query tuning |

---

## Glosario

| Término | Definición |
|---|---|
| **La Bóveda** | Inmovilla CRM. Sistema cerrado que actúa como repositorio pasivo de datos legales. |
| **Ingestion Worker** | Proceso server-side que lee datos de Inmovilla/Statefox por polling/scraping y emite eventos. |
| **Egestion Worker** | Proceso server-side que escribe datos en Inmovilla/Statefox mediante network interception (login silente → cookies → CSRF → XHR clonado). |
| **Event Store** | Tabla en Neon donde se persisten todos los eventos del sistema como registros inmutables. |
| **Job Queue** | Tabla en Neon que gestiona tareas asíncronas con reintentos, idempotencia y dead-letter queue. |
| **Proyección** | Vista materializada del estado actual, calculada a partir de los eventos del Event Store. |
| **Smart Matching** | Módulo de IA (LangGraph) que interpreta respuestas de texto libre y ajusta demandas automáticamente en Inmovilla. |
| **Smart Closing** | Sistema de generación de contratos con variables + revisión por voz (STT + LangGraph) + firma digital. |
| **Motor de Pricing** | Sistema que compara un inmueble contra el mercado real (vía Statefox) y genera diagnóstico + recomendaciones. |
| **SLA** | Service Level Agreement. Tiempo máximo para atender un lead según su score (ej: ≥80 → <5 min). |
| **Score** | Puntuación 0–100 de un lead. Fórmula: `0.55 × Pclose + 0.30 × Value + 0.15 × Urgency`. |
| **Cadencia** | Secuencia automática de mensajes programados por tiempo (ej: D+1, D+3, D+7 para follow-up). |
| **Circuit Breaker** | Patrón de resiliencia: si X operaciones consecutivas fallan, el worker se pausa y alerta. |
| **DLQ (Dead-Letter Queue)** | Cola donde van los jobs que fallan N veces. Se preserva contexto completo para debugging. |
| **ADR** | Architecture Decision Record. Documento que registra una decisión técnica importante con contexto y consecuencias. |
| **Micro-frontend** | Interfaz web ligera y específica (Next.js) para una tarea concreta (post-visita, validación, dashboard). |
| **Network Interception** | Técnica de capturar y reproducir peticiones HTTP internas de un sistema cerrado para simular acciones programáticamente. |
| **LangGraph** | Framework para orquestar flujos agénticos con LLMs. Se usa para Smart Matching, Pricing, Smart Closing y Bot Mental. |
| **Neon** | Base de datos PostgreSQL serverless. Almacena Event Store, Job Queue, proyecciones y analítica. |
| **Statefox** | Plataforma de análisis de mercado inmobiliario. Se usa para comparar precios, buscar stock externo y generar enlaces privados. |

---

> **Nota:** Este plan es un documento vivo. Se ajusta cada sábado en la retrospectiva post-demo según el progreso real, los descubrimientos técnicos y el feedback del equipo.
