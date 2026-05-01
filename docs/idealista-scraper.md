# Scraper Idealista Base

Este módulo construye una base de extracción conservadora para propiedades en venta de Idealista en Córdoba y Sevilla. Sigue el patrón del scraper de Fotocasa, pero mantiene selectores, URLs y guardas separadas en `lib/idealista`.

La implementación no extrae teléfonos, emails ni datos personales. Solo contempla datos visibles del inmueble, anunciante/agencia, URL e imágenes.

## Archivos principales

- `lib/idealista/config.ts`: URLs semilla, user agent y defaults de ejecución.
- `lib/idealista/robots.ts`: parser de `robots.txt` y política estricta si no puede validarse.
- `lib/idealista/browser.ts`: contexto Playwright, `storageState` opcional y detección de bloqueo/403.
- `lib/idealista/listings.ts`: extracción de cards de resultados.
- `lib/idealista/details.ts`: extracción de detalle cuando la URL pasa el guard de permisos.
- `lib/idealista/normalize.ts`: limpieza de precio, metros, habitaciones, baños, planta, barrio e ID.
- `lib/idealista/storage.ts`: escritura de JSONL, CSV y reporte de discovery.
- `scripts/scrape-idealista.ts`: CLI de ejecución.

## Comandos

```bash
npm run scrape:idealista -- --city cordoba --operation sale
npm run scrape:idealista -- --city sevilla --operation sale
```

Opciones útiles:

- `--city cordoba|sevilla|all`
- `--max-listings 30`
- `--max-details 0`
- `--output-dir data/idealista`
- `--delay-ms 3000`
- `--headed`
- `--dry-run`
- `--allow-unverified-robots`
- `--storage-state path/to/storage-state.json`

## Acceso y bloqueos

Desde el entorno actual, Idealista responde `403` tanto para `robots.txt` como para las páginas de búsqueda con Playwright. El scraper no intenta saltarse CAPTCHA ni controles anti-bot. Para un uso autorizado, puede cargarse una sesión válida de Playwright con `--storage-state` o la variable `IDEALISTA_STORAGE_STATE`.

Si `robots.txt` no puede validarse, el scraper se detiene por defecto. `--allow-unverified-robots` solo debe usarse para discovery manual cuando exista autorización explícita para continuar.

Si Idealista muestra la pantalla “Se ha detectado un uso indebido / El acceso se ha bloqueado”, el scraper extrae el ID de bloqueo y la IP mostrada, y se detiene. No se debe reintentar automáticamente desde esa IP: la mitigación correcta es contactar con soporte de Idealista, usar un canal/API autorizada o ejecutar desde una sesión/ruta permitida.

## Salidas

Por defecto se escriben:

- `data/idealista/sales.jsonl`
- `data/idealista/sales.csv`
- `data/idealista/discovery-report.json`

## Pruebas

```bash
npm test -- lib/idealista
```
