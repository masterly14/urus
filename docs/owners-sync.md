# Sincronización de propietarios de Inmovilla

## Resumen

Inmovilla REST expone los propietarios vinculados a una propiedad mediante `GET /propietarios/?cod_ofer={codigo}`. El sistema sincroniza esos datos hacia `PropertyCurrent` en los campos:

- `propietarioNombre`
- `propietarioDni`
- `propietarioPhone`
- `propietarioDomicilioFiscal`
- `propietarioRegisteredAt`

La fuente prioritaria es Inmovilla REST. Si REST devuelve un campo no vacío, se usa para sobrescribir el valor local. Si devuelve vacío o no hay propietario, no se borra información existente.

## Archivos principales

- `lib/inmovilla/rest/owners.ts`: cliente REST de propietarios y mapper `mapOwnerToPropertyOwnerPatch`.
- `lib/workers/ingestion/properties-worker.ts`: enriquece propiedades fetchadas con propietario durante la ingesta incremental.
- `lib/projections/property-projection.ts`: materializa los campos `propietario*` en `PropertyCurrent` al procesar `PROPIEDAD_CREADA` / `ESTADO_CAMBIADO`.
- `scripts/backfill-property-owners.ts`: backfill completo para propiedades ya existentes.

## Backfill operativo

Dry-run recomendado:

```bash
npm run owners:backfill -- --dry-run --limit=50
```

Ejecución real:

```bash
npm run owners:backfill
```

Opciones:

- `--dry-run`: procesa y muestra resultados sin escribir.
- `--limit=N`: limita el número de propiedades procesadas.
- `--from-codigo=CODIGO`: empieza después de un código concreto.
- `--no-resume`: ignora el checkpoint.

El checkpoint se guarda en `kv_store` con key `backfill:owners:lastCodigo`.

## Rate limits

La documentación de Inmovilla marca `/propietarios` con límite de 20 peticiones/minuto y 100/10 minutos. El backfill usa `OWNERS_BACKFILL_DELAY_MS` (default `3500`) para mantener margen.

La ingesta incremental ya procesa fichas de propiedad con un intervalo conservador, por lo que añadir una llamada de propietario por ficha cambiada queda por debajo del límite de propietarios.

## Verificación

- Tests unitarios: `npm test -- lib/inmovilla/rest/__tests__/owners.test.ts`
- Proyección con propietario: `npm test -- lib/projections/__tests__/property-projection.test.ts`
- Revisión manual:
  - Ejecutar dry-run con límite bajo.
  - Ejecutar backfill real con límite bajo.
  - Verificar una fila en `properties_current` con `propietarioNombre` y `propietarioRegisteredAt`.
