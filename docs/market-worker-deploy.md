# Market Worker — Runbook de Despliegue (Railway)

Procedimiento para desplegar el Market Worker (Fase 2 del Core de
Inteligencia de Mercado) a Railway y validar que captura listings reales
de Fotocasa-Córdoba contra Neon.

> Ver también:
> - `docs/core-sistema-mercado.md` (Core)
> - `docs/core-sistema-mercado-plan-implementacion.md` (Fases 0-6)
> - `docs/core-sistema-mercado-decisiones.md` (Decisiones de Fase 0)
> - `workers/market-worker/README.md` (referencia rápida del Worker)

---

## 0. Pre-requisitos

- Cuenta de Railway con permisos en el proyecto Urus.
- Acceso al `.env` actual de Vercel (para reusar `DATABASE_URL`).
- `gh` (GitHub CLI) o acceso al repo `urus` para que Railway pueda
  conectar a la rama de despliegue.
- `openssl` (para generar el secret compartido).

## 1. Generar el secret compartido

Una sola vez por entorno:

```bash
openssl rand -hex 32
```

Guarda el valor. Va a configurarse:

- En Railway como `WORKER_SHARED_SECRET`.
- En Vercel como `MARKET_WORKER_SHARED_SECRET`.

Ambos valores deben ser exactamente iguales o el cliente HTTP fallará
con `MarketWorkerError("UNAUTHORIZED")`.

## 2. Crear el servicio en Railway

1. En el dashboard del proyecto Urus, "New" → "Empty Service".
2. Nombre del servicio: `market-worker`.
3. Conecta el repositorio `urus`.
4. En "Build" → "Custom Build Settings":
   - **Builder**: Dockerfile.
   - **Dockerfile Path**: `workers/market-worker/Dockerfile`.
   - **Watch Paths** (recomendado): `workers/market-worker/**`,
     `lib/market/**`, `lib/workers/market-worker/**`,
     `lib/workers/contracts/market-worker.ts`, `prisma/**`.
5. En "Deploy" → "Custom Start Command": dejar vacío (usa `CMD` del Dockerfile).

Railway leerá `workers/market-worker/railway.json` para el healthcheck.

## 3. Variables de entorno en Railway

Mínimas (valores en el dashboard, no commits):

| Variable                  | Valor                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `WORKER_SHARED_SECRET`    | el secret generado en §1                                           |
| `DATABASE_URL`            | la misma URL de Neon que usa Vercel                                |
| `WORKER_PORT`             | `8080`                                                             |
| `WORKER_VERSION`          | el git short SHA (configurar via Railway "Deploy hook" si se quiere) |
| `MAX_CONCURRENT_BROWSERS` | `2` (default)                                                      |
| `DEFAULT_BUDGET_MS`       | `60000`                                                            |
| `DEFAULT_BUDGET_REQUESTS` | `50`                                                               |
| `DEFAULT_DEADLINE_MS`     | `8000`                                                             |
| `POLITE_DELAY_MS`         | `2500`                                                             |
| `LOG_LEVEL`               | `info`                                                             |
| `NODE_ENV`                | `production`                                                       |
| `PLAYWRIGHT_HEADLESS`     | `true`                                                             |

Sin Bright Data en V1 (decisión Fase 0 §2.2: Fotocasa es laxo).

## 4. Variables en Vercel

Añadir/actualizar en el `.env` de producción de Vercel:

```
MARKET_FEATURE_ENABLED=true
MARKET_WORKER_BASE_URL=https://<railway-service-domain>
MARKET_WORKER_SHARED_SECRET=<mismo secret de §1>
MARKET_WORKER_REQUEST_TIMEOUT_MS=10000
```

El dominio Railway es de la forma `https://market-worker-production-xxxx.up.railway.app`
(visible en el dashboard del servicio).

## 5. Primer despliegue

1. Push a la rama de despliegue (típicamente `develop` o una `feat/*-rest`).
2. Railway detecta el cambio y dispara build con el Dockerfile.
3. La imagen base `mcr.microsoft.com/playwright:v1.58.2-jammy` tarda en
   descargarse la primera vez (~1.5 GB, 2-4 min).
4. El healthcheck de Railway (`/internal/health`) debe pasar tras el
   start (~10s después del arranque del proceso).

### Verificar tras el deploy

```bash
curl -s https://<railway-service-domain>/internal/health | jq
```

Esperado:

```json
{
  "status": "ok",
  "uptimeSeconds": 12,
  "inFlight": 0,
  "processed": 0,
  "failed": 0,
  "version": "<sha o dev>"
}
```

Si devuelve 502/503, abrir logs en Railway:
- `WORKER_SHARED_SECRET es obligatorio` → falta variable.
- `Cannot connect to database` → revisar `DATABASE_URL`.
- `EADDRINUSE` → pelea por `WORKER_PORT`, fijar a `8080`.

## 6. Smoke real Fotocasa-Córdoba (--limit 5)

Desde tu máquina local con el `.env.local` apuntando a Vercel/Neon:

```bash
# (1) Comprobar que el cliente puede hablar con el Worker
MARKET_WORKER_BASE_URL=https://<railway-domain> \
MARKET_WORKER_SHARED_SECRET=<secret> \
DATABASE_URL=<neon> \
npx tsx scripts/test-market-worker-local.ts --limit 5
```

Salida esperada (resumen):

```
[smoke] comprobando https://.../internal/health…
[smoke] health={"status":"ok","uptimeSeconds":...}
[smoke] seed creado id=...
[smoke] run creado id=... correlationId=smoke-XXXXXXXX
[smoke] respuesta worker (Yms): { "status": "completed", ... }
[smoke] estado final run=COMPLETED pages=1 captured=24 rejected=0 raw_persisted=24
[smoke] OK ✔
```

Criterios de aceptación de Fase 2:
- `itemsCaptured >= 20` en una página típica de Fotocasa-Córdoba.
- `MarketCrawlRun.status = COMPLETED`.
- `count(MarketRawListing) = itemsCaptured`.
- Tiempo total < 30s.

### Si devuelve `blocked`

- Revisar el HTML real con un browser desde la IP de Railway.
- Si es captcha/anti-bot, hay que añadir Bright Data (queda fuera de
  Fase 2 V1, ver `docs/core-sistema-mercado-decisiones.md` §2.2).
- Mientras tanto, el `MarketCrawlRun` queda como `PARTIAL` y el
  circuit breaker abre la fuente.

### Si devuelve `accepted` con `DEADLINE_EXCEEDED`

Esperado si la página tarda más que `deadlineMs`. El Worker sigue
extrayendo en background. Esperar 10-30s y consultar el run:

```sql
SELECT id, status, "pagesScanned", "itemsCaptured", "errorMessage"
FROM market_crawl_runs
WHERE id = '<runId que devolvió accepted>';
```

## 7. Idempotencia

Volver a llamar al Worker con el mismo `runId` y mismo seed **no** debe
crear duplicados en `MarketRawListing` (unique por `(source, contentHash)`).
Si se ven duplicados, hay un bug en `computeFotocasaContentHash`.

## 8. Rollback

Despliegue Railway es atómico por commit:

1. En el dashboard del servicio → "Deployments".
2. Elegir el deploy anterior estable → "Rollback".

Si el problema es un bug de captura que está ensuciando datos:
- Pausar el cron `/api/cron/market/crawl-tick` en QStash (Fase 5).
- Marcar los runs corruptos como `FAILED` manualmente:
  ```sql
  UPDATE market_crawl_runs SET status = 'FAILED', "errorCode" = 'ROLLBACK'
  WHERE "startedAt" >= '<inicio-incidente>' AND status IN ('RUNNING','COMPLETED');
  ```

## 9. Observabilidad

- **Railway**: logs del servicio en tiempo real, métricas de CPU/RAM.
- **Neon**: dashboard de queries para ver carga de `marketRawListing.upsert`.
- **Vercel**: logs de las APIs `/api/cron/market/*` cuando estén (Fase 5).

KPIs clave Fase 2:
- `MarketCrawlRun` con `status=COMPLETED` por hora.
- `count(MarketRawListing)` total y delta diario por source.
- `MarketCircuitBreaker.status` por source — si abre, alerta.

## 10. Decisiones diferidas que aplican aquí

De `docs/core-sistema-mercado-decisiones.md`:
- **Persistencia worker→Neon**: V1 escribe directo (decidido en plan
  Fase 2). Si vemos lock contention en Neon en producción, evaluar
  pasar a "worker devuelve, app persiste" en Fase 3.
- **Estrategia anti-bot fina**: V1 sin Bright Data. Si Fotocasa empieza
  a bloquear sostenidamente, añadir chain `webUnlocker → residentialProxy`
  en Fase 2.b.

---

## 11. Operación cotidiana (Fases 5 + 6)

Una vez el Worker está estable y los crons del Core están configurados,
la operación diaria gira alrededor de tres cosas: **mirar el health**,
**ajustar seeds** y **reaccionar a circuit breakers**. Esta sección es
para el operador (admin/CEO).

### 11.1 URLs internas (admin/CEO)

> Decisión `core-mvp-status.md` §1: la app **no** expone un producto de
> mercado a usuarios finales en el MVP. Las dos vistas siguientes son
> herramientas internas y **no están enlazadas** en el sidebar ni en
> los workspace-tabs. Acceder por URL directa.

| Vista                            | Para qué                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/platform/market/health`        | Estado consolidado: worker, frescura por portal, breakers, seeds activos, últimos eventos. Inicio del troubleshooting. |
| `/platform/market/search`        | Inspección read-only de `MarketListing` canónico para detectar regresiones de extractor o calibrar identidad. |

API equivalentes (consumibles desde scripts/curl con cookie de sesión
admin/CEO):

| Endpoint                                          | Qué devuelve                                          |
| ------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/market/health`                          | Mismo `HealthSnapshot` que el panel.                  |
| `GET /api/market/listings/search?city=&...`       | Listings canónicos paginados por cursor.              |
| `GET /api/market/listings/:id`                    | Detalle canónico.                                     |
| `GET /api/market/listings/:id/timeline`           | Versions + events asociados.                          |
| `GET /api/market/properties/:id`                  | Cluster (property + listings agrupados).              |
| `GET /api/market/snapshot?city=...`               | Métricas agregadas por `(housingType, operation)`.    |
| `GET /api/market/seeds`                           | Lista de seeds activos.                               |
| `POST /api/market/seeds`                          | Alta/edición idempotente de seed.                     |
| `POST /api/market/crawls/trigger`                 | Disparar crawl manual de un seed (idempotente/min).   |

### 11.2 Schedules QStash

Configurar en `https://console.upstash.com/qstash` con header
`Authorization: Bearer <CRON_SECRET>` apuntando al dominio de Vercel:

| Cron                                                | Cadencia | Propósito                                                                |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `POST {APP_URL}/api/cron/market/discover-seeds`     | `*/15 * * * *` | Encola `MARKET_CRAWL_SEED` por seed vencido (cadencia respetada). |
| `POST {APP_URL}/api/cron/market/crawl-tick`         | `*/5 * * * *`  | Drena la cola: llama al Worker y procesa raw → normalize → identity → diff. |
| `POST {APP_URL}/api/cron/market/refresh-snapshot`   | `*/30 * * * *` | Recalcula `MarketSnapshotIndex` por ciudad activa.                  |
| `POST {APP_URL}/api/cron/market/refresh-advertiser-counts` | `0 * * * *`    | Recalcula `MarketAdvertiser.listingsCount` y `lastSeenAt` desde `market_listings`. |
| `POST {APP_URL}/api/cron/market/health-check`       | `*/5 * * * *`  | Loguea métricas operativas (worker + breakers + frescura).         |
| `POST {APP_URL}/api/cron/market/run-rules`          | `*/10 * * * *` | No-op (placeholder V2). Configurarlo igualmente para no olvidar en V2. |
| `POST {APP_URL}/api/cron/market/purge`              | `0 3 * * *`    | Aplica retención: 30d para `MarketRawListing`, 365d para versions. |
| `POST {APP_URL}/api/cron/market/brightdata-success-rate` | `0 6 * * *`    | (Solo si `MARKET_IDEALISTA_ENABLED=true`) Mide success rate Web Unlocker contra `idealista.com`. Alerta < 0.85. |

Si el flag `MARKET_FEATURE_ENABLED=false`, todos los crons (excepto
`health-check` y `run-rules`) hacen no-op explícito y devuelven
`{ skipped: true }`. Útil para pausar el Core sin desconfigurar QStash.

### 11.3 Crear / actualizar seeds

Tres formas, todas idempotentes por `(source, city, zone, operation, housingType, url)`:

**A. Script local (recomendado para semilla inicial):**

```bash
DATABASE_URL=<neon> npx tsx scripts/seed-market-cordoba.ts
```

Crea/actualiza los 4 seeds de Córdoba (Fotocasa + Pisos.com × venta/alquiler)
y abre los 2 `MarketCircuitBreaker` (uno por source) en `CLOSED`.

**B. Endpoint admin (para añadir ciudades sin redeploy):**

```bash
curl -X POST https://<vercel>/api/market/seeds \
  -H "Cookie: <sesión admin/CEO>" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "source_a",
    "city": "Sevilla",
    "operation": "sale",
    "housingType": "flat",
    "url": "https://www.fotocasa.es/es/comprar/viviendas/sevilla-capital/todas-las-zonas/l",
    "cadenceMinutes": 360,
    "priority": 50,
    "active": true
  }'
```

> Solo se aceptan sources en `ACTIVE_SOURCES_V1` (Fotocasa, Pisos.com).
> Para Idealista hay que esperar a Fase 2.c (`decisiones.md` §11).

**C. SQL directo en Neon** (último recurso). Recordar que los breakers
deben existir o `crawl-tick` rechazará el seed por seguridad.

### 11.4 Disparar un crawl manual

Desde el panel `/platform/market/health` cada seed activo tiene un botón
"Disparar crawl". También se puede llamar al endpoint:

```bash
curl -X POST https://<vercel>/api/market/crawls/trigger \
  -H "Cookie: <sesión admin/CEO>" \
  -H "Content-Type: application/json" \
  -d '{ "seedId": "<seed-uuid>" }'
```

Idempotente por minuto: dos clics en menos de 60s no encolan dos jobs.
La respuesta indica si se encoló (`{ enqueued: true, jobId }`) o si se
omitió (`{ enqueued: false, reason: "already_enqueued_recently" }`).

### 11.5 Lectura del panel `/platform/market/health`

| Indicador                         | Verde                  | Ámbar                  | Rojo                                      |
| --------------------------------- | ---------------------- | ---------------------- | ----------------------------------------- |
| Worker (Railway)                  | `OK`                   | `DEGRADED` (saturado)  | `UNREACHABLE` o `UNCONFIGURED`            |
| Frescura snapshot por portal      | ≤ 2h                   | 2h–4h                  | > 4h o sin datos                          |
| Circuit breaker por source        | `CLOSED`               | `HALF_OPEN`            | `OPEN`                                    |
| Fallos consecutivos (breaker)     | 0                      | 1–2                    | ≥ 3 (auto-trip a `OPEN`)                  |
| Listings activos por portal       | tendencia estable o ↑ | caída leve              | caída > 30% en 24h → revisar extractor    |

> SLO de cobertura (`decisiones.md §3.2`): ≥ 85% del stock visible.
> Se valida manualmente comparando `count(MarketListing WHERE source=...
> AND city='Córdoba' AND status='ACTIVE')` con la barra superior del
> portal (p. ej. "1.234 viviendas en venta en Córdoba").

### 11.6 Reaccionar a un circuit breaker `OPEN`

Causa típica: 3+ fallos consecutivos del Worker contra ese portal
(`BLOCKED`, `EXTRACTOR_ERROR`, timeouts).

Pasos:

1. Abrir `/platform/market/health`. La tarjeta del source en rojo muestra
   `lastCrawlStatus` y `failureCount`.
2. Inspeccionar el último `MarketCrawlRun` de ese source en Neon:

   ```sql
   SELECT id, status, "errorCode", "errorMessage", "startedAt", "finishedAt"
   FROM market_crawl_runs
   WHERE source = 'source_a'  -- o source_b
   ORDER BY "startedAt" DESC
   LIMIT 5;
   ```

3. Acciones según `errorCode`:
   - `BLOCKED` / `CAPTCHA` → el portal cambió defensa. Pausar el cron
     `crawl-tick`, abrir un issue, evaluar Bright Data Web Unlocker
     siguiendo `decisiones.md §2.2`.
   - `EXTRACTOR_ERROR` → el HTML cambió. Reproducir con
     `npx tsx scripts/test-market-worker-local.ts --source <s> --limit 1`
     y actualizar el parser correspondiente
     (`workers/market-worker/src/portals/<source>/parser.ts`).
   - `DEADLINE_EXCEEDED` repetido → subir `DEFAULT_DEADLINE_MS` en Railway
     o `cadenceMinutes` del seed.
4. Cuando el extractor esté arreglado, cerrar manualmente el breaker:

   ```sql
   UPDATE market_circuit_breakers
   SET status = 'CLOSED', "failureCount" = 0, "openedAt" = NULL,
       "halfOpenAt" = NULL
   WHERE source = 'source_a';
   ```

   El siguiente `crawl-tick` lo volverá a evaluar normalmente.

### 11.7 Retención y limpieza

`/api/cron/market/purge` corre a las 03:00 UTC y borra:

- `MarketRawListing.capturedAt < now - MARKET_RAW_RETENTION_DAYS` (default 30).
- `MarketListingVersion.capturedAt < now - MARKET_VERSIONS_RETENTION_DAYS` (default 365).

`MarketListing`, `MarketProperty`, `MarketEvent` y `MarketSnapshotIndex`
**nunca** se borran automáticamente. Si la DB crece más rápido de lo
esperado, ajustar las dos variables en Vercel y forzar el cron una vez:

```bash
curl -X POST https://<vercel>/api/cron/market/purge \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### 11.8 Apagar el Core temporalmente

Para mantenimiento sin desconfigurar QStash:

1. En Vercel → env de producción → `MARKET_FEATURE_ENABLED=false`.
2. Redeploy (o esperar al próximo build, las funciones leen el flag en
   tiempo de request).
3. Los crons devolverán `{ skipped: true }` inmediatamente.
4. El Worker de Railway sigue arriba sin tráfico (libre de mantener o
   parar a discreción).

Para reactivar: `MARKET_FEATURE_ENABLED=true` y redeploy.

### 11.9 Activar Idealista (Fase 2.c — opcional)

**Pre-requisitos:**

1. Crear zone dedicada `web_unlocker_market` en Bright Data dashboard:
   - **Premium Domains**: ON (sin esto, Bright Data no atraviesa DataDome).
   - **Custom Headers & Cookies**: OFF (factura el 100% de requests si está ON).
   - **Captcha solving**: ON (default).
2. Verificar smoke local OK:

   ```bash
   npx tsx scripts/smoke-idealista-direct.ts --limit 1
   npx tsx scripts/smoke-idealista-direct.ts --limit 5
   ```

   Cobertura esperada: ~30 cards/página con 100% de campos (precio, m², hab, title, zona, imagen). Coste ≈ $0.005/página.
3. Sembrar seeds y breaker en Neon:

   ```bash
   npx tsx scripts/seed-market-idealista-cordoba.ts
   ```

   Crea 3 `MarketSeed` (cordoba-cordoba, con-pisos, con-precio-hasta_300000) con cadencia 120 min y `MarketCircuitBreaker(source_d, CLOSED)`. Idempotente.

**Activación en Vercel** (`Settings → Environment Variables`):

```
MARKET_IDEALISTA_ENABLED=true
BRIGHTDATA_API_TOKEN=<token>
BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker_market
BRIGHTDATA_WEB_UNLOCKER_COUNTRY=es
```

Y los mismos en **Railway** (servicio `market-worker`), añadiendo además:

```
BRIGHTDATA_SCRAPING_BROWSER_URL=<wss://... CDP de Bright Data>
BRIGHTDATA_RESIDENTIAL_PROXY_URL=http://brd.superproxy.io:33335
BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME=brd-customer-...-zone-...
BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD=<password>
BRIGHTDATA_RESIDENTIAL_PROXY_SESSION=urus-market-prod
```

> **Nota**: el bloque CDP + Residencial es necesario solo para que el fallback (residential + warm-cookies) funcione cuando Web Unlocker bloquea. La validación 06/05/2026 mostró Web Unlocker resolviendo 100% de las requests; el fallback es seguro pero rara vez se ejecutará.

**Tras desplegar:**

1. Forzar 1 crawl manual desde `/platform/market/health` → tarjeta del seed Idealista → "Disparar crawl". Esperar 30s y validar:
   - `MarketCrawlRun.status = COMPLETED` y `pagesScanned ≥ 1, itemsCaptured ≈ 30`.
   - 0 entradas con `errorCode IN ('BLOCKED','FETCH_ERROR')`.
2. Configurar el cron QStash adicional (24h):

   | Cron | Cadencia | Propósito |
   |------|----------|-----------|
   | `POST {APP_URL}/api/cron/market/brightdata-success-rate` | `0 6 * * *` | Mide success rate Web Unlocker contra `idealista.com`. Persiste evento. Alerta WARN < 0.85. |

3. Monitoreo intensivo durante 48h:
   - Panel `/platform/market/health` cada 4h. Tarjeta "Idealista · Bright Data" debe mostrar `OK` (sin badges COSTE/FALLBACK).
   - Logs Railway buscando `[idealista]` y `[market-worker][idealista]`.
   - Coste Bright Data dashboard cada 12h.
4. **Plan de rollback**: si el breaker abre 2 veces en 24h o el coste mensual supera $40, poner `MARKET_IDEALISTA_ENABLED=false` en Vercel + Railway y redeploy. Los seeds quedan en DB; el flag los apaga.

### 11.10 Activar Fotocasa con Bright Data (mayo 2026 — opcional)

Por defecto Fotocasa usa `direct-browser` (sin Bright Data): captura página 1 del listing (~25 cards) y el detalle queda bloqueado por PerimeterX/HUMAN. Activar Web Unlocker desbloquea **todo** lo siguiente sin browser interactivo:

- Listado pag.1–5 (31 anuncios por página, todos con teléfono y descripción).
- Detalle: teléfono del anunciante, descripción completa, galería completa (~62 fotos típicas), tipo de anunciante, código interno del anunciante.
- **No** simula click "Ver teléfono" — el HTML estático ya trae el teléfono en `window.__INITIAL_PROPS__.realEstateAdDetailEntityV2.publisher.phone`.
- **No** requiere residential proxy ni warm sessions ni scraping browser CDP.

**Pre-requisito CRÍTICO en Bright Data — `Manual 'expect' elements`:**

La implementación reutiliza la **misma zona** de Idealista (`BRIGHTDATA_WEB_UNLOCKER_ZONE`) pasando un header per-request `x-unblock-expect: {"element":"body"}` que sobreescribe el `expect_element=.re-SharedTopbar` que la zona tiene configurado para Idealista (NO existe en Fotocasa y produce HTTP 502 sin override).

Para que Bright Data acepte el header debe estar habilitado **`Manual 'expect' elements`** en la configuración avanzada de la zona:

1. Abrir https://brightdata.com/cp/zones → seleccionar la zona usada (ej. `web_unlocker1`).
2. **Configuration → Advanced settings → Custom Web Unlocker API**.
3. Activar el toggle **"Manual 'expect' elements"** y guardar.
4. ⚠️ Esto cambia la facturación de la zona a 100% (todas las requests cuentan, no solo las exitosas). Si quieres separar facturación por portal, crea una zona dedicada con el mismo toggle activado y ponla en `BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE`.

**Verificación manual con curl:**

```bash
curl -s -X POST https://api.brightdata.com/request \
  -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone":"web_unlocker1","url":"https://www.fotocasa.es/es/comprar/viviendas/cordoba-capital/todas-las-zonas/l","format":"raw","country":"es","headers":{"x-unblock-expect":"{\"element\":\"body\"}"}}' \
  -D /tmp/headers.txt -o /tmp/fotocasa-listing.html

# Esperado:
#   - HTTP 200, file size > 1 MB
#   - HTML contiene `window.__INITIAL_PROPS__`
#   - `x-brd-status-code: 200` (NO 502)
grep -c "__INITIAL_PROPS__" /tmp/fotocasa-listing.html  # > 0
wc -c /tmp/fotocasa-listing.html                          # > 1000000
```

Si Bright Data devuelve HTTP 400 con `feature_not_active: Manual expect is not enabled for this zone` → revisa el toggle en el dashboard.

Si devuelve HTTP 502 con `waiting for selector ".re-SharedTopbar" failed` → el header `x-unblock-expect` no está siendo enviado o la zona ignora el override (toggle desactivado).

**Activación en Vercel** (`Settings → Environment Variables`):

```
MARKET_FOTOCASA_USE_BRIGHTDATA=true
# Si quieres reusar la zona de Idealista (recomendado para empezar):
# (no definir BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE)
# Si quieres zona dedicada (mejor para métricas separadas):
# BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE=web_unlocker_fotocasa
```

**Activación en Railway** (servicio `market-worker`):

```
MARKET_FOTOCASA_USE_BRIGHTDATA=true
# Opcionales (todas tienen defaults razonables):
# BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE=                # default: hereda BRIGHTDATA_WEB_UNLOCKER_ZONE
# BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_COUNTRY=es           # default: hereda o "es"
# BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_TIMEOUT_MS=90000     # default: hereda o 90s
# MARKET_FOTOCASA_EXPECT_ELEMENT=body                   # default: "body"
# MARKET_FOTOCASA_MAX_PAGES=5                            # default: 5
# MARKET_FOTOCASA_POLITE_DELAY_MS=4000                   # default: 4s
```

> Solo se requiere `BRIGHTDATA_API_TOKEN` (compartido con Idealista). NO se necesitan `BRIGHTDATA_RESIDENTIAL_PROXY_*` ni `BRIGHTDATA_SCRAPING_BROWSER_URL` para Fotocasa (a diferencia de Idealista).

**Coste estimado:**

- Web Unlocker PAYG: $1.50/1000 requests.
- Cobertura Córdoba (1 ciudad): ~5 páginas/ciclo · 4 ciclos/día · 30 días = 600 listing-requests/mes.
- Detalle: ~150 anuncios nuevos/semana · 4 = 600 detail-requests/mes.
- **Total: ~1200 requests/mes ≈ $1.80/mes adicional** sobre Idealista.

**Tras desplegar:**

1. Smoke local opcional (con worker en `npm run dev`):

   ```bash
   npx tsx scripts/test-market-worker-local.ts --portal fotocasa --limit 1
   ```

   Esperado: `MarketCrawlRun.status = COMPLETED`, `pagesScanned ≥ 1, itemsCaptured ≥ 25`.

2. Forzar 1 crawl manual desde `/platform/market/health` → tarjeta de Fotocasa → "Disparar crawl". Validar:
   - `pagesScanned ≥ 3` (Web Unlocker debe llegar a más de 1 página sin bloqueos).
   - 0 entradas con `errorCode='BLOCKED'`.

3. Forzar 1 fetch-detail en una ficha nueva sin teléfono. Validar:
   - `MarketListing.phones.length > 0` (Fotocasa entrega el teléfono SIN click via `__INITIAL_PROPS__`).
   - `MarketListing.description IS NOT NULL`.
   - `MarketListing.imageUrls.length > 5`.
   - `MarketListing.cadastralRef IS NULL` (Fotocasa NO expone catastral).

4. Monitoreo 48h:
   - Panel `/platform/market/health`: tarjeta Fotocasa debe mostrar `OK`.
   - Logs Railway buscando `[market-worker] Fotocasa Bright Data habilitado: zone=...`.
   - Coste Bright Data dashboard cada 12h. Esperado: ≤ $2.00/mes adicional.

5. **Rollback**: poner `MARKET_FOTOCASA_USE_BRIGHTDATA=false` en Vercel + Railway y redeploy. Fotocasa vuelve a direct-browser (página 1 + detalle bloqueado). Sin pérdida de datos.

### 11.11 Checklist de health-check semanal

- [ ] `/platform/market/health`: todos los breakers `CLOSED`, frescura ≤ 2h.
- [ ] `count(MarketRawListing)` por día ≈ esperado (sin caídas bruscas).
- [ ] `count(MarketListing WHERE qualityScore < 0.4)` < 5% del total
      (revisar `qualityFlags` agrupados si supera).
- [ ] `count(MarketEvent WHERE type='MARKET_PROPERTY_REVIEW_REQUIRED')`
      en la semana: si > 10, recalibrar umbrales de `computePropertySimilarity`.
- [ ] Logs Railway: sin spikes de memoria ni reinicios inesperados.
- [ ] Logs Vercel `/api/cron/market/*`: 0 respuestas no-200.
