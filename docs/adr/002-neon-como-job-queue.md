# ADR-002: Neon como Job Queue

## Estado: Aceptado
## Fecha: 2026-03-09

## Contexto

El sistema necesita ejecutar tareas asíncronas y resilientes (p. ej. procesar eventos, actualizar proyecciones, escribir en Inmovilla). Estas tareas deben soportar:

- **Reintentos** (cuando Inmovilla o un servicio externo esté caído).
- **Idempotencia** (evitar duplicados y efectos secundarios repetidos).
- **Concurrencia segura** (múltiples workers sin procesar el mismo job dos veces).
- **Dead-letter** para fallos permanentes.

El plan de M0 establece Neon (PostgreSQL) como infraestructura única para Event Store y Job Queue, evitando introducir proveedores adicionales en la Semana 1.

## Opciones consideradas

- Redis + Bull/BullMQ
- AWS SQS / SNS
- Servicios “workflow/job” (p. ej. Inngest / Trigger.dev / QStash)
- **PostgreSQL (Neon) como cola vía tabla** (`job_queue`)

## Decisión

Implementar la Job Queue sobre Neon usando una tabla `job_queue` (modelo `JobQueue` en Prisma) con lógica propia:

- `enqueueJob()` inserta jobs con `status=PENDING`, `availableAt`, `priority` e `idempotencyKey`.
- `dequeueJob()` **reclama** jobs de forma **atómica** y segura en concurrencia (semántica `FOR UPDATE SKIP LOCKED`) y los marca `IN_PROGRESS` con lock (`lockedAt`, `lockedBy`) e incremento de `attempts`.
- `markCompleted()` sella `COMPLETED` y libera el lock.
- `markFailed()` registra error y:
  - si quedan intentos: reprograma (`status=PENDING`, `availableAt` futuro),
  - si no quedan: mueve a `DEAD_LETTER`.

Referencias:

- Schema: `prisma/schema.prisma` (modelo `JobQueue`, enums `JobType`, `JobStatus`).
- Implementación: `lib/job-queue/`.
- Plan: `docs/plan.md` (M0: Job Queue con reintentos + test ciclo completo).

## Consecuencias

### Positivas

- **Infra mínima**: no se añade otro proveedor/servicio en M0.
- **Coherencia**: Event Store + Job Queue viven en la misma base (simplifica operaciones).
- **Transparencia**: el estado de la cola es inspeccionable con SQL (prioridades, retrasos, DLQ).

### Negativas / Costes

- **Responsabilidad propia**: hay que implementar y mantener atomicidad, locks, reintentos y backoff.
- **Riesgo operativo**: sin monitoreo y recolección de locks stale, pueden quedar jobs atascados.
- **Escalabilidad**: con alto volumen puede requerir tuning (índices, partición, batching, etc.).

