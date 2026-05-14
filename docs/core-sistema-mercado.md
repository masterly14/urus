# Core del Sistema de Inteligencia de Mercado Inmobiliario

## Objetivo del Core

El Core transforma datos públicos heterogeneos de portales inmobiliarios en un sistema operacional confiable para captacion, analisis comparativo y toma de decisiones comerciales.

Su funcion principal es convertir eventos de mercado (alta, cambio, retirada, reaparicion) en informacion accionable con trazabilidad, calidad y latencia controlada.

---

## Principios de diseno

1. **Separacion por capas:** adquisicion, normalizacion, identidad, versionado, consulta y alertas.
2. **Idempotencia total:** cualquier proceso debe poder reintentarse sin duplicar resultados.
3. **Event sourcing operativo:** los cambios de mercado se registran como eventos inmutables.
4. **Proyecciones de lectura:** las consultas de negocio nunca dependen de recomputar todo el historico.
5. **Calidad observable:** cada registro tiene estado, score de calidad y razon de fallo cuando aplica.
6. **Escalabilidad horizontal:** procesamiento por lotes pequenos con colas y checkpoints.

---

## Capacidades funcionales del Core

### 1) Ingestion multifuente

- Rastreo de anuncios de venta/alquiler en portales objetivos.
- Descubrimiento incremental por semillas geograficas y paginacion.
- Extraccion de listados y fichas detalle con presupuesto de requests.
- Registro tecnico por captura: estado HTTP, bloqueos, timeout, huella de contenido.

### 2) Normalizacion canonica

- Mapeo de campos heterogeneos a un esquema unico de dominio.
- Estandarizacion de tipologia, operacion, ciudad, zona, direccion aproximada y metrados.
- Normalizacion de texto para matching robusto:
  - minusculas,
  - limpieza de espacios,
  - remocion de diacriticos.
- Canonicalizacion de URL para eliminar ruido de tracking.

### 3) Resolucion de identidad

El Core maneja dos niveles de identidad:

- **Listing identity:** identidad del anuncio dentro de un portal.
- **Property identity:** identidad probabilistica del inmueble subyacente entre portales.

Reglas de identidad:

- Clave fuerte por portal + listingId cuando existe.
- Fingerprint estructural por ubicacion, metrica fisica y rasgos estables.
- Motor de similitud con umbrales:
  - auto-merge (alta confianza),
  - pendiente revision (confianza media),
  - separado (baja confianza).

### 4) Versionado y deteccion de cambios

Cada listing mantiene timeline de versiones.

Cambios tipificados:

- `LISTING_CREATED`
- `LISTING_UPDATED`
- `LISTING_PRICE_CHANGED`
- `LISTING_STATUS_CHANGED`
- `LISTING_REMOVED`
- `LISTING_REAPPEARED`

El diff de negocio se ejecuta contra snapshot previo, no contra texto libre.

### 5) Snapshot de mercado consultable

Se materializa una vista de lectura optimizada para consumo de producto:

- inventario actual activo,
- filtros por ciudad/zona/tipologia/rango de precio/metros/habitaciones,
- orden por recencia, precio y relevancia,
- paginacion cursor-based.

### 6) Motor de alertas y priorizacion

Reglas tipicas:

- alta nueva en zona objetivo,
- bajada de precio relevante,
- reactivacion de anuncio retirado,
- anuncios de particular en ventanas de captacion.

Cada alerta se encola como job idempotente con SLA y trazabilidad.

---

## Pipeline backend (flujo logico)

1. **Scheduler**
   - Selecciona semillas activas y encola trabajos de rastreo.
2. **Crawler**
   - Captura listado bruto por portal/semilla/pagina.
3. **Extractor**
   - Obtiene campos estructurados de listing y detalle.
4. **Normalizer**
   - Convierte a esquema canonico de dominio.
5. **Identity Resolver**
   - Asigna listingId estable y propertyId probabilistico.
6. **Diff Engine**
   - Compara contra snapshot anterior y genera eventos de cambio.
7. **Projector**
   - Actualiza vistas de lectura (`current`, `snapshot`, `metrics`).
8. **Rules Engine**
   - Ejecuta reglas de negocio y encola alertas/acciones.
9. **API Layer**
   - Sirve resultados a paneles, buscadores y motores de recomendacion.

---

## Modelo conceptual de datos

### Entidades nucleares

- `CrawlRun`
  - identificador del ciclo, fuente, semilla, ventana temporal, metricas.
- `RawListing`
  - payload bruto por portal con metadata tecnica.
- `CanonicalListing`
  - representacion normalizada de un anuncio.
- `PropertyCluster`
  - agrupacion de listings que representan el mismo inmueble probable.
- `ListingVersion`
  - historico de cambios por listing.
- `MarketSnapshot`
  - proyeccion optimizada para consultas de negocio.
- `MarketEvent`
  - evento inmutable de cambio.
- `RuleExecution`
  - resultado de reglas y acciones generadas.

### Campos minimos por listing canonico

- identidad: `source`, `externalId`, `canonicalUrl`
- clasificacion: `operation`, `propertyType`
- precio: `price`, `currency`
- metrica: `builtArea`, `rooms`, `bathrooms`, `floor`
- ubicacion: `city`, `zone`, `addressApprox`, `lat`, `lng`
- agencia/anunciante: `advertiserType`, `advertiserName`, `phones`
- media: `imageUrls`, `mainImageUrl`
- estado: `listingStatus`, `firstSeenAt`, `lastSeenAt`
- calidad: `qualityScore`, `qualityFlags`

---

## Reglas de negocio del Core

## A. Reglas de normalizacion

- Si un valor numerico no es parseable, se guarda `null` y flag de calidad.
- Si hay conflicto entre campos de detalle y listado, prioriza detalle.
- Si `price <= 0`, no participa en filtros de rango pero permanece en inventario tecnico.
- Las comparaciones de texto geograficas usan forma normalizada.

## B. Reglas de deduplicacion

- Dedupe local por `canonicalUrl` dentro del mismo run.
- Dedupe persistente por `source + externalId`.
- Merge cross-source solo por score de similitud >= umbral alto.

## C. Reglas de estado

- Un listing pasa a `inactive` cuando desaparece de ventana de observacion definida.
- Un listing pasa a `removed` cuando hay evidencia acumulada de baja.
- `reappeared` exige re-deteccion despues de estado terminal.

## D. Reglas de calidad

- No publicar en snapshot comercial listings por debajo de score minimo.
- Registrar siempre motivo de rechazo (`missing_price`, `invalid_location`, `blocked_source`, etc.).
- Exponer conteos de cobertura por ciudad/fuente/tipologia.

## E. Reglas de idempotencia

- Cada job usa clave deterministica (`source + seed + page + cursor + window`).
- Cada evento de cambio usa fingerprint estable del before/after.
- Reintentos nunca deben crear versiones ni alertas duplicadas.

---

## Orquestacion y confiabilidad

### Cola de trabajos

Estados recomendados:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`
- `DEAD_LETTER`

Politicas:

- backoff exponencial,
- maximo de reintentos por tipo de fallo,
- bloqueo por lease temporal para evitar doble consumo.

### Circuit breaker por fuente

Se abre por:

- tasa alta de bloqueos,
- errores de red sostenidos,
- degradacion severa de parseo valido.

Comportamiento:

- detener temporalmente extraccion agresiva,
- degradar a modo conservador,
- reintento en modo half-open.

---

## API de lectura del Core

Capacidades de consulta:

- busqueda de inventario por filtros estructurados,
- facetas por ciudad/zona/tipologia/rango de precio,
- timeline de cambios por inmueble,
- feed de eventos recientes de mercado.

Requisitos:

- latencia baja y estable,
- paginacion por cursor,
- orden deterministico,
- respuestas tipadas y versionadas.

---

## Observabilidad operativa

Metricas minimas:

- listings capturados por fuente/ciclo,
- ratio de parseo valido,
- ratio de dedupe y merge cross-source,
- tiempo de ciclo end-to-end,
- tasa de errores por tipo,
- frescura del snapshot por ciudad.

Logs estructurados:

- `correlationId` por ciclo,
- `jobId`, `source`, `seed`, `phase`,
- codigo y causa de error.

Alertas de plataforma:

- snapshot stale,
- caida de cobertura por ciudad,
- incremento anomalo de bloqueos.

---

## Seguridad y cumplimiento

- Almacenar solo datos necesarios para finalidad comercial legitima.
- Trazabilidad completa de origen y timestamp por dato.
- Retencion diferenciada entre `raw` tecnico y vista comercial.
- Control de acceso por rol para datasets sensibles.

---

## SLOs recomendados del Core

- **Frescura:** inventario actualizado dentro de ventana objetivo definida.
- **Disponibilidad API:** alta disponibilidad en consultas de snapshot.
- **Integridad:** cero duplicados duros por clave de listing.
- **Confiabilidad de eventos:** al menos una vez con idempotencia efectiva.
- **Calidad:** porcentaje minimo de listings con score aceptable.

---

## Resultado esperado del sistema

El Core entrega una capa de inteligencia de mercado con tres propiedades clave:

1. **Confiable:** datos trazables, versionados y auditables.
2. **Accionable:** filtros, alertas y cambios listos para operacion comercial.
3. **Escalable:** crecimiento por ciudades, fuentes y volumen sin rediseno estructural.

