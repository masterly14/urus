# Auditoría de Producción — Urus Capital Platform v1

> **Fecha:** 17 abril 2026
> **Alcance:** 23 subsistemas, ~700 archivos, 1692 líneas de schema Prisma
> **Criterio:** Bugs, cuellos de botella, TODOs no implementados, riesgos de producción
> **Contexto:** Lanzamiento en modo observable con capacidad de corrección en tiempo real

---

## 1. Resumen Ejecutivo

La plataforma Urus Capital está **sustancialmente completa a nivel de código**. Los 23 subsistemas identificados tienen implementación funcional que cubre el flujo end-to-end documentado en README.md y plan.md. Sin embargo, la auditoría profunda revela **6 hallazgos CRITICAL** que deben corregirse antes del primer deploy observable: un handler de eliminación de propiedades sin registrar en el consumer, verificación de webhook WhatsApp condicional a una variable de entorno, eventos publicados antes del snapshot en ingestion (riesgo de duplicación), timeouts de visita que dejan sesiones huérfanas, un join incorrecto en recalibración de scoring, y fases de post-venta que lanzan error en runtime. Adicionalmente hay **~25 hallazgos HIGH** que representan riesgos operativos bajo carga o ante fallos parciales pero que son tolerables en un lanzamiento monitoreado. La arquitectura fundamental (Event Sourcing, Job Queue con SKIP LOCKED, CQRS, DLQ con alertas, autenticación de rutas vía `proxy.ts` de Next.js 16) es sólida y apta para producción.

> **Nota sobre Next.js 16:** este proyecto usa el nuevo archivo `proxy.ts` en la raíz (convención de Next.js 16) en vez del `middleware.ts` heredado. El hallazgo originalmente reportado como C1 (ausencia de middleware) era incorrecto: `proxy.ts` existe, importa `getSessionCookie` de Better Auth, protege `/platform/*`, excluye rutas públicas (`/login`, `/register`, `/api/auth`, `/api/whatsapp/webhook`, `/seleccion`, `/referidos`, etc.) y redirige a `/login` cuando no hay sesión. Los hallazgos CRITICAL quedan en 6.

---

## 2. Bloqueantes CRITICAL

Estos hallazgos deben resolverse **antes** del primer deploy observable.

| # | Subsistema | Hallazgo | Impacto |
|---|-----------|----------|---------|
| ~~C1~~ | ~~**Auth**~~ | ~~`middleware.ts` no existe~~ | **DESCARTADO** — Next.js 16 usa `proxy.ts`, que sí existe en la raíz, usa Better Auth `getSessionCookie`, protege `/platform/*` y excluye las rutas públicas correctas. No bloquea producción. |
| C2 | **Consumer** | `PROPIEDAD_ELIMINADA` no tiene `registerHandler` → el consumer marca COMPLETED sin hacer nada → `properties_current` nunca se limpia de propiedades eliminadas | Proyección desincronizada, propiedades fantasma en matching y pricing |
| C3 | **WhatsApp** | Si `WHATSAPP_APP_SECRET` no está seteado, el webhook POST **no verifica** firma HMAC → cualquiera puede enviar eventos fabricados | Inyección de eventos falsos en todo el sistema |
| C4 | **Ingestion M1** | Eventos publicados (`publishEventsForDiff`) **antes** de persistir snapshot (`saveCurrentSnapshot`). Si el proceso muere entre ambos, el retry re-emite eventos duplicados (no hay dedupe por fingerprint) | Duplicación de eventos/jobs downstream, acciones repetidas |
| C5 | **Visitas** | `VISIT_CHECK_BUYER_TIMEOUT` solo trata estado `SLOT_PROPOSED_TO_BUYER`; para `ASKING_BUYER_PREFERENCE` el handler sale sin hacer nada → sesión se queda huérfana sin escalado. Mismo problema con `VISIT_CHECK_COMMERCIAL_TIMEOUT` para `SPECIFIC_SLOT_TO_COMMERCIAL` | Sesiones de visita que se quedan bloqueadas indefinidamente |
| C6 | **Scoring** | `historical-stats.ts` y `recalibration.ts` usan `CommercialOperationFact.sourceEventId` (ID del evento OPERACION_CERRADA) para intentar hacer match con `CommercialLeadFact.leadId` (aggregate ID del lead) → **nunca coinciden** → labels y métricas de cierre son incorrectas | Recalibración de scoring entrena con datos basura; métricas de conversión por ciudad contaminadas |
| C7 | **WhatsApp** | `sendPostSaleMessage` lanza error para fases `resena` y `referidos` — están en el tipo `PostSalePhase` pero no en `PHASE_BUILDERS` | Runtime crash al invocar esas fases de post-venta |

---

## 3. Hallazgos HIGH

Tolerables en un lanzamiento monitoreado pero deben abordarse en la primera semana.

| # | Subsistema | Hallazgo |
|---|-----------|----------|
| H1 | **Auth** | Open redirect en login: `callbackUrl` del query string se pasa a `router.push()` sin validar origen |
| H2 | **Auth** | `CRON_SECRET` aceptado vía query string → se filtra en logs, Referer, URL bar |
| H3 | **Auth** | Race en aceptar invitación: token → signUp → update no es atómico; dos requests paralelos pueden crear estados parciales |
| H4 | **Ingestion** | Propiedades filtradas (nodisponible/prospecto) generan falsos `PROPIEDAD_ELIMINADA` en el diff |
| H5 | **Ingestion** | Snapshot parcial por rate limit: si el loop se rompe por 429, se guarda snapshot incompleto → diffs incorrectos en ciclos siguientes |
| H6 | **Ingestion** | `maxDuration = 120s` vs `13s × N` propiedades por REST → timeout antes de completar para catálogos >10 propiedades |
| H7 | **Ingestion** | `agente` está en `DIFF_FIELDS` pero se omite en payloads de eventos → datos inconsistentes |
| H8 | **Ingestion** | Demandas: sin path de "removed" → si una demanda desaparece de Inmovilla, permanece en snapshot y proyección para siempre |
| H9 | **Egestion** | 2FA vía Composio + LLM es no determinista → login a Inmovilla puede fallar aleatoriamente |
| H10 | **Egestion** | `COMPOSIO_API_KEY` / `OPENAI_API_KEY` no se validan al iniciar → error opaco si faltan |
| H11 | **Egestion** | `createDemand` verification es no-op (`parseVerify` siempre retorna `{ok: true}`) |
| H12 | **Egestion** | `create-prospecto.ts` logea PII (calle, localidad, IDs) con `console.log` |
| H13 | **Consumer** | Evento sin handler = success silencioso (no va a DLQ, no falla) → pérdida silenciosa de side-effects |
| H14 | **Consumer** | 5 `JobType` del schema sin handler: `PROCESS_SIGNATURE_WEBHOOK`, `NOTIFY_SIGNATURE_REMINDER`, `VISIT_FETCH_SLOTS`, `VISIT_PROPOSE_TO_COMMERCIAL`, `VISIT_PROPOSE_TO_BUYER` |
| H15 | **WhatsApp** | Sin idempotencia en mensajes entrantes → Meta retries crean eventos/jobs duplicados |
| H16 | **WhatsApp** | Sin manejo de 429/retry en client → envíos fallan sin reintento |
| H17 | **WhatsApp** | `sendEscalationToCommercial` envía 6 parámetros pero comentario dice 4 variables → Meta rechaza si template tiene 4 placeholders |
| H18 | **WhatsApp** | `sendLeadAssignedToCommercial` usa texto libre por defecto → falla fuera de ventana 24h |
| H19 | **Matching** | Full-table load de `DemandCurrent` sin WHERE en DB; filtra en JS → no escala |
| H20 | **Matching** | Fan-out sin límite: una propiedad puede generar 100+ `MATCH_GENERADO` + `PROCESS_EVENT` en un solo handler |
| H21 | **Matching** | `match-generado-handler`: envío WhatsApp al comprador es síncrono (no encolado) → fallo no se reintenta |
| H22 | **Scoring** | Cadence scanner encola D+1/D+3/D+7 sin `availableAt` → todos se ejecutan inmediatamente para leads viejos; puede crear ráfagas |
| H23 | **Scoring** | `normalizeCoefficients` en recalibración usa valores absolutos → coeficientes negativos se vuelven positivos |
| H24 | **Visitas** | Timeout de comercial con misma `idempotencyKey` si no se incrementa `currentRound` → segundo timeout nunca se encola |
| H25 | **Visitas** | `/api/agenda` usa `COMPOSIO_USER_ID` global en vez de `composioConnectionId` del comercial → calendar multi-tenant roto |
| H26 | **Operaciones** | `Operacion.estado` no se actualiza en `ESTADO_CAMBIADO` posteriores al create → progresión reserva→arras→firma no se refleja |
| H27 | **Operaciones** | `generarCodigoOperacion` read-then-increment sin lock → race condition bajo concurrencia |
| H28 | **NLU** | `classifyBuyerFeedback` sin try/catch en handler → fallo del LLM crashea todo el procesamiento de `WHATSAPP_RECIBIDO` |
| H29 | **NLU** | `visitIntentClassifier` fallo propaga sin catch → crash de handler WhatsApp completo |
| H30 | **Visitas** | Free/busy via LLM fallback (`getFreeBusyWithAgent`) → no determinista, puede agendar sobre slots ocupados |

---

## 4. Hallazgos MEDIUM / LOW por Subsistema

### M0 — Event Store + Job Queue + Observabilidad

| Sev | Hallazgo |
|-----|----------|
| M | `markCompleted`/`markFailed` no validan `workerId` → ownership check omitible |
| M | `await` de métricas de observabilidad en hot path de API Routes → latencia extra al usuario |
| M | Persistencia de observabilidad con catch vacío → pérdida silenciosa de logs |
| M | Circuit breaker: race en check/act (best-effort) |
| M | DLQ `replayAllDeadLetterByType` sin batch/limit |
| L | Event Store: lecturas sin `limit` obligatorio |

### Auth

| Sev | Hallazgo |
|-----|----------|
| M | Admin puede promover a `ceo` pero DELETE user es CEO-only → inconsistencia de privilegios |
| M | Rate limit in-memory (Map) → ineficaz en serverless multi-instancia |
| M | `User.banned` sin verificación explícita en handlers |
| M | Invitations POST sin rate limit |
| L | Sin índice compuesto en `Invitation(email, used, expiresAt)` |

### Ingestion M1

| Sev | Hallazgo |
|-----|----------|
| M | Tasks worker: `appendEvent` + `enqueueJob` no transaccional para nota de encargo |
| M | Snapshots `findMany()` unbounded → carga toda la tabla en memoria |
| M | `DEMAND_DIFF_FIELDS` excluye `nombre`, `ref` → cambios invisibles |
| M | Tasks worker: error de tipo en `runWithWorkerObservability` (string en vez de context) |

### Egestion M2

| Sev | Hallazgo |
|-----|----------|
| M | `updateDemandCriteria` sin `verify`/`parseVerify` |
| M | `run-write-inmovilla.ts` omite `updateDemandCriteria` del CLI |
| M | `parseFichaFieldValue` fragile: primer regex match en todo el HTML |
| L | Session expired detection por substring en HTML |

### Consumer / Proyecciones

| Sev | Hallazgo |
|-----|----------|
| M | Checkpoint silencioso: si `updateCheckpoint` falla, solo `console.warn` |
| M | Jobs pueden procesarse fuera de orden global → sobrescritura de estado nuevo con antiguo |
| M | `matching-handler` encola `RUN_PRICING_ANALYSIS` para todo `PROPIEDAD_MODIFICADA` sin filtrar campos |
| M | `leadStatus` update silencioso si no existe fila en `DemandCurrent` |
| M | `maxDuration = 60s` en cron de consumer y proyecciones → backlogs grandes no se vacían |

### WhatsApp

| Sev | Hallazgo |
|-----|----------|
| M | Templates hardcoded con fallback → deben existir en Meta Business Manager con esos nombres exactos |
| M | Webhook handler `await` sincrónico en request thread → bottleneck bajo volumen |
| M | `WHATSAPP_RECIBIDO` para comprador: si `comercialId` no se suministra, notificación se pierde |
| L | `verify-signature.ts` existe como archivo muerto (no referenciado) |

### Matching

| Sev | Hallazgo |
|-----|----------|
| M | `operationMatches` retorna `true` si cualquier lado está vacío → no discrimina venta/alquiler |
| M | `DemandForMatching` incluye `tipoOperacion`/`metrosMin`/`metrosMax` que no existen en schema |
| M | Scoring thresholds hardcodeados (`minScoreThreshold: 50`, overlap `0.5`) sin configuración externa |
| M | API `/api/matching/cruces`: `total` es largo de página filtrada, no count global |
| M | `feedback/page.tsx` 100% mock sin flag documentado |
| M | Sin dedup de `MATCH_GENERADO` por par propiedad-demanda entre ciclos |
| L | `KEY_TIPO_NAMES` manual → riesgo vs catálogo real de Inmovilla |

### Scoring + Routing + SLAs + Cadencias

| Sev | Hallazgo |
|-----|----------|
| M | `tasaConversion` sin normalización documentada (0-1 vs 0-100) → routing scores distorsionados |
| M | Cadence scanner solo escanea 200 eventos recientes → leads viejos no cubiertos |
| M | `SLA_TIERS.LOW.maxResponseMs = Infinity` → puede serializar como null en JSON |
| M | `referido` double-counting en pclose (boolean + `SOURCE_BONUS`) |
| L | Reason text de scoring muestra `input.mensajeLongitud` en vez del threshold |
| L | `historicalStats` puede servir cache stale para siempre tras error de DB |

### Visitas + Agendamiento

| Sev | Hallazgo |
|-----|----------|
| M | State machine `VALID_TRANSITIONS` no se enforce en confirm/cancel/reschedule → bypasses posibles |
| M | `VISIT_COMPLETED` es estado terminal definido pero nada transiciona hacia él |
| M | Dos shapes diferentes de `VISITA_AGENDADA` (API agenda vs orchestrator WhatsApp) |
| M | TOCTOU en slot locking: dos sesiones pueden ver slot libre y race en `createMany` |
| M | `visita-evaluada-handler`: si Statefox falla, stock = 0 → puede omitir generación de microsite |
| L | `send_updates: false` en Google Calendar → attendees no reciben invitación |

### Operaciones

| Sev | Hallazgo |
|-----|----------|
| M | `mapEstadoFichaToOperacionEstado` usa `includes` heurístico → strings ambiguos de Inmovilla |
| M | `resolveDemandIdForProperty` best-effort → puede asignar demandId incorrecta si múltiples demandas |

### Agentes IA (transversal)

| Sev | Hallazgo |
|-----|----------|
| M | Ningún agente LangGraph tiene retry, circuit breaker o fallback ante 429/5xx de OpenAI (solo timeout 30s + catch) |
| M | `llm.ts` lanza al cargar módulo si falta `OPENAI_API_KEY` → crash de import en cualquier ruta que lo use transitivamente |
| M | Todos los grafos son efímeros (sin checkpointing LangGraph); contexto multi-turn depende de DB externa |
| M | CEO crons + POST manual pueden appendear eventos duplicados (cada ejecución = nuevo evento) |
| M | `generateExercise` (dev program) sin try/catch → fallo del LLM propaga al caller |
| L | Visit intent classifier: `OPENAI_API_KEY` no se valida en este módulo (a diferencia de `llm.ts`) |
| L | NLU eval suite: solo ejecutable por CLI, sin trigger HTTP en el repo |

---

## 5. Tabla de Estado por Subsistema

| Subsistema | Veredicto | CRITICAL | HIGH | MEDIUM | Bloquea prod? |
|-----------|-----------|----------|------|--------|---------------|
| **M0 — Event Store / Job Queue / Observabilidad** | Sólido | 0 | 0 | 6 | No |
| **Auth** | Gaps menores (proxy.ts OK) | 0 | 3 | 4 | No |
| **M1 — Ingestion Worker** | Riesgo de consistencia | 1 | 5 | 4 | **Sí** (C4) |
| **M2 — Egestion Worker** | Funcional con fragilidad RPA | 0 | 4 | 3 | No (riesgo ops) |
| **Consumer / Proyecciones** | Gap crítico de handler | 1 | 2 | 5 | **Sí** (C2) |
| **WhatsApp** | Verificación condicional | 1 | 4 | 3 | **Sí** (C3) |
| **Matching** | Funcional pero no escala | 0 | 3 | 6 | No (riesgo escala) |
| **Scoring + Routing + SLAs** | Join roto en recalibración | 1 | 2 | 4 | **Sí** (C6) |
| **Visitas + Agendamiento** | Timeouts huérfanos | 1 | 3 | 5 | **Sí** (C5) |
| **Operaciones** | Estado no se actualiza | 0 | 2 | 2 | No (riesgo datos) |
| **Post-Venta** | Fases con throw | 1 | 1 | 0 | **Sí** (C7) |
| **NLU Graph** | Sin fallback de LLM | 0 | 2 | 2 | No (riesgo ops) |
| **Visit Intent Classifier** | Sin catch en handler | 0 | 1 | 0 | No (riesgo ops) |
| **Lead Scoring Graph** | Fallback implementado | 0 | 0 | 1 | No |
| **Pricing Recommendation** | Funcional | 0 | 0 | 2 | No |
| **Contract Instruction** | Funcional, sin retry | 0 | 0 | 1 | No |
| **Mental Health Bot** | Funcional, TODO menor | 0 | 0 | 2 | No |
| **CEO Agents (3 grafos)** | Funcional | 0 | 0 | 2 | No |
| **NLU Eval Suite** | Correcta | 0 | 0 | 1 | No |
| **TOTAL** | — | **6** | **~30** | **~53** | — |

---

## 6. Recomendación de Orden de Corrección

### Fase 0 — Antes del deploy (CRITICALs, ~2-3 días)

| Prioridad | Fix | Esfuerzo estimado |
|-----------|-----|-------------------|
| 1 | **C3:** Hacer `WHATSAPP_APP_SECRET` obligatorio en prod (fail closed si falta) | 30 min |
| 2 | **C2:** Registrar handler para `PROPIEDAD_ELIMINADA` que encole `UPDATE_PROPERTY_PROJECTION` | 1 hora |
| 3 | **C7:** Añadir `resena` y `referidos` a `PHASE_BUILDERS` en `send.ts` o eliminar del tipo | 1 hora |
| 4 | **C4:** Invertir orden: snapshot primero, luego publicar eventos (o transacción/outbox) | 2-4 horas |
| 5 | **C5:** Ampliar `VISIT_CHECK_BUYER_TIMEOUT` handler para cubrir `ASKING_BUYER_PREFERENCE`; idem `VISIT_CHECK_COMMERCIAL_TIMEOUT` para `SPECIFIC_SLOT_TO_COMMERCIAL` | 2 horas |
| 6 | **C6:** Corregir join en `historical-stats.ts` y `recalibration.ts` para usar clave correcta (lead aggregate ID ↔ operación vía propertyCode o demandId) | 3-4 horas |

> ~~C1 (middleware de autenticación)~~ fue descartado: Next.js 16 usa `proxy.ts` y el archivo ya existe con la lógica correcta.

### Fase 1 — Primera semana post-deploy (HIGHs críticos)

| Prioridad | Fix |
|-----------|-----|
| 1 | H1: Validar `callbackUrl` como path relativo en login |
| 2 | H2: Mover `CRON_SECRET` a header Authorization solamente |
| 3 | H3: Hacer aceptación de invitación atómica (transacción + SELECT FOR UPDATE) |
| 4 | H15: Idempotencia en webhook entrante (dedup por `message.id` antes de `appendEvent`) |
| 5 | H16: Retry/backoff en WhatsApp client para 429/5xx |
| 6 | H6: Resolver timeout de ingestion (cola/paginación en background o split de cron) |
| 7 | H28/H29: Wrap `classifyBuyerFeedback` y `classifyVisitIntent` en try/catch con fallback |
| 8 | H20: Implementar top-K o batch limit en matching fan-out |
| 9 | H21: Encolar envío WhatsApp al comprador (no síncrono) |

### Fase 2 — Semana 2-3 (HIGHs operativos)

| Fix |
|-----|
| H4/H5: Mejorar diff de propiedades (no marcar nodisponible como removed, no guardar snapshot parcial) |
| H8: Implementar path de removed para demandas |
| H9/H10: Validar env vars de Composio/OpenAI al startup |
| H22: Cadence scanner con `availableAt` correcto y one-step-per-run |
| H25: `/api/agenda` usar `composioConnectionId` del comercial |
| H26: Actualizar `Operacion.estado` en ESTADO_CAMBIADO posteriores |
| H27: `generarCodigoOperacion` con lock o secuencia DB |

### Fase 3 — Mejora continua (MEDIUMs por impacto)

- Observabilidad: hacer persistencia de métricas fire-and-forget (no await en hot path)
- Matching: añadir `tipoOperacion` / `metrosMin` / `metrosMax` a `DemandCurrent` o enriquecer en matching
- Matching: índices y WHERE en DB en vez de full-table load
- WhatsApp: verificar todos los template names en Meta Business Manager
- Todos los agentes IA: añadir retry con backoff exponencial para llamadas LLM
- Consumer: evaluar si eventos sin handler deberían ir a DLQ en vez de success silencioso

---

*Documento generado automáticamente por auditoría de código. Revisar hallazgos contra contexto de negocio antes de priorizar.*
