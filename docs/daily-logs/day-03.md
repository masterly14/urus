# Daily Log — Día 3 (Miércoles 11 Mar 2026)

**Sprint:** 1 · **Semana:** 1 · **Módulos:** M1 + M2  
**Objetivo del día:** Workers de Lectura y Escritura (Ingestion REST + Egestion + Geocoding)

---

## Trabajo completado

### AM — Ingestion Worker v1 Propiedades (API REST)

**8:30–10:30 · Entregable: Worker ejecutable con detección de cambios**

- Implementadas `fetchPropertyList` y `normalizePropertyFromRest` en `lib/inmovilla/rest/properties.ts`.
- `fetchPropertyList` llama a `GET /propiedades/?listado` con throttle 10 prop/min (undici dispatcher).
- Normalización completa de campos REST a tipos internos (`InmovillaProperty`).
- Timeout configurable con `INMOVILLA_REST_TIMEOUT_MS` (connect/body/headers via undici).

**10:30–12:30 · Entregable: Eventos fluyendo a Neon**

- Implementado `runPropertiesIngestionCycleRest` en `lib/inmovilla/ingestion/properties-rest.ts`:
  - Carga snapshot previo desde Neon (`property_snapshots`).
  - Llama a `fetchPropertyList` → lista de `cod_ofer + fechaact`.
  - Diff por `fechaact`: detecta `PROPIEDAD_CREADA`, `PROPIEDAD_MODIFICADA`, `ESTADO_CAMBIADO`.
  - Solo hace `GET /propiedades/?cod_ofer` para las propiedades que han cambiado (fetch incremental).
  - Emite eventos al Event Store (`appendEvent`).
  - Persiste snapshot actualizado.
- Fix: tipo `number | undefined` en `key_zona` al sincronizar enums (commit `009da7f`).
- Fix: `String/Number` en snapshot repo para evitar errores de tipo Int en Prisma (commit `c6c83d9`).

### PM — Ingestion Worker para Demandas + Egestion + Geocoding

**12:30–14:30 · Entregable: Lectura de demandas funcional**

- Ya implementado en días anteriores (`feat/M1-integracion-dia3`): `runDemandsIngestionCycle` vía RPA legacy.
- Endpoint: `POST /new/app/api/v1/paginacion/` con `ventana=demandas`, `lostags=20,23,26,31`.
- Diff y eventos: `DEMANDA_CREADA`, `DEMANDA_MODIFICADA`, `DEMANDA_ESTADO_CAMBIADO`.

**14:30–16:00 · Entregable: Función core de escritura dual**

- Ya implementado: `writeToInmovilla(operation, payload)` en `lib/inmovilla/write/`.
- Operaciones tipadas: `createDemand`, `updateDemandEmail`, `updateDemandPriority`.
- Vía API REST para clientes/propiedades; vía RPA legacy para demandas (login silente → CSRF → XHR a `guardar.php`).

**16:00–18:00 · Entregable: Módulo `lib/geo/` con estrategia por `key_zona`**

- Implementado `lib/geo/` (rama `feat/M2-geocoding-poligonos-demandas`):
  - Polígonos predefinidos para Córdoba, Málaga y Sevilla (Centro, Triana, Teatinos, etc.).
  - Formato Inmovilla: `;lat1+lng1,lat2+lng2,...` para `selpoli-selpoli`, `poli`, `centro`, `zoom`.
  - Geocoding con Nominatim/OSM: caché local, throttle 1 req/s, bounding box o GeoJSON.
  - Resolución en cascada: predefinidos → Nominatim → fallback a ciudad completa.
  - `buildDemandGeoFields(zone, city)` y `buildCreateDemandPayload(params)` para el Egestion Worker.
- 34 tests unitarios en `lib/geo/__tests__/` (vitest) — todos verdes.

**18:00–19:30 · Entregable: Escritura verificada end-to-end**

- Añadido test de integración `lib/inmovilla/write/__tests__/create-demand-with-geo.test.ts`:
  - Tests unitarios: `buildCreateDemandPayload` genera campos geo correctos para Córdoba, Sevilla, ciudad sin zona.
  - Test del operation-registry: `mainStep` de `createDemand` incluye campos geo en el body a `guardar.php`.
  - Test E2E (`.skipIf` sin credenciales legacy): crea demanda real en Inmovilla con polígono válido.

**19:30–20:00 · Daily log, push, documentar limitaciones**

- Commits, push y documentación completados (este archivo).

---

## Limitaciones descubiertas

### Rate limits REST (docs/inmovilla-rest-rate-limits.md)

| Recurso       | Límite      | Error             |
|---------------|-------------|-------------------|
| Propiedades   | 10/min      | HTTP 408 + `{"codigo":408,"mensaje":"Demasiadas peticiones"}` |
| Clientes      | 20/min      | HTTP 408          |
| Propietarios  | 20/min      | HTTP 408          |
| Enums         | 2/min       | HTTP 408          |

- El código `408` en este contexto **no es timeout de red** — es rate limit de Inmovilla.
- Estrategia: backoff de 60 s ante 408, enums cacheados en Neon via `sync-enums`.

### Formato de polígonos Inmovilla

- `guardar.php` requiere dos campos identicos: `selpoli-selpoli` = `poli` = `;lat1+lng1,lat2+lng2,...`
- Sin polígono, las demandas creadas programáticamente no participan en el cruce automático de Inmovilla.
- Nominatim/OSM: throttle impuesto 1 req/s (policy pública). Para zonas predefinidas no hace falta OSM.
- Coordenadas en formato `lat+lng` (símbolo `+` como separador, no coma). Separador entre puntos: `,`.
- Campo `demandas-porarea` debe ser `"1"` para activar búsqueda por polígono.

### Timeout undici configurable

- El cliente REST usa `undici` con dispatcher; los timeouts (connect/body/headers) se configuran via `INMOVILLA_REST_TIMEOUT_MS`. Valor por defecto 30 000 ms.
- Sin esta configuración, peticiones lentas de Inmovilla podían cortar antes de recibir respuesta completa.

---

## Ramas / PRs del día

| Rama                                  | Estado   | Descripción                                          |
|---------------------------------------|----------|------------------------------------------------------|
| `feat/M1-ingestion-worker-rest`       | pushed   | Ingestion Worker v1 propiedades vía API REST          |
| `feat/M2-geocoding-poligonos-demandas`| pushed   | Módulo `lib/geo/` + tests + test integración Egestion |

**Commits del día (M1 REST):**
- `5e14056` feat(M1): añadir fetchPropertyList y normalizePropertyFromRest en REST propiedades
- `8055c7f` fix(M1): timeout configurable con dispatcher undici
- `c6f32ba` feat(M1): ingestion worker propiedades via API REST (listado + fetch incremental)
- `c6c83d9` fix(M1): forzar String/Number en snapshot repo para evitar Int en campo estado
- `009da7f` fix(M1): corregir tipo number undefined en key_zona de sync-enums
- `b829a34` docs(M1): documentar workers, rate limits, modo REST y INMOVILLA_REST_TIMEOUT_MS
- `2558b39` fix(M1): exportar fetchPropertyList y normalizePropertyFromRest desde barrel REST

**Commits del día (M2 geo):**
- `12774d0` feat(M2): módulo lib/geo para geocoding y polígonos de demandas
- `0b4cec0` test(M2): tests unitarios del módulo lib/geo

---

## Estado al cierre

| Módulo | Componente                           | Estado   |
|--------|--------------------------------------|----------|
| M1     | Ingestion Worker propiedades REST    | ✅ Done  |
| M1     | Ingestion Worker demandas (RPA)      | ✅ Done  |
| M2     | Egestion Worker (REST + RPA legacy)  | ✅ Done  |
| M2     | Módulo lib/geo polígonos             | ✅ Done  |
| M2     | Test E2E createDemand con polígono   | ✅ Done  |
| M0     | Event Store + Job Queue              | ✅ Done  |

**Mañana (Día 4):** API Routes Next.js (`/api/events`, `/api/workers/status`) + Event Consumer + Proyecciones.
