# Nota de Encargo — matching diferido por referencia catastral

## Resumen

La Nota de Encargo ya no depende de que la propiedad exista previamente en Inmovilla ni de que esté sincronizada en `PropertyCurrent`. El comercial introduce la referencia catastral del inmueble en `/platform/captacion`; el sistema crea la sesión de captación, continúa con WhatsApp/Flow/firma y, cuando el worker de ingesta detecta una propiedad nueva con esa misma referencia catastral (`raw.rcatastral`), vincula la sesión a la propiedad real.

Este cambio elimina el cuello de botella operativo de tener que dar de alta la propiedad antes de poder preparar la visita de captación. Si la referencia catastral ya existe en `PropertyCurrent.refCatastral`, el sistema vincula inmediatamente y conserva el flujo previo.

## Contrato de referencia catastral

El normalizador canónico vive en `lib/nota-encargo/cadastral-ref.ts`.

- Se normaliza a mayúsculas y sin espacios.
- El formato estándar español de 20 caracteres alfanuméricos genera una validación positiva.
- Los formatos no estándar no bloquean: la API/UI devuelven warning y guardan igualmente.
- La referencia interna URUS (`PropertyCurrent.ref`) es dato derivado: se rellena cuando la propiedad aparece en Inmovilla.

## Flujo

1. `POST /api/captacion/nota-encargo` recibe `refCatastral`, `propietarioPhone` y `visitDateTime`.
2. Si `PropertyCurrent.refCatastral` ya existe, la sesión se crea con `propertyCode` real, `propertyRef` real y estado `PENDING`.
3. Si no existe, la sesión se crea con `propertyCode = null` y estado `PENDIENTE_PROPIEDAD`.
4. A la hora de la visita el comercial recibe el WhatsApp Flow; si falta dirección, los mensajes usan la referencia catastral como fallback. El PDF firmado se envía al propietario.
5. Si el propietario completa el Flow y firma antes del matching, `SignatureRequest` y `LegalDocument` usan `operationId = propertyCode = NOTA:<sessionId>` de forma provisional.
6. Cuando la ingesta emite `PROPIEDAD_CREADA`, `lib/nota-encargo/ref-matcher.ts` busca sesiones pendientes por `refCatastral`, rellena `propertyCode`, `propertyRef`, dirección, precio y tipo de operación, copia datos de propietario a `PropertyCurrent`, y rebindea documentos/firma al código real.

## Endpoints y archivos principales

- `app/platform/captacion/page.tsx`: UI con input de referencia y preview.
- `components/captacion/cadastral-ref-input.tsx`: input y preview por `GET /api/captacion/properties-by-cadastral`.
- `app/api/captacion/nota-encargo/route.ts`: creación por referencia catastral.
- `app/api/captacion/properties-by-cadastral/route.ts`: preview de propiedad existente por referencia catastral.
- `lib/nota-encargo/ref-matcher.ts`: matching diferido y rebindeo.
- `lib/workers/consumer/nota-encargo-link-handler.ts`: handler de `PROPIEDAD_CREADA`.
- `lib/nota-encargo/send-to-signature.ts`: soporte de `NOTA:<sessionId>` provisional.

## Eventos y jobs

- `NOTA_ENCARGO_VINCULADA_A_PROPIEDAD`: emitido cuando una sesión pendiente se vincula a la propiedad real por referencia catastral.
- `NOTA_ENCARGO_PROPIETARIO_REGISTRADO`: emitido cuando se copian datos del propietario a `PropertyCurrent`.
- `NOTA_ENCARGO_SIN_PROPIEDAD_DEADLINE`: evento informativo si pasan los días configurados sin matching.
- `NOTA_ENCARGO_MATCHING_CHECK`: job informativo programado a `visitDateTime + NOTA_ENCARGO_MATCHING_DEADLINE_DAYS`.

## Variables de entorno

- `NOTA_ENCARGO_MATCHING_DEADLINE_DAYS`: días tras la visita para registrar que la referencia no apareció en Inmovilla. Default: `7`. No cancela la sesión ni envía alertas en esta iteración.
- Variables existentes de WhatsApp Flow y plantillas de Nota de Encargo siguen aplicando.

## Cómo probar

- Unit/integration: `npm test -- cadastral-ref ref-matcher nota-encargo`
- Script cercano a producción: `npm run nota-encargo:test-matching`
- UI mock: abrir `/platform/captacion?mock=1` y comprobar la sesión `PENDIENTE_PROPIEDAD`.

## Limitaciones conscientes

- No hay cancelación automática ni WhatsApp de alerta al comercial si nunca aparece la propiedad; sólo se registra el evento informativo.
- Los datos del propietario se guardan inline en `PropertyCurrent`; no hay entidad `Propietario` ni soporte explícito para copropietarios.
- No se hace backfill de sesiones históricas.
