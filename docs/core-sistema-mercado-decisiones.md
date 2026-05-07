# Core de Inteligencia de Mercado — Decisiones de Fase 0

> Documento vinculante. Recoge las decisiones bloqueantes acordadas para arrancar la implementación descrita en `docs/core-sistema-mercado-plan-implementacion.md`. Sin estas decisiones la Fase 1 no es ejecutable.
>
> **Versión:** 1.0
> **Fecha:** 6 de mayo de 2026
> **Alcance:** V1 del Core (piloto)

---

## 1. Cobertura

### 1.1 Geografía
- **V1:** piloto **solo Córdoba capital**.
- Modelo de datos preparado para multi-ciudad desde el inicio (`MarketSeed` ya soporta varias ciudades), pero solo se cargarán seeds de Córdoba capital.
- Expansión a otras ciudades queda fuera del alcance V1; se evalúa en V2 según resultados.

### 1.2 Operación
- **V1:** solo `sale` (venta).
- El alquiler se contempla como evolución V2; el esquema ya soporta `MarketOperation = sale | rent`, pero no se rastrea ni se publica en V1.

### 1.3 Tipologías cubiertas
Se incluyen en V1:
- `flat` — pisos y apartamentos
- `house` — casas, chalets, unifamiliares
- `penthouse` — áticos
- `duplex` — dúplex
- `studio` / `loft` — estudios y lofts
- `countryhouse` — casas de campo y fincas
- `garage` — garajes
- `premises` / `office` — locales y oficinas

Se excluyen explícitamente en V1:
- `land` (solares y terrenos)
- `building` (edificios completos)
- `room` (alquiler de habitaciones)
- `storage` / `warehouse`

### 1.4 Volumen estimado
- Inventario activo objetivo en Córdoba capital: **5.000 – 15.000 listings sumando todas las fuentes**.
- Este es el volumen sobre el que se dimensiona la infraestructura: cron, batches, TTL, índices.

### 1.5 Consumidores en V1
- **Ninguno** definido como consumidor productivo en V1.
- V1 construye únicamente la **capa de datos** (adquisición → normalización → identidad → snapshot → eventos).
- La integración con matching, pricing, captación o paneles UI se aborda en V2 una vez los datos sean estables.
- Se mantienen disponibles los endpoints internos `/api/market/*` (lectura) para validación operativa, no para consumo de producto.

---

## 2. Fuentes y estrategia anti-bot

### 2.1 Portales objetivo

> **Actualizado 6 de mayo de 2026 (post-Fase 2.b).** El alcance del MVP se
> reduce a Fotocasa y Pisos.com tras el discovery real de portales. Idealista
> y Milanuncios quedan reconocidos en el modelo (`MarketSource` los conserva)
> pero **no se ejecutan en MVP** y sus crons quedan apagados.

| Portal       | ¿Activo en MVP? | Motivo                                                                                                                                                                                                                                |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fotocasa     | Sí              | Discovery confirma viabilidad con `directBrowser` + scroll lazy + `hydratedSelector`. Sin coste de proxy en V1.                                                                                                                       |
| Pisos.com    | Sí              | Discovery confirma viabilidad con `directBrowser`. JSON-LD `SingleFamilyResidence` disponible y estable.                                                                                                                              |
| Milanuncios  | **No (fuera de MVP)** | PerimeterX/HUMAN bloquea incluso `playwright-extra` + `puppeteer-extra-plugin-stealth` en modo headed. Reactivación requiere Bright Data Web Unlocker y replantear presupuesto (§6.1). Detalle del intento en `docs/portal-html-analysis.md`. |
| Idealista    | **No (MVP base)** | DataDome agresivo. Bright Data Web Unlocker (premium domain) ya validado en producción para Statefox image cache (`docs/statefox-image-cache.md`). Reactivación en Fase 2.c, con la mayor parte de la infraestructura anti-bot ya construida en `lib/scraping/` (cliente Web Unlocker, warm-session, ghost-cursor, navegación humana, detección de bloqueo). Plan detallado en `docs/core-mvp-status.md` §4. |

### 2.2 Estrategia anti-bot
Política: **caso por caso por portal**. No hay default global.

| Portal       | Protección conocida           | Estrategia                                                                                                                |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fotocasa     | WAF ligero + 403 en pág. 2+   | `directBrowser` con `scrollToBottom` y `hydratedSelector` (`article[data-testid="property-card"]`). MVP cubre página 1 (~25 cards/seed). Pagination y detail pages se difieren a Fase 3 con Web Unlocker. |
| Pisos.com    | Sin protección reactiva detectada | `directBrowser` extrayendo JSON-LD (`SingleFamilyResidence`) y completando con DOM. Pagination soportada (`?pagina=N`).   |
| Milanuncios  | PerimeterX / HUMAN (alto)     | **Fuera de MVP.** Para reactivar: chain `webUnlocker` → `residentialProxy` con sesión cálida, plantillas de cookie, etc.   |
| Idealista    | DataDome (alta)               | **Fuera de MVP base.** Chain probada en producción (Statefox): `webUnlocker` (Bright Data REST, premium domain, `country=es`) **primary** → `residentialProxy` (Playwright + proxy residencial) con cookies cálidas inyectadas como fallback. **Bright Data Browser API por CDP devuelve 403 contra Idealista** (DataDome bloquea el handshake antes del unblocking interactivo), por eso CDP solo se usa para calentar cookies en home y nunca como path primario. Custom Headers & Cookies en la zone Web Unlocker queda **deshabilitado** (activarlo factura el 100 % de requests, éxito + fallo). |

Reglas comunes:
- **Circuit breaker por fuente** (estado en `MarketCircuitBreaker`).
- **Budget por seed** (`budgetMs`, `budgetRequests`).
- **Respeto a robots.txt en endpoints listing**; si una fuente prohíbe categóricamente el listado, esa fuente queda fuera hasta acuerdo formal.
- **Sin scraping de datos de contacto privados** más allá de lo expuesto públicamente por el portal.

### 2.3 Frecuencia mínima por fuente y ciudad
- **Cadencia base por seed:** 120 minutos (alineada con frescura objetivo).
- Para seeds críticos (centro de Córdoba, rangos de precio caliente) se permite cadencia agresiva de 60 minutos vía override en `MarketSeed.cadenceMinutes`.

---

## 3. SLOs

### 3.1 Frescura
- **Objetivo:** ≤ 2 horas entre publicación en el portal y aparición en el snapshot del Core.
- Métrica clave: `market.snapshot.freshnessSeconds` por ciudad.
- Alerta operativa: snapshot con frescura > 4h (doble del SLO).

### 3.2 Cobertura mínima
- **Objetivo:** 85% del stock real visible por portal y ciudad.
- Validación periódica con muestreos manuales y comparativas contra portal.
- Alerta operativa: caída de cobertura > 10% día a día.

### 3.3 Latencia API
- **Pendiente.** No se fija objetivo en Fase 0.
- Se medirá tras los primeros despliegues de la API interna.
- Tras 2 semanas de operación se fija un p95 derivado de los datos reales y se documenta como adenda a este archivo.

### 3.4 Disponibilidad
- No fijada en Fase 0.
- Se asume el SLA del proveedor (Vercel + Neon + Railway) como punto de partida.
- Se revisa cuando exista un consumidor productivo del Core.

---

## 4. Identidad cross-portal

### 4.1 Política general
- **Balanceada**: auto-merge cuando el score de similitud es alto, cola de revisión manual cuando es medio, no se vincula cuando es bajo.

### 4.2 Umbrales operativos
- `score >= 0.90` → auto-merge inmediato (`MarketProperty` único).
- `0.70 <= score < 0.90` → marcar listing con `propertyId = null` y crear ítem de revisión manual.
- `score < 0.70` → no se vincula; cada listing permanece como propiedad independiente.

### 4.3 Señales utilizadas
Mínimo en V1:
- `city + zone` normalizados.
- `geohash` (precisión 7 si hay `lat/lng`).
- `builtArea ± 5%`.
- `rooms` exactas.
- `floor` cuando exista.
- Coincidencia parcial de `addressApprox`.

### 4.4 Revisión manual
- Los candidatos a revisión manual se exponen en una vista interna `/platform/market/identity/review`.
- Decisión humana: `merge` / `split` / `ignore`.
- El resultado se persiste como `MARKET_PROPERTY_MERGED` o `MARKET_PROPERTY_SPLIT` para trazabilidad.

---

## 5. Política de medios (imágenes)

### 5.1 Por defecto
- Para Fotocasa y Pisos.com (portales activos en MVP): **se guardan solo URLs originales**, sin caché de medios.
- La UI/consumidores acceden a la URL original directamente.
- Cuando Milanuncios entre en alcance, se aplicará la misma política por defecto, salvo que su CDN exija firma/expiración corta.

### 5.2 Idealista
- Las URLs de Idealista caducan rápido y suelen estar protegidas.
- Se aplica **lógica especial de caché en CDN propio (Cloudinary)** para Idealista, **solo cuando sea necesario** y **optimizando coste**.
- Política de cacheo:
  - **Lazy / on-demand**: solo se cachea cuando un consumidor concreto lo necesita (matching, microsite, panel) — no se cachea masivamente todo el inventario.
  - **Imagen principal preferente**; galería completa solo si la regla de negocio lo justifica.
  - **TTL y deduplicación por hash** para evitar doble subida.

### 5.3 Coste objetivo medios
- Mantener el plan Cloudinary actual sin gasto adicional dedicado al Core en V1.
- Si la operación de cache lazy de Idealista hace crecer el coste, se revisa en una iteración posterior.

---

## 6. Presupuesto operativo

### 6.1 Anti-bot (Bright Data Web Unlocker + residencial)
- **Tope V1: 50 USD/mes**.
- Se monitoriza en panel y se alerta al alcanzar el 80% del tope.
- Si el coste real supera el tope dos meses seguidos, se revisa la estrategia (reducir frecuencia, podar seeds, optimizar chain).

**Desglose por portal (estimación cuando entren):**

| Portal      | Volumen estimado                                                                       | Coste estimado/mes |
| ----------- | -------------------------------------------------------------------------------------- | ------------------ |
| Idealista (Fase 2.c, **solo listado**) | 3 seeds × 5 páginas × 12 ejecuciones/día × 30 días ≈ 5.400 requests/mes a ~$8/CPM (premium domain) | **~43 USD/mes**    |
| Idealista (fichas de detalle)          | 3 seeds × 25 fichas/listado × 12 × 30 ≈ 27.000 requests/mes                                       | **~216 USD/mes** (fuera de Fase 2.c) |
| Milanuncios (post-MVP)                 | Pendiente — capturar HTML real con Web Unlocker antes de estimar                                  | TBD                |

Reglas operativas con el tope:

- En Fase 2.c, **Idealista entra solo a nivel listado** (no fichas de detalle). Las fichas se difieren a una iteración posterior con presupuesto revisado.
- Si Idealista + Milanuncios juntos rebasan los 50 USD/mes, se prioriza Idealista (mayor cobertura del mercado nacional) y se difiere Milanuncios.
- La zone Web Unlocker dedicada al Worker de Mercado (`web_unlocker_market`) es **separada** de la que usa Statefox image cache, para que la facturación sea trazable por consumidor funcional.

### 6.2 Medios (Cloudinary)
- Mantener el plan actual (sin partida adicional dedicada al Core).

### 6.3 Base de datos (Neon)
- Mantener el plan actual.
- Las nuevas tablas del Core respetan la política de retención (sección 7) para no inflar el almacenamiento.

### 6.4 Cómputo (Vercel + Railway)
- Vercel: cron y endpoints API ya cubiertos por el plan actual.
- Railway: nuevo servicio dedicado al Worker del Core (tier inicial mínimo, escalado vertical solo si métricas lo justifican).

---

## 7. Privacidad, retención y cumplimiento

### 7.1 Datos del anunciante
- Se persisten:
  - `advertiserType` (`private` / `professional`).
  - `advertiserName` (cuando el portal lo expone públicamente).
  - `phones` cuando el portal los expone abiertamente.
- Se prohíbe:
  - Inferir datos personales no expuestos por el portal.
  - Compartir teléfonos de particulares con terceros fuera de la organización.

### 7.2 Retención de capturas brutas (`MarketRawListing`)
- **30 días** y purga automática diaria vía cron.

### 7.3 Retención del historial de cambios (`MarketListingVersion`)
- **12 meses**.
- Después de 12 meses se conserva agregado mensual (precio medio, cambios contados) y se descartan los detalles fila a fila.

### 7.4 Retención del snapshot y eventos
- `MarketListing` y `MarketProperty`: indefinido mientras tengan actividad reciente.
- Listings sin actividad > 12 meses: se mueven a tabla histórica o se marcan como `archived`.
- `MarketEvent`: indefinido en V1, se evalúa particionado por mes en V2.

### 7.5 Roles y permisos
- **Pendiente**: definir roles concretos cuando exista al menos un consumidor productivo del Core.
- Por defecto, en V1: solo usuarios con rol `admin` ven endpoints `/api/market/*`. Comerciales no acceden hasta V2.

---

## 8. Arquitectura e infraestructura

### 8.1 Worker
- Servicio **Railway nuevo y dedicado** al Core (no se reutiliza el servicio Inmovilla existente).
- Permite escalar y aislar incidencias sin afectar a la sesión legacy.

### 8.2 Persistencia desde el Worker
- **Pendiente** decidir entre:
  - Worker escribe directo en Neon, o
  - Worker devuelve payload y la app lo persiste.
- Decisión se cierra en **Fase 2** con prototipo medible (latencia, complejidad operativa, manejo de errores).

### 8.3 App principal
- Vercel (sin cambios de plan).
- Endpoints `/api/cron/market/*` y `/api/market/*` siguen el patrón `withObservedRoute` + `isQstashAuthorized` ya establecido.

### 8.4 Scheduler
- Upstash QStash con las frecuencias documentadas en el plan de implementación, sección 5.2.

---

## 9. Decisiones explícitamente diferidas

Estas decisiones quedan registradas como **pendientes de Fase posterior**. No bloquean Fase 1.

| Tema                                              | Cuándo se decide |
| ------------------------------------------------- | ---------------- |
| Latencia API objetivo                             | Tras 2 semanas de medición real     |
| Disponibilidad (SLA formal)                       | Cuando exista un consumidor productivo |
| Estrategia anti-bot fina para Pisos.com           | Resuelto en Fase 2.b (`directBrowser` basta) |
| Reactivación de Milanuncios                       | Cuando se apruebe presupuesto Bright Data Web Unlocker |
| Reactivación de Idealista                         | Fase 2.c. Chain `webUnlocker` (premium) → `residentialProxy + warm-session-cookies`. ~70 % de la infra anti-bot reusable de `lib/scraping/`. Plan detallado en `docs/core-mvp-status.md` §4. |
| Worker persiste directo vs app persiste           | Resuelto en Fase 2: el Worker persiste directo en Neon (raw + crawl runs); normalización canónica la consume la app vía cron |
| Roles y permisos detallados                       | Cuando aparezca primer consumidor   |
| Expansión a más ciudades                          | V2                                  |
| Operación `rent`                                  | V2                                  |
| Cache masivo de medios                            | V2 si el coste justifica            |

---

## 10. Resumen ejecutivo de Fase 0 (revisión post-Fase 2.b)

- **Alcance MVP:** Córdoba capital, solo venta, tipologías residenciales + garajes + locales/oficinas.
- **Fuentes activas MVP:** **Fotocasa y Pisos.com** (extractores reales calibrados con HTML capturado en producción).
- **Fuentes diferidas (no MVP):**
  - **Milanuncios** — bloqueo PerimeterX/HUMAN; requiere Bright Data Web Unlocker.
  - **Idealista** — bloqueo DataDome. Chain probada en producción (Statefox): `webUnlocker` (Bright Data REST, premium domain) primary, `residentialProxy + warm-session-cookies` como fallback. Coste estimado solo-listado: ~43 USD/mes. Fase 2.c — ver `docs/core-mvp-status.md` §4.
- **SLO clave MVP:** frescura ≤ 2h, cobertura ≥ 85% sobre el subconjunto cubierto (Fotocasa pág. 1 + Pisos.com paginado).
- **Identidad:** balanceada, con cola de revisión manual.
- **Medios:** URLs originales; cache lazy en Cloudinary se activa cuando Idealista entre.
- **Presupuesto extra MVP:** 0 USD/mes (no se usa Bright Data en MVP). Tope ≤ 50 USD/mes se mantiene cuando reentre Milanuncios y/o Idealista.
- **Infra:** Worker dedicado en Railway con Fastify; el Worker persiste directo en Neon (raw + crawl runs).
- **Consumidores MVP:** ninguno productivo; sólo endpoints internos `/api/market/*` para QA.

Estado real al cierre de Fase 2.b: ver `docs/core-mvp-status.md` para el inventario detallado de lo entregado y lo que falta para el MVP.

---

## 11. Decisiones específicas para Fase 2.c — Idealista

> **Estado:** propuestas vinculantes basadas en evidencia operativa de Statefox image cache. **No** todas están confirmadas todavía; los huecos (§11.6) bloquean la implementación según `AGENTS.md`.

### 11.1 Calendario

- Idealista entra **después de cerrar Fases 3-6** del MVP base (normalización + identidad + snapshot/eventos + crons + API interna), no en paralelo.
- Razón: Fases 3-6 son comunes a todos los portales; bloquearlas con Idealista dispara complejidad y riesgo de presupuesto. Fotocasa y Pisos.com sirven como banco de pruebas de la pipeline.

### 11.2 Alcance funcional Fase 2.c

- **Solo listado** (página `/venta-viviendas/<ciudad>/[pagina-N.htm]`). Las fichas de detalle se difieren a iteración posterior con presupuesto revisado.
- **3 seeds** propuestos para Córdoba capital (a confirmar con muestreo manual del stock real):
  - `https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/`
  - `https://www.idealista.com/venta-viviendas/cordoba-cordoba/` (todas las tipologías)
  - `https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-precio-hasta_300000/` (segmento alto interés)
- Profundidad: 5 páginas por seed (≈125 anuncios/seed).
- Cadencia: 120 min (alineada con SLO).

### 11.3 Estrategia anti-bot

Chain definitiva (Web Unlocker primary):

```
webUnlocker (Bright Data REST, premium domain, country=es)
  └─ on block (HTTP 401/403/429 o body con "uso indebido"/"datadome")
     residentialProxy (Playwright + warm-session-cookies inyectadas)
       └─ on block
          circuit breaker abierto (10 min, 3 fallos consecutivos)
```

Reglas:

- **Custom Headers & Cookies en zone Web Unlocker = NO**. Activarlo factura el 100 % de requests (éxito + fallo) y nuestro presupuesto no lo absorbe.
- **Bright Data Browser API por CDP** se usa **únicamente** para calentar cookies de home cuando se va a la rama residential-proxy. Nunca como path primario contra una URL de listing.
- **Premium Domain habilitado** en la zone Web Unlocker (sin esto, Bright Data no desbloquea `idealista.com`).
- Detección de bloqueo unificada con la lógica ya existente en `lib/idealista/browser.ts` (`buildIdealistaAccessBlockMessage`).

### 11.4 Infraestructura

- **Zone Web Unlocker dedicada** al Worker de Mercado: `web_unlocker_market` (separada de la de Statefox para trazabilidad de coste).
- **Mapping mínimo invasivo** `MarketSource.source_d ↔ StatefoxPortalSource.idealista` en `lib/market/source-mapping.ts`. La generalización completa de `PortalWarmSession` queda como hardening V2.
- **Variables de entorno nuevas** del Worker (a documentar en `.env.example` y `docs/market-worker-deploy.md`):
  - `BRIGHTDATA_API_TOKEN`
  - `BRIGHTDATA_WEB_UNLOCKER_ZONE` (default `web_unlocker_market`)
  - `BRIGHTDATA_WEB_UNLOCKER_COUNTRY` (default `es`)
  - `BRIGHTDATA_WEB_UNLOCKER_TIMEOUT_MS` (default `60000`)
  - Las `BRIGHTDATA_RESIDENTIAL_*` y `BRIGHTDATA_SCRAPING_BROWSER_URL` ya estaban previstas en plan §4.6.

### 11.5 Observabilidad y guardrails

- Cron diario que muestrea `GET https://api.brightdata.com/unblocker/success_rate/idealista.com` y persiste métrica `market.crawl.successRate.idealista`.
- Métrica `market.crawl.cost.idealista` (€/req acumulado en el mes); alerta al **80 % del tope** (40 USD).
- Circuit breaker dedicado en `MarketCircuitBreaker(source = source_d)`: 3 fallos consecutivos → `OPEN` durante 10 min.
- Alerta operativa si la chain cae a `residentialProxy` más del 10 % de las requests en una ventana de 24 h (señal de degradación del Web Unlocker).

### 11.6 Huecos abiertos (bloquean implementación)

> Según la regla cardinal de `AGENTS.md`, no se implementa Fase 2.c hasta resolver estos puntos.

| # | Hueco | Recomendación |
|---|-------|--------------|
| 1 | Calendario: ¿Idealista antes o después del cierre de Fases 3-6? | Después. |
| 2 | Número y URL exactas de seeds Idealista para Córdoba capital | 3 seeds (§11.2). |
| 3 | ¿MVP-extendido incluye fichas de detalle? | No. Solo listado. |
| 4 | ¿Zone Web Unlocker dedicada o compartida con Statefox? | Dedicada (`web_unlocker_market`). |
| 5 | ¿Generalizamos `PortalWarmSession` ahora o mapping mínimo? | Mapping mínimo en Fase 2.c; generalización en V2. |
| 6 | ¿Premium Domain habilitado en la zone? | Sí (obligatorio). |
| 7 | ¿Custom Headers & Cookies en la zone? | No. |
| 8 | ¿Reusamos `lib/scraping/warmup-navigation/idealista.ts` desde el Worker? | Sí; `lib/idealista/*` (CLI legacy) se deja intacto. |
| 9 | Selectores DOM exactos del listado actual | Pendiente: capturar HTML real con `scripts/capture-portal-html.ts --portal idealista --via-web-unlocker` y publicar análisis en `docs/portal-html-analysis.md`. |
