# Scraper Fotocasa Base

Este módulo construye una base de extracción conservadora para propiedades en venta de Fotocasa en Córdoba y Sevilla. Sirve para discovery técnico y para generar un primer dataset operativo de listados visibles, con protección explícita de `robots.txt` antes de navegar URLs semilla o detalles.

La implementación no extrae teléfonos, emails ni datos personales de contacto. La primera versión se limita a datos públicos del inmueble y del anunciante/agencia visible.

## Archivos principales

- `lib/fotocasa/config.ts`: URLs semilla, user agent y defaults de ejecución.
- `lib/fotocasa/robots.ts`: parser de `robots.txt` y evaluación de URLs con reglas `Allow`/`Disallow`.
- `lib/fotocasa/browser.ts`: contexto Playwright con locale español, user agent y aceptación básica de cookies.
- `lib/fotocasa/listings.ts`: extracción de cards visibles de resultados.
- `lib/fotocasa/details.ts`: extracción de detalle cuando la URL pasa el guard de `robots.txt`.
- `lib/fotocasa/normalize.ts`: limpieza de precio, metros, habitaciones, baños, planta, barrio e ID.
- `lib/fotocasa/storage.ts`: escritura de JSONL, CSV y reporte de discovery.
- `scripts/scrape-fotocasa.ts`: CLI de ejecución.

## Comandos

```bash
npm run scrape:fotocasa -- --city cordoba --operation sale
npm run scrape:fotocasa -- --city sevilla --operation sale
```

Opciones útiles:

- `--city cordoba|sevilla|all`
- `--max-listings 30`
- `--max-details 0`
- `--output-dir data/fotocasa`
- `--delay-ms 2500`
- `--headed`
- `--dry-run`

## Salidas

Por defecto se escriben:

- `data/fotocasa/sales.jsonl`
- `data/fotocasa/sales.csv`
- `data/fotocasa/discovery-report.json`

El reporte de discovery incluye conteo de listados, scripts JSON detectados, endpoints de Fotocasa vistos por el navegador y URLs de detalle bloqueadas por `robots.txt`.

## Límites operativos

- No se usa paginación ni filtros con parámetros restringidos hasta validar permisos.
- Si una URL semilla está bloqueada por `robots.txt`, la ejecución falla con error explícito.
- Si una URL de detalle está bloqueada, el scraper conserva solo los datos disponibles en la card del listado.
- La concurrencia inicial es secuencial y usa pausas configurables para reducir presión sobre el portal.

## Pruebas

```bash
npm test -- lib/fotocasa
```
