# Pull Request: feat(M2) geocoding y polígonos demandas

**Abrir en GitHub:**  
https://github.com/masterly14/urus/pull/new/feat/M2-geocoding-poligonos-demandas

**Base branch:** `develop`

---

## Título del PR

```
feat(M2): módulo lib/geo para geocoding y polígonos de demandas
```

---

## Descripción (copiar en el cuerpo del PR)

```markdown
## Qué cambia

- **Módulo `lib/geo/`**: geocoding y generación de polígonos en formato Inmovilla para demandas.
- Formato Inmovilla: `;lat1+lng1,lat2+lng2,...` (selpoli-selpoli, poli, centro, zoom).
- Polígonos predefinidos para Córdoba, Málaga, Sevilla y zonas (Centro, Triana, Teatinos, etc.).
- Geocoding con Nominatim/OSM (caché, throttle 1 req/s, bounding box o GeoJSON).
- Resolución en cascada: predefinidos → Nominatim → fallback a ciudad.
- `buildDemandGeoFields` y `buildCreateDemandPayload` para integrar con el Egestion Worker.

Sin polígono válido, las demandas creadas programáticamente no sirven para el cruce automático en Inmovilla.

## Por qué

Cumplir Día 3 del plan: Geocoding y polígonos para demandas (`docs/plan.md`). El Egestion Worker escribe demandas vía RPA legacy; `guardar.php` requiere `selpoli-selpoli` y `poli` para que el cruce por área funcione.

## Cómo probarlo

- `npm run build` — debe pasar.
- `npx vitest run lib/geo/__tests__/` — 34 tests.
- Uso desde código: `import { buildCreateDemandPayload } from '@/lib/geo'` y llamar con `client`, `demand` (zone, city, presupuesto), `agent`.

## Checklist

- [x] Build pasa sin errores
- [x] Tests relevantes añadidos (34 tests en lib/geo/__tests__)
- [x] Sin secretos ni credenciales hardcodeadas
- [x] Tipos TypeScript correctos (sin `any` injustificado)
- [x] Variables de entorno documentadas en `.env.example` (no se añaden nuevas; Nominatim es público sin API key)
```
