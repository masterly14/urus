# ADR-001: Event Sourcing sobre CRUD

## Estado: Aceptado
## Fecha: 2026-03-09

## Contexto

Inmovilla es un CRM cerrado: no ofrece webhooks ni una API moderna de escritura, y su modelo operativo es “estado final” (CRUD). Para automatizar el negocio (ingestión, scoring, matching, SLA, egestión hacia Inmovilla), necesitamos:

- Un **registro inmutable** de todo lo que ocurre (auditoría y trazabilidad).
- Poder **reprocesar** o **reconstruir estado** cuando cambie la lógica (replay).
- Desacoplar “lo que pasó” de “qué hacemos con ello” (consumers/proyecciones).
- Resiliencia: si un sistema externo cae, no perder eventos ni trabajo pendiente.

El plan de M0 (Semana 1) define a Neon (PostgreSQL) como **Event Store** (tabla `events`) + **Job Queue** (tabla `job_queue`) y checkpoints de proyección (`projections_checkpoint`) para materializaciones posteriores.

## Decisión

Usar **Event Sourcing** como fuente de verdad en la Capa 3 (Neon), registrando cada cambio como un **evento inmutable** en la tabla `events` (modelo `Event` de Prisma).

En el código, esta decisión se materializa con una capa de abstracción mínima:

- `appendEvent()` para persistir eventos (append-only).
- `getEventsByAggregate()` para reconstruir un agregado por `aggregateType` + `aggregateId`.
- `getEventsSince()` para procesamiento incremental basado en `position` (consumers/proyecciones).

Referencias:

- Schema: `prisma/schema.prisma` (modelos `Event`, `ProjectionCheckpoint`).
- Implementación: `lib/event-store/`.
- Plan: `docs/plan.md` (M0: Event Store + Job Queue).

## Consecuencias

### Positivas

- **Trazabilidad completa**: historial auditable de cambios (qué pasó y cuándo).
- **Reproceso**: posibilidad de recalcular proyecciones al cambiar reglas.
- **Desacople**: los consumers y proyecciones evolucionan sin romper el registro histórico.
- **Resiliencia**: el sistema puede seguir aceptando eventos aunque componentes externos fallen (el trabajo derivado se gestiona en la cola).

### Negativas / Costes

- **Complejidad**: requiere consumers, proyecciones y disciplina de versionado de eventos/payload.
- **Consistencia eventual**: el “estado actual” suele provenir de proyecciones, no de la escritura directa.
- **Operación**: hay que vigilar replay, crecimiento de eventos y estrategias de mantenimiento (índices, partición futura, etc.).

