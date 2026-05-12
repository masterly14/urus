# Composio Gmail — flujo 2FA de Inmovilla

Este documento describe cómo el sistema obtiene de forma automática el código
2FA que Inmovilla envía por correo a Gmail durante el login RPA legacy
(necesario para `ingestion:demands` y otras operaciones legacy), y cómo
detectar/recuperarse cuando esa integración se cae.

## Componentes

| Pieza | Archivo | Responsabilidad |
| --- | --- | --- |
| Helper conexión | `lib/composio/gmail-connection.ts` | Validar que la conexión Gmail en Composio está `ACTIVE` para `COMPOSIO_USER_ID`. Devuelve `ComposioGmailNotConnectedError` tipado si no. |
| Extractor 2FA | `lib/composio/get-inmovilla-2fa-code.ts` | Pre-flight con el helper anterior + agente OpenAI con tools de Gmail para leer el último correo de `noreply1@inmovilla.com` y devolver el código de 6 dígitos. |
| Login Inmovilla | `lib/inmovilla/auth/login.ts` | Llama al extractor con reintentos si el código tarda en llegar. |
| Worker demandas | `lib/workers/ingestion/demands/demands-worker.ts` | Captura `COMPOSIO_GMAIL_NOT_CONNECTED` y dispara alerta crítica accionable. |
| Cron health | `app/api/cron/composio-gmail-health/route.ts` | Validación proactiva diaria. Alerta antes de que rompa el siguiente refresh. |
| Script debug | `scripts/debug-inmovilla-2fa.ts` | Reproduce el flujo aislado en local para depurar. |
| Clasificación | `lib/workers/ingestion/errors.ts` | Añade `COMPOSIO_GMAIL_NOT_CONNECTED` (`retryable=false`). |

## Variables de entorno

| Var | Obligatoria | Descripción |
| --- | --- | --- |
| `COMPOSIO_API_KEY` | Sí | API key de Composio. |
| `COMPOSIO_USER_ID` | Sí | User ID en Composio. La conexión Gmail debe pertenecer a este user. |
| `COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID` | Recomendada | ID `ca_…` de la conexión Gmail anclada para producción. Si está definida, se valida con `connectedAccounts.retrieve(id)`; si no, se busca cualquier conexión Gmail `ACTIVE` del usuario. |
| `OPENAI_API_KEY` | Sí | El extractor usa `gpt-4o`. |
| `CRON_SECRET` | Sí (cron) | Auth del endpoint de health (compatible con QStash). |

## Flujo end-to-end

1. `loginToInmovilla()` necesita el código 2FA.
2. `getInmovilla2FACode(sentAfter)` ejecuta:
   - `getActiveGmailConnection(composio, userId)` que valida la conexión.
   - Si falla → lanza `ComposioGmailNotConnectedError` (sin gastar tokens LLM).
   - Si OK → instancia agente OpenAI + tools Gmail y busca el último correo de `noreply1@inmovilla.com`.
   - Extrae el código numérico (regex `\d{4,8}`).
3. Si el agente devuelve un texto con `connect.composio.dev/link` (síntoma de OAuth caído), también se relanza `ComposioGmailNotConnectedError` para evitar reintentos sin sentido.
4. El worker captura `classifyError(err).code === "COMPOSIO_GMAIL_NOT_CONNECTED"`, dispara alerta crítica y aborta el ciclo (no reintenta).

## Estados posibles de la conexión

`ACTIVE` (operativo), `INITIALIZING` / `INITIATED` (OAuth no completado),
`EXPIRED` (refresh token caducado/revocado), `FAILED`, `INACTIVE`. Solo
`ACTIVE` es válido para producción.

## Recuperación

1. Abrir [https://app.composio.dev](https://app.composio.dev).
2. Localizar la cuenta Gmail vinculada al `COMPOSIO_USER_ID`.
3. Eliminar duplicados en `INITIALIZING`.
4. Crear/reautorizar la conexión Gmail (OAuth) y completar permisos.
5. Copiar el `id` (`ca_…`) y actualizar `COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID` en producción y en `.env` local.
6. Validar:
   ```bash
   npx tsx scripts/debug-inmovilla-2fa.ts
   ```

## Cron de health check

Endpoint: `POST /api/cron/composio-gmail-health` (auth `CRON_SECRET` o firma QStash).

Frecuencia recomendada: diaria (`0 6 * * *`).

Salida en éxito (HTTP 200):

```json
{ "ok": true, "userId": "1", "connectedAccountId": "ca_…", "status": "ACTIVE" }
```

Salida en fallo (HTTP 503): emite `alertGeneric(critical, …)` con
`recommendation` apuntando a Composio Console y persiste métrica
`composio:gmail:health` en `execution_metrics` (success=false, errorCode).

## Consideraciones operativas

- **Rotación OAuth**: Composio renueva `access_token` automáticamente a partir
  del `refresh_token`. La intervención humana solo es necesaria cuando
  Google revoca el `refresh_token` (cambio de password, expulsión, 6 meses sin
  uso, política de seguridad, etc.).
- **Anclaje por env**: anclar `COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID` evita que
  conexiones nuevas por error en Composio Console rompan producción.
- **Sin reintentos inútiles**: el código de error es `retryable=false` y el
  worker no espera 10 s para volver a fallar.
- **Sin gasto LLM en falla**: el pre-flight cortocircuita antes del agente
  OpenAI, así no se gastan tokens cuando Gmail no está disponible.
