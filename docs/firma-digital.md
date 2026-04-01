# Firma digital (Signaturit)

## URL canónica del webhook (`events_url`)

Al crear una petición de firma (`POST /v3/signatures.json`), el campo **`events_url`** debe apuntar a la ruta que termina en **`.json`**:

```
{NEXT_PUBLIC_APP_URL}/api/signaturit/webhook.json
```

Motivo (documentación oficial de Signaturit, sección *Events URL* en `docs/signaturing-docs/index.md`):

- Por defecto los eventos se envían como `application/x-www-form-urlencoded`.
- Para recibir el cuerpo en **JSON**, hay que añadir la extensión del tipo al final de la URL (ej. `https://ejemplo.com/ruta.json`).

La implementación expone:

| Ruta | Uso |
| --- | --- |
| `POST /api/signaturit/webhook.json` | **Producción / sandbox:** usar esta URL en `events_url` (JSON). |
| `POST /api/signaturit/webhook` | Mismo handler; útil para pruebas manuales. Requiere igualmente cuerpo JSON en el código actual. |

La lógica compartida vive en `lib/signaturit/handle-webhook-post.ts`.

## Seguridad opcional

- Signaturit indica IP de origen **34.241.96.22** (sandbox y producción). Variable: `SIGNATURIT_WEBHOOK_ALLOWED_IP` (si está vacía, no se filtra por IP).

## API de envío a firma (`POST /api/contracts/sign`)

Flujo mínimo en servidor:

1. Verifica autorización (`SIGNATURIT_SIGN_API_TOKEN` o fallback `CRON_SECRET`). Si ninguno está configurado, se permite el acceso (modo desarrollo / UI directa).
2. Obtiene el documento:
   - **`cloudinaryUrl`** → descarga del recurso existente.
   - **`docxBase64`** → decodifica el base64 y lo sube a Cloudinary (`uploadContractDocument`) para tener URL persistente.
3. Normaliza el archivo a **PDF obligatorio**:
   - Si ya es PDF, pasa directo.
   - Si no es PDF, intenta conversión remota (`SIGNATURIT_PDF_CONVERTER_URL`).
4. Crea la firma en Signaturit (`delivery_type=url`) y guarda `signaturitSignatureId` / `signaturitDocumentId`.
5. Persiste `SignatureRequest` en Neon con estado `SENT` y SLA.
6. Emite evento `FIRMA_ENVIADA`.

Si no hay conversor configurado para un documento no PDF, responde `422` con `code=PDF_CONVERSION_UNAVAILABLE`.

## Desencadenante UI (Smart Closing → Firma)

El flujo de aprobación y envío a firma se activa desde la página de detalle del contrato (`app/legal/contratos/[id]/page.tsx`):

1. El usuario revisa el borrador (con ediciones por voz opcionales).
2. Hace clic en **"Aprobar y enviar a firma"**.
3. Un diálogo solicita los datos del firmante principal (nombre pre-rellenado desde el payload, email obligatorio).
4. Al confirmar, el hook `useSmartClosingSession.sendToSignature()`:
   - Marca el borrador como aprobado (bloquea ediciones por voz).
   - Envía `POST /api/contracts/sign` con `docxBase64` (el DOCX actual en cliente), `operationId`, `propertyCode`, `documentKind`, `templateVersion` y `signers`.
5. El endpoint sube el DOCX a Cloudinary, normaliza a PDF, y envía a Signaturit.
6. La UI muestra:
   - **Spinner** durante el envío.
   - **Badge "Enviado a firma"** + enlace de firma (`signingUrl`) en caso de éxito.
   - **Banner de error** si falla cualquier paso.
7. "Reabrir revisión" resetea el estado de firma y permite editar de nuevo.

### Archivos implicados

| Archivo | Rol |
| --- | --- |
| `components/legal/smart-closing/use-smart-closing-session.ts` | Hook: `sendToSignature()`, estados `signaturePhase/Result/Error` |
| `app/legal/contratos/[id]/page.tsx` | UI: diálogo de firmante, banners de estado, badge |
| `app/api/contracts/sign/route.ts` | API: upload Cloudinary + normalización PDF + Signaturit |
| `components/legal/smart-closing/__tests__/send-to-signature.test.ts` | Test round-trip UI→API |

## Persistencia Neon (modelo + eventos)

La persistencia operativa combina:

- **Estado actual** en `signature_requests` (`SignatureRequest`): status, timestamps, SLA, reminders, ids del proveedor.
- **Trazabilidad** en `events` (`appendEvent`): `FIRMA_ENVIADA`, `FIRMA_COMPLETADA`, `FIRMA_RECHAZADA`, `FIRMA_EXPIRADA`, `FIRMA_RECORDATORIO_ENVIADO`, `FIRMA_SLA_ESCALADO`.

Esta separación permite:

- que el cron lea estado actual sin recomputar;
- que auditoría/dashboards lean la secuencia de hechos;
- idempotencia en webhook sobre estados terminales.

## Variables de entorno relacionadas

Ver `.env.example`:

- `SIGNATURIT_ACCESS_TOKEN`
- `SIGNATURIT_API_URL`
- `SIGNATURIT_EXPIRE_DAYS`
- `SIGNATURIT_SLA_DAYS`
- `SIGNATURIT_WEBHOOK_ALLOWED_IP`
- `SIGNATURIT_SIGN_API_TOKEN`
- `SIGNATURIT_PDF_CONVERTER_URL`
- `SIGNATURIT_PDF_CONVERTER_TIMEOUT_MS`

## Mapeo de eventos → Neon (resumen)

| Evento Signaturit | `SignatureRequest.status` | Evento dominio (si aplica) |
| --- | --- | --- |
| `document_opened` | `OPENED` | — |
| `document_signed` | `SIGNED` | — |
| `document_completed` | `COMPLETED` | `FIRMA_COMPLETADA` |
| `document_declined` | `DECLINED` | `FIRMA_RECHAZADA` |
| `document_expired` | `EXPIRED` | `FIRMA_EXPIRADA` |
| `document_canceled` | `CANCELED` | — |

Eventos no mapeados se responden con `{ ok: true, ignored: true }`. Estados terminales evitan reprocesar (idempotencia).

## Desarrollo local

Signaturit necesita una URL **pública** para llamar al webhook. En local, usar túnel (ngrok, Cloudflare Tunnel, etc.) y fijar `NEXT_PUBLIC_APP_URL` a esa URL base al probar callbacks.

## Sin sufijo `.json`

Si en algún entorno se configurara `events_url` **sin** `.json`, Signaturit enviaría `form-urlencoded`. El handler actual solo parsea JSON; habría que ampliar `handleSignaturitWebhookPost` leyendo `Content-Type` y parseando `formData` según el contrato del proveedor.
