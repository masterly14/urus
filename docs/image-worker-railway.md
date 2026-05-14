# Image Worker Railway — operación y rollout

Este documento describe el contrato y la operativa del worker dedicado en
Railway que ejecuta la importación de imágenes Statefox/Idealista, y cómo se
integra con la API en Vercel para mantener visualización inmediata en el flujo
de Pricing.

## Cuándo usarlo

- Pricing necesita imágenes en el mismo informe (no esperar al consumer).
- El consumer en Vercel queda lento o se acerca al límite de Hobby/Pro de
  duración por invocación.
- Idealista (DataDome) requiere ejecutar Web Unlocker / Playwright fuera del
  runtime serverless para latencias y costes predecibles.

## Modos del orquestador (`STATEFOX_IMAGE_WORKER_MODE`)

| Modo | Vercel | Railway |
|------|--------|---------|
| `local` | Ejecuta warm import en proceso. | No se contacta. |
| `railway` | Siempre delega al worker. Si no responde, cae a local con warning. | Hace todo el trabajo pesado. |
| `hybrid` (default cuando hay `STATEFOX_IMAGE_WORKER_URL`) | Llama al worker con ventana corta. Si excede `STATEFOX_IMAGE_WORKER_SYNC_DEADLINE_MS`, encola un job idempotente para que el consumer lo finalice. UI sigue por polling. | Hace el trabajo pesado y publica resultado o `accepted`. |

## Variables de entorno

En **Vercel**:

```
STATEFOX_IMAGE_WORKER_MODE=hybrid
STATEFOX_IMAGE_WORKER_URL=https://image-worker.up.railway.app
STATEFOX_IMAGE_WORKER_SECRET=<shared-secret>
STATEFOX_IMAGE_WORKER_SYNC_DEADLINE_MS=3000
STATEFOX_IMAGE_WORKER_REQUEST_TIMEOUT_MS=4500
```

En **Railway** (servicio `image-worker`):

```
IMAGE_WORKER_SECRET=<mismo-valor-anterior>
IMAGE_WORKER_CONCURRENCY=2
IMAGE_WORKER_DEADLINE_MS=4500
PORT=8080
# + DATABASE_URL, BRIGHTDATA_*, CLOUDINARY_* idénticas a Vercel
```

## Despliegue Railway

1. Crear servicio nuevo en Railway apuntando a este repositorio.
2. Configurar `Dockerfile.image-worker` como Dockerfile path.
3. Asignar las variables de entorno listadas arriba.
4. Health check: `GET /internal/health` (puerto `PORT`, default 8080).
5. Recursos sugeridos: 1 vCPU / 1 GB RAM por instancia (ajustar si
   `IMAGE_WORKER_CONCURRENCY` se sube).

## Contrato HTTP

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/internal/image-import/run` | POST | Procesa un `statefoxId`. Devuelve `completed`, `accepted`, `skipped` o `failed`. |
| `/internal/health` | GET | Métricas básicas (uptime, inFlight, processed, failed). |

Auth: header `X-Worker-Secret` (= `IMAGE_WORKER_SECRET`).

Trazabilidad: header `X-Trace-Id` propagado en logs Vercel↔Railway.

## Integración con la API de Pricing

El flujo completo:

```
UI Pricing → /api/pricing/analyze (Vercel)
   → fetchPricingComparables → hydrateComparablesWithImageCache
   → runHybridImageImport (orquestador)
      → ImageWorkerClient.runImageImport (Railway)
         · completed → cachedUrls listas en el mismo informe
         · accepted/timeout → enqueueJob (Neon)
   → Render del informe
   → useStatefoxImageCachePolling (UI) → /api/statefox/image-cache/status
      → refresca <ComparablePhotoCarousel> sin recargar el informe
```

## Plan de rollout y reversa

1. **Día 0 — Despliegue silencioso**
   - Subir worker a Railway con `IMAGE_WORKER_CONCURRENCY=1` y validar
     `GET /internal/health` desde Vercel.
   - Mantener `STATEFOX_IMAGE_WORKER_MODE=local` (sin tráfico real).

2. **Día 1 — Canary Idealista**
   - Cambiar a `STATEFOX_IMAGE_WORKER_MODE=hybrid`.
   - Mantener `STATEFOX_IMAGE_WORKER_SYNC_DEADLINE_MS=3000`.
   - Monitorizar `GET /api/workers/status` (bloque `image-worker`) y
     panel de Bright Data por 24 h.

3. **Día 2-7 — Throughput**
   - Subir `IMAGE_WORKER_CONCURRENCY=2` si CPU/RAM aguantan.
   - Validar que la cola no acumule jobs `IMPORT_STATEFOX_PORTAL_IMAGES`.

4. **Reversa inmediata** (cualquier momento)
   - En Vercel: cambiar `STATEFOX_IMAGE_WORKER_MODE` a `local`.
   - Sin redeploy: la próxima invocación de Pricing ya no contacta Railway
     y vuelve al warm import histórico.

## Troubleshooting

| Síntoma | Diagnóstico |
|---------|-------------|
| `accepted` repetido | El worker está saturado o el deadline es muy bajo. Subir `IMAGE_WORKER_DEADLINE_MS` o `IMAGE_WORKER_CONCURRENCY`. |
| `TIMEOUT` en logs Vercel | Worker no responde a tiempo. Revisar Railway health, `/internal/health`. |
| `UNAUTHORIZED` | Secret distinto entre Vercel y Railway. |
| Polling no termina | El consumer no está procesando jobs. Validar `/api/workers/status` y `/api/cron/consumer`. |
| Bloqueo DataDome | Verificar `BRIGHTDATA_API_TOKEN` y zona Web Unlocker en Railway (mismas variables que tenía Vercel). |
