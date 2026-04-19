# Smart Closing v2 — Clarificación y Persistencia Real

Este cambio convierte la pantalla de detalle de Smart Closing en una vista respaldada por datos persistidos reales. El listado legal ya leía `LegalDocument`; ahora el detalle también se hidrata desde `LegalDocument.contractInput` en lugar de apoyarse en `fixtures`, y el historial de versiones consume eventos reales `CONTRATO_VERSIONADO`.

Además, el flujo de voz deja de aplicar cambios ambiguos automáticamente. Si el intérprete devuelve baja confianza o `ambiguousPoints`, la API responde con `needsClarification` y el contrato no se regenera ni se versiona hasta que el gestor aclare la instrucción.

## Rutas y archivos principales

- `app/api/contracts/[id]/route.ts` — detalle real del contrato para la UI de Smart Closing.
- `app/api/contracts/[id]/versions/route.ts` — historial normalizado desde el event store.
- `app/api/contracts/voice-apply/route.ts` — bloqueo por ambigüedad, logging y persistencia de versiones.
- `app/platform/legal/contratos/[id]/page.tsx` — detalle legal cargado desde persistencia real.
- `components/legal/smart-closing/use-smart-closing-session.ts` — estado cliente para `needsClarification`.
- `components/legal/smart-closing/version-history-panel.tsx` — lectura del historial real.
- `lib/contracts/voice/interpret-and-regenerate.ts` — decisión temprana de clarificación antes de regenerar DOCX.
- `lib/contracts/voice/clarification.ts` — regla de negocio para bloquear instrucciones ambiguas.
- `lib/legal/smart-closing/contracts-api.ts` — normalización compartida de `LegalDocument` y eventos.

## Endpoints HTTP

- `GET /api/contracts/[id]`
  Devuelve el contrato real listo para hidratar la pantalla: `contractTemplateInput`, `templateVersion`, `operationId`, `propertyCode`, `cloudinaryUrl` y partes.

- `GET /api/contracts/[id]/versions`
  Devuelve versiones normalizadas desde eventos `CONTRATO_VERSIONADO`, incluyendo `templateVersion`, `summary`, `confidence`, `ambiguousPoints` y `contractInput` cuando el evento lo contiene.

- `POST /api/contracts/voice-apply`
  Ahora puede devolver:
  - `ok: true` cuando el cambio se aplicó y el DOCX fue regenerado.
  - `ok: false` con `needsClarification: true` cuando la instrucción debe aclararse.
  - `ok: false` con `validationIssues` cuando el parche produce un borrador inválido.

## Eventos y persistencia

- `CONTRATO_VERSIONADO` sigue siendo la fuente de historial.
- El payload puede incluir `contractInput` para permitir reconstrucción y diff de versiones futuras.
- Si hay ambigüedad, no se emite `CONTRATO_VERSIONADO`.

## Observabilidad mínima

`voice-apply` registra:

- `kind`
- `propertyCode`
- `operationId`
- resultado (`ok`, `validation_failed`, `needs_clarification`)
- `confidence`
- número de `ambiguousPoints`
- latencia de interpretación
- latencia de regeneración
- latencia total

## Cómo probarlo

1. Abrir un contrato real desde `/platform/legal/contratos`.
2. Verificar que el detalle carga aunque no exista fixture equivalente.
3. Dictar una instrucción clara y comprobar que cambia la versión/documento.
4. Dictar una instrucción ambigua y comprobar que aparece la petición de aclaración sin versionar el contrato.
5. Revisar el historial y confirmar que muestra versiones reales persistidas.
