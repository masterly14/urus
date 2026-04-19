# Pricing v2 Hardening

Este refinamiento endurece el flujo de pricing para que el informe ya no dependa de recalcular Statefox + LangGraph cada vez que un comercial abre la vista. El análisis sigue ejecutándose en `lib/pricing/index.ts`, pero ahora materializa el resultado completo en Prisma y la UI consume esa proyección de lectura rápida.

También se añade una capa ligera de tendencia temporal para enriquecer la recomendación: antigüedad del inmueble, última actualización de ficha, ritmo de publicación de comparables y presión temporal estimada. No es aún una serie histórica persistida del mercado; es una señal operativa para mejorar diagnóstico e informe sin abrir un proyecto de datos mayor.

## Rutas y archivos principales

- `lib/pricing/index.ts` — orquesta el análisis, calcula tendencia ligera y persiste el informe materializado.
- `lib/pricing/trend-summary.ts` — resume señales temporales existentes.
- `lib/pricing/report-repo.ts` — repositorio Prisma del informe materializado.
- `app/api/pricing/analyze/route.ts` — recálculo explícito del análisis.
- `app/api/pricing/report/[code]/route.ts` — lectura rápida del último informe persistido.
- `app/platform/pricing/informe/[code]/page.tsx` — ahora carga primero el informe materializado y deja el recálculo como acción manual.
- `lib/workers/consumer/pricing-handler.ts` — asegura que los jobs de pricing dejen lista la proyección antes de notificar.
- `lib/workers/consumer/pricing-notify-handler.ts` — notificación WhatsApp con la ruta correcta del informe.
- `prisma/schema.prisma` — modelo `PricingReport`.

## Endpoints HTTP

- `POST /api/pricing/analyze`
  - Ejecuta un análisis nuevo para una propiedad.
  - Persiste eventos de pricing y actualiza `PricingReport`.
- `GET /api/pricing/report/{code}`
  - Devuelve el último informe materializado para esa propiedad.
  - Responde `404` si todavía no existe un análisis persistido.

## Persistencia y eventos

- Se mantiene el event store actual:
  - `PRICING_ANALISIS_GENERADO`
  - `PRICING_RECOMENDACION_GENERADA`
- Se añade una proyección de lectura:
  - `PricingReport` / tabla `pricing_reports`
- La proyección guarda:
  - `input`, `stats`, `comparables`, `recommendation`, `trend`, `queryMeta`
  - `analyzedAt`, `sourceTrigger`, `semaforo`, `gapPorcentaje`, `totalComparables`

## Tendencia temporal ligera

La señal temporal usa datos ya existentes:

- `input.fechaAlta`
- `input.fechaActualizacion`
- `comparables[].diasPublicado`

Con eso calcula:

- edad del inmueble
- días desde última actualización
- media y mediana de días publicados en comparables
- porcentaje de comparables recientes y estancados
- `marketTempo`, `listingMomentum` y `pressure`

## Cómo probarlo

1. Ejecutar un análisis manual: `npm run pricing:run -- --property <codigo>`
2. Verificar que existe lectura rápida: `GET /api/pricing/report/<codigo>`
3. Abrir `/platform/pricing/informe/<codigo>` y comprobar que carga el informe sin recalcular automáticamente.
4. Desde la propia vista, usar `Actualizar análisis` para forzar un recálculo explícito.
