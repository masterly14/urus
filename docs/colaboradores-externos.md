# Colaboradores Externos (M11) — Panel de Gestión Interno

## Qué es

Sistema de gestión de colaboradores externos (bancos, abogados, tasadores, arquitectos, notarías, constructores, certificadores, etc.) que participan en operaciones inmobiliarias. Permite asignar colaboradores a operaciones, configurar hitos por tipo, rastrear tiempos, subir documentos y calcular métricas de rendimiento con clasificación automática. **Toda la gestión la realiza el equipo interno (Comercial o CEO) desde el dashboard** — los colaboradores externos no acceden al sistema directamente.

## Modelo de Operación formal

Antes de M11, el sistema usaba `propertyCode` como proxy de operación y fabricaba un `operationId` sintético (`OP-{propertyCode}`). Esto acoplaba 1 propiedad = 1 operación, lo cual no refleja la realidad del negocio (reventas, múltiples compradores).

El modelo `Operacion` formaliza la transacción inmobiliaria como entidad de primer nivel:

- **`Operacion`**: vincula propiedad, demanda, comprador, vendedor y comercial.
- **`codigo`**: identificador humano auto-generado (`OP-2026-0001`), visible en UI, plantillas WhatsApp y Cloudinary.
- **`estado`**: ciclo de vida real (EN_CURSO, RESERVA, ARRAS, PENDIENTE_FIRMA, CERRADA_*, CANCELADA).
- Los colaboradores se asignan a la operación, no a la propiedad.

## Tablas y relaciones

### Operación

| Tabla | Descripción |
|---|---|
| `operaciones` | Operación inmobiliaria formal. PK: `id` (cuid). UK: `codigo`. |

Campos clave: `propertyCode` (FK lógica a `properties_current.codigo`), `demandId` (FK lógica a `demands_current.codigo`), `buyerClientId` / `sellerClientId` (`cod_cli` de Inmovilla), `comercialId` (FK lógica a `comerciales.id`), `estado` (enum `OperacionEstado`).

### Colaboradores

| Tabla | Descripción |
|---|---|
| `colaboradores` | Entidad colaborador (banco, abogado, etc.). Campo `tipo` es string libre. |
| `colaborador_tipos` | Catálogo de tipos configurables. UK: `nombre`. CRUD desde dashboard. |
| `hito_plantillas` | Plantillas de hitos por tipo de colaborador. UK compuesto: `(colaboradorTipoId, orden)`. |
| `colaborador_sla_configs` | SLA por colaborador individual, con granularidad opcional por hito. UK: `(colaboradorId, hitoPlantillaId)`. |

### Asignaciones, tracking y documentos

| Tabla | Descripción |
|---|---|
| `colaborador_asignaciones` | Vincula colaborador con operación. UK: `(colaboradorId, operacionId)`. FK real a `operaciones`. |
| `colaborador_hitos` | Hitos concretos de una asignación. Tracking de tiempos con `iniciadoAt`, `completadoAt`, `slaVenceAt`. |
| `documentos_colaborador` | Documentos subidos a Cloudinary por asignación. FK obligatoria a `colaborador_asignaciones`, FK opcional a `colaborador_hitos`. |

### Diagrama ER

```
Operacion 1──N ColaboradorAsignacion N──1 Colaborador
                      │
                      ├── N ColaboradorHito ── opt N DocumentoColaborador
                      │
                      └── N DocumentoColaborador (sin hito)

ColaboradorTipo 1──N HitoPlantilla

Colaborador 1──N ColaboradorSlaConfig ──opt── HitoPlantilla
```

## Enums

| Enum | Valores |
|---|---|
| `OperacionEstado` | EN_CURSO, RESERVA, ARRAS, PENDIENTE_FIRMA, CERRADA_VENTA, CERRADA_ALQUILER, CERRADA_TRASPASO, CANCELADA |
| `AsignacionEstado` | PENDIENTE, EN_PROGRESO, COMPLETADA, BLOQUEADA, CANCELADA |
| `HitoEstado` | PENDIENTE, EN_PROGRESO, COMPLETADO, BLOQUEADO, CANCELADO |

## API Endpoints

### Colaboradores

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/colaboradores` | Lista con stats, clasificación. Params: tipo, ciudad, activo, search |
| POST | `/api/colaboradores` | Crear colaborador. Si tipo no existe, lo crea en `colaborador_tipos` |
| GET | `/api/colaboradores/:id` | Detalle con asignaciones, hitos, docs y clasificación |
| PATCH | `/api/colaboradores/:id` | Actualizar campos |
| DELETE | `/api/colaboradores/:id` | Soft-delete (activo=false) |

### Asignaciones y hitos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/colaboradores/:id/asignaciones` | Asignaciones del colaborador con hitos |
| POST | `/api/colaboradores/:id/asignaciones` | Asignar a operación. Body: `{operacionId, hitos?}` |
| PATCH | `/api/colaboradores/asignaciones/:asignacionId` | Actualizar estado/notas asignación |
| DELETE | `/api/colaboradores/asignaciones/:asignacionId` | Cancelar asignación |
| POST | `/api/colaboradores/asignaciones/:asignacionId/hitos` | Crear hito ad-hoc |
| PATCH | `/api/colaboradores/asignaciones/:asignacionId/hitos/:hitoId` | Cambiar estado hito (calcula timestamps auto) |

### Documentos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/colaboradores/asignaciones/:asignacionId/documentos` | Listar documentos |
| POST | `/api/colaboradores/asignaciones/:asignacionId/documentos` | Upload via FormData → Cloudinary → metadata en DB |

### Operaciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/operaciones` | Lista de operaciones (selector de asignación). Params: estado, search, limit |

### Cron

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/cron/colaboradores-sla` | Scanner SLA. Detecta hitos vencidos, emite `COLABORADOR_SLA_BREACH` |

## Archivos principales

| Archivo | Rol |
|---|---|
| `prisma/schema.prisma` | Modelos (sección M11 + `DocumentoColaborador`) |
| `lib/operacion/codigo.ts` | `generarCodigoOperacion()` — genera `OP-{YYYY}-{NNNN}` |
| `lib/operacion/estado.ts` | Mapeo de estados Inmovilla a `OperacionEstado` |
| `lib/operacion/colaboradores/queries.ts` | Queries: listar con stats, detalle con asignaciones |
| `lib/operacion/colaboradores/classify.ts` | Clasificación automática (partner/funcional/lento/crítico) |
| `lib/operacion/colaboradores/sla-scanner.ts` | Cron scanner SLA con deduplicación |
| `app/api/colaboradores/` | API routes CRUD |
| `app/api/operaciones/route.ts` | Listado de operaciones |
| `app/colaboradores/page.tsx` | UI listado con filtros, KPIs, clasificación |
| `app/colaboradores/[id]/page.tsx` | Detalle con kanban de hitos, documentos, asignación |
| `app/colaboradores/ranking/page.tsx` | Ranking por SLA, operaciones, hitos |
| `components/colaboradores/` | Componentes reutilizables (kanban, form, upload, badge) |

## Clasificación automática

Basada en métricas reales (no afinidad). Se calcula en cada request desde los datos de asignaciones y hitos.

| Clasificación | Criterio |
|---|---|
| **Partner Estratégico** | SLA cumplimiento ≥90%, operaciones ≥ media del equipo |
| **Funcional** | SLA cumplimiento ≥70%, métricas normales |
| **Lento** | SLA cumplimiento <70%, sin bloqueos recurrentes |
| **Crítico** | SLA cumplimiento <50% O ≥3 hitos vencidos activos |
| **Sin datos** | <2 asignaciones (configurable via `COLAB_CLASSIFY_MIN_ASIGNACIONES`) |

Configuración via env:
- `COLAB_CLASSIFY_MIN_ASIGNACIONES` (default: 2)
- `COLAB_CLASSIFY_PARTNER_MIN_SLA` (default: 90)
- `COLAB_CLASSIFY_FUNCIONAL_MIN_SLA` (default: 70)
- `COLAB_CLASSIFY_LENTO_MIN_SLA` (default: 50)

## SLA Scanner

El cron `POST /api/cron/colaboradores-sla` (ejecutar cada 6-12h via QStash):

1. Busca `ColaboradorHito` con `slaVenceAt < now()` y estado != COMPLETADO/CANCELADO
2. Calcula severidad: <3 días excedidos = `warning`, ≥3 días = `critical`
3. Deduplicación: no emite evento si ya existe uno para el mismo hito en los últimos N días (`COLAB_SLA_DEDUP_WINDOW_DAYS`, default: 3)
4. Emite evento `COLABORADOR_SLA_BREACH` con `aggregateType: "OPERACION"` en Event Store

Configuración via env:
- `COLAB_SLA_DEDUP_WINDOW_DAYS` (default: 3)
- `COLAB_SLA_CRITICAL_THRESHOLD_DAYS` (default: 3)

## Documentos en Cloudinary

Los documentos se suben como `resource_type: "raw"` a Cloudinary con la estructura:

```
colaboradores/{operacionCodigo}/{colaboradorNombre}/{nombreArchivo}
```

Tags: `["colaborador", "{operacionCodigo}"]`

Metadata se persiste en `documentos_colaborador` con `cloudinaryUrl`, `publicId`, `formato`, `bytes`.

## Cómo probarlo

1. Crear colaborador: `POST /api/colaboradores` con `{nombre, tipo}`
2. Crear operación (si no existe): via Smart Closing o backfill
3. Asignar: `POST /api/colaboradores/:id/asignaciones` con `{operacionId}`
4. Avanzar hitos: `PATCH /api/colaboradores/asignaciones/:asigId/hitos/:hitoId` con `{estado: "EN_PROGRESO"}`
5. Subir documento: `POST /api/colaboradores/asignaciones/:asigId/documentos` con FormData
6. Ver en UI: `/colaboradores` (listado), `/colaboradores/:id` (detalle + kanban)
7. Ranking: `/colaboradores/ranking`
8. SLA scan: `POST /api/cron/colaboradores-sla` (con CRON_SECRET)

## Dashboard de Colaboradores

### Endpoint

`GET /api/colaboradores/dashboard`

Retorna el payload completo del dashboard en una sola request:

```json
{
  "resumen": {
    "totalActivos": 12,
    "slaCumplimientoGlobal": 82.5,
    "hitosVencidosTotales": 3,
    "facturacionTotal": 1250000.00,
    "distribucionClasificacion": {
      "partner_estrategico": 3,
      "funcional": 5,
      "lento": 2,
      "critico": 1,
      "sin_datos": 1
    }
  },
  "ranking": [...],
  "metricasPorTipo": [...]
}
```

### Métricas incluidas

- **Facturación vinculada**: SUM de `grossAmountEur` de `CommercialOperationFact` donde el colaborador tiene asignación. Join: `colaborador_asignaciones.operacionId → commercial_operation_facts.operacionId`.
- **Ranking por facturación**: Colaboradores ordenados por facturación vinculada descendente, con posición, clasificación, SLA%, ops y hitos.
- **Métricas por tipo**: Tiempo medio de hito, SLA promedio, total colaboradores, hitos vencidos y facturación agrupados por `ColaboradorTipo`.
- **Semáforos**: Por clasificación (partner=verde, funcional=verde, lento=amarillo, critico=rojo) y por tipo (SLA ≥80% verde, ≥60% amarillo, <60% rojo).
- **KPIs globales**: Total activos, SLA cumplimiento global, hitos vencidos totales, facturación total vinculada.

### UI

Ruta: `/colaboradores/ranking`

Secciones:
1. KPI Cards (4 columnas)
2. Distribución por clasificación con semáforos (5 columnas)
3. Gráficos: Facturación por colaborador top 10 (barras horizontales) + Tiempos medios por tipo (barras verticales)
4. Tabla de semáforos por tipo de colaborador
5. Ranking completo con tabla ordenable y filtros por tipo, ciudad y clasificación

### Cómo probarlo

1. Abrir `/colaboradores/ranking`
2. Los KPIs muestran totales globales
3. Los gráficos requieren al menos un colaborador con asignación a una operación que tenga `CommercialOperationFact`
4. Los filtros (tipo, ciudad, clasificación) aplican sobre el ranking y se preservan en memoria
5. Click en una fila del ranking navega al detalle del colaborador

## Recomendaciones IA (LangGraph)

### Arquitectura

Grafo LangGraph en `lib/agents/colaboradores-recommendation-graph.ts` que recibe el payload completo del dashboard y genera recomendaciones estratégicas a nivel flota. Sigue el mismo patrón que el motor de recomendación de pricing (`lib/agents/pricing-recommendation-graph.ts`).

Componentes:
- **Tipos Zod**: `lib/operacion/colaboradores/recommendation-types.ts`
- **Grafo**: `lib/agents/colaboradores-recommendation-graph.ts`
- **Generador**: `lib/operacion/colaboradores/recommendation-generator.ts`
- **Cron**: `app/api/cron/colaboradores-recomendaciones/route.ts`

### Flujo

1. El cron llama a `POST /api/cron/colaboradores-recomendaciones` (protegido con `CRON_SECRET`)
2. El generador obtiene datos frescos via `getDashboardColaboradores()`
3. Si hay datos útiles, invoca el grafo LangGraph con structured output
4. Si no hay datos (0 colaboradores o todos sin_datos), retorna fallback sin invocar LLM
5. Persiste el resultado como evento `COLABORADOR_RECOMENDACION_GENERADA` en el Event Store
6. `GET /api/colaboradores/dashboard` incluye la última recomendación (`ultimaRecomendacion`) leyendo el último evento

### Tipos de recomendación

| Tipo | Significado |
|------|-------------|
| `concentrar` | Redirigir volumen de operaciones hacia partners estratégicos |
| `reducir` | Quitar carga operativa a colaboradores lentos |
| `alertar` | Intervención urgente en colaboradores críticos |
| `reconocer` | Destacar rendimiento sobresaliente |
| `investigar` | Revisar colaboradores con datos insuficientes |

### Evento

Tipo: `COLABORADOR_RECOMENDACION_GENERADA`
AggregateType: `OPERACION`
AggregateId: `colaboradores-fleet`

### Cómo probarlo

1. Ejecutar el cron: `curl -X POST http://localhost:3000/api/cron/colaboradores-recomendaciones -H "Authorization: Bearer $CRON_SECRET"`
2. Abrir `/colaboradores/ranking` — la sección "Recomendaciones IA" muestra el resultado
3. Sin datos de colaboradores, se muestra un estado vacío indicando que se generan via cron
4. Tests: `npx vitest run lib/operacion/colaboradores/__tests__/recommendation.test.ts`

### Variables de entorno

- `OPENAI_API_KEY` (requerida para LangGraph)
- `CRON_SECRET` (requerida para el endpoint cron)

## Compatibilidad con flujos existentes

Los módulos M8 (contratos), M9 (post-venta) y M10 (dashboard comercial) siguen funcionando exactamente igual. Los modelos nuevos coexisten sin impacto. La migración progresiva de estos módulos al modelo formal está documentada en el plan de Fase 2.
