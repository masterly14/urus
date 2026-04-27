# Nota de Encargo — matching diferido por referencia

## Resumen

La Nota de Encargo ya no depende de que la propiedad exista previamente en Inmovilla ni de que esté sincronizada en `PropertyCurrent`. El comercial introduce la referencia futura (`URUS09VFEDE`) en `/platform/captacion`; el sistema crea la sesión de captación, continúa con WhatsApp/Flow/firma y, cuando el worker de ingesta detecta una propiedad nueva con esa misma referencia, vincula la sesión a la propiedad real.

Este cambio elimina el cuello de botella operativo de tener que dar de alta la propiedad antes de poder preparar la visita de captación. Si la referencia ya existe en `PropertyCurrent`, el sistema vincula inmediatamente y conserva el flujo previo.

## Contrato de referencia

El parser canónico vive en `lib/routing/parse-ref-code.ts`.

- Formato estándar: `URUS{numero}{V|A}{iniciales}`. Ejemplo: `URUS09VFEDE`.
- Variante Inmovilla aceptada: `URUS{V|A}{numero}{iniciales}`. Ejemplo: `URUSV57MA`.
- `V` se interpreta como `VENTA`; `A` como `ALQUILER`.
- Las iniciales se comparan contra `Comercial.inmovillaRefCode`. Si no coinciden, la API devuelve warning pero no bloquea.

## Flujo

1. `POST /api/captacion/nota-encargo` recibe `propertyRef`, `propietarioPhone` y `visitDateTime`.
2. Si `PropertyCurrent.ref` ya existe, la sesión se crea con `propertyCode` real y estado `PENDING`.
3. Si no existe, la sesión se crea con `propertyCode = null` y estado `PENDIENTE_PROPIEDAD`.
4. El recordatorio y el WhatsApp Flow se envían igualmente; si falta dirección, los mensajes usan la referencia como fallback.
5. Si el propietario completa el Flow y firma antes del matching, `SignatureRequest` y `LegalDocument` usan `operationId = propertyCode = NOTA:<sessionId>` de forma provisional.
6. Cuando la ingesta emite `PROPIEDAD_CREADA`, `lib/nota-encargo/ref-matcher.ts` busca sesiones pendientes por `propertyRef`, rellena `propertyCode`, dirección, precio y tipo de operación, copia datos de propietario a `PropertyCurrent`, y rebindea documentos/firma al código real.

## Endpoints y archivos principales

- `app/platform/captacion/page.tsx`: UI con input de referencia y preview.
- `components/captacion/ref-input.tsx`: validación y preview por `GET /api/captacion/properties-by-ref`.
- `app/api/captacion/nota-encargo/route.ts`: creación por referencia.
- `app/api/captacion/properties-by-ref/route.ts`: preview de propiedad existente por referencia.
- `lib/nota-encargo/ref-matcher.ts`: matching diferido y rebindeo.
- `lib/workers/consumer/nota-encargo-link-handler.ts`: handler de `PROPIEDAD_CREADA`.
- `lib/nota-encargo/send-to-signature.ts`: soporte de `NOTA:<sessionId>` provisional.

## Eventos y jobs

- `NOTA_ENCARGO_VINCULADA_A_PROPIEDAD`: emitido cuando una sesión pendiente se vincula a la propiedad real.
- `NOTA_ENCARGO_PROPIETARIO_REGISTRADO`: emitido cuando se copian datos del propietario a `PropertyCurrent`.
- `NOTA_ENCARGO_SIN_PROPIEDAD_DEADLINE`: evento informativo si pasan los días configurados sin matching.
- `NOTA_ENCARGO_MATCHING_CHECK`: job informativo programado a `visitDateTime + NOTA_ENCARGO_MATCHING_DEADLINE_DAYS`.

## Variables de entorno

- `NOTA_ENCARGO_MATCHING_DEADLINE_DAYS`: días tras la visita para registrar que la referencia no apareció en Inmovilla. Default: `7`. No cancela la sesión ni envía alertas en esta iteración.
- Variables existentes de WhatsApp Flow y plantillas de Nota de Encargo siguen aplicando.

## Cómo probar

- Unit/integration: `npm test -- parse-ref-code ref-matcher nota-encargo`
- Script cercano a producción: `npm run nota-encargo:test-matching`
- UI mock: abrir `/platform/captacion?mock=1` y comprobar la sesión `PENDIENTE_PROPIEDAD`.

## Limitaciones conscientes

- No hay cancelación automática ni WhatsApp de alerta al comercial si nunca aparece la propiedad; sólo se registra el evento informativo.
- Los datos del propietario se guardan inline en `PropertyCurrent`; no hay entidad `Propietario` ni soporte explícito para copropietarios.
- No se hace backfill de sesiones históricas.
