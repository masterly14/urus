# Firma digital (In-house)

## Arquitectura

El sistema implementa **firma electrónica simple in-house**: el firmante accede a una página pública, visualiza el PDF, dibuja la firma y, si hay teléfono del firmante, completa un **OTP por SMS** antes de sellar el documento. Se captura evidencia (hash, IP, timestamp, consentimiento, imagen de firma) y se generan PDF sellado + pista de auditoría. No se utiliza ningún SaaS de firma electrónica de terceros para el acto de firmar ni para el archivo final.

## API de envío a firma (`POST /api/contracts/sign`)

1. Verifica autorización (`SIGNATURIT_SIGN_API_TOKEN` o fallback `CRON_SECRET`). El nombre de la variable es histórico; es un token server-to-server para el endpoint de envío.
2. Obtiene el documento:
   - **`cloudinaryUrl`** → descarga del recurso existente.
   - **`docxBase64`** → decodifica el base64 y lo sube a Cloudinary.
3. Normaliza a **PDF** obligatorio (conversor remoto si es DOCX; URL en `SIGNATURIT_PDF_CONVERTER_URL` si aplica).
4. Calcula **SHA-256** del PDF normalizado → `documentHash`.
5. Genera **token seguro** (`crypto.randomBytes` + HMAC) → `signingToken`.
6. Construye `signingUrl` = `{NEXT_PUBLIC_APP_URL}/firma/{signingToken}`.
7. Persiste `SignatureRequest` con `documentHash`, `signingToken`, `signingUrl`, `status: SENT`.
8. Emite evento `FIRMA_ENVIADA`.

## Página pública de firma (`/firma/{token}`)

Página Next.js sin autenticación. El firmante:

1. Accede al enlace (p. ej. recibido por WhatsApp).
2. Ve el PDF embebido y los datos del firmante.
3. Lee el texto de consentimiento y dibuja la firma manuscrita en el lienzo.
4. Pulsa **Firmar documento**.
5. `POST /api/firma/{token}/otp/send` → SMS con código (requiere teléfono del firmante en la solicitud); persistencia en `SignatureOtp` (código solo como hash).
6. El usuario introduce el código → `POST /api/firma/{token}/otp/verify`.
7. Tras OTP verificado, `POST /api/firma/{token}/sign` con `signatureImageBase64` y `otpId`.
8. El servidor:
   - Descarga el PDF de Cloudinary y verifica que el SHA-256 coincide con `documentHash` (integridad).
   - Captura IP (`x-forwarded-for`), User-Agent, timestamp UTC.
   - Genera PDF firmado con página de sello visual (nombre, fecha, hash, IP, consentimiento, imagen de firma).
   - Genera audit trail PDF con la cronología y evidencia.
   - Sube ambos a Cloudinary.
   - Actualiza `SignatureRequest` → `COMPLETED` y `LegalDocument` → `SIGNED`.
   - Emite `FIRMA_COMPLETADA`.
9. La UI muestra confirmación + enlace al documento firmado.

### Archivos implicados

| Archivo | Rol |
| --- | --- |
| `lib/firma/engine.ts` | SHA-256, tokens, utilidades de extracción de IP/UA |
| `lib/firma/token.ts` | Generación y verificación de tokens seguros (HMAC) |
| `lib/firma/pdf-stamp.ts` | Sello visual en página final del PDF firmado |
| `lib/firma/audit-trail.ts` | Generación del PDF de pista de auditoría |
| `lib/firma/otp.ts` | OTP: generar, hashear, crear, verificar |
| `lib/firma/vonage.ts` | Envío de SMS para OTP (credenciales en entorno) |
| `app/api/firma/[token]/route.ts` | GET: metadata para la página pública |
| `app/api/firma/[token]/otp/send/route.ts` | POST: enviar OTP |
| `app/api/firma/[token]/otp/verify/route.ts` | POST: verificar OTP |
| `app/api/firma/[token]/sign/route.ts` | POST: proceso de firma completo |
| `app/firma/[token]/page.tsx` | UI pública de firma |
| `app/api/contracts/sign/route.ts` | API: upload + normalización PDF + creación solicitud |
| `components/legal/smart-closing/use-smart-closing-session.ts` | Hook: `sendToSignature()` |

## Persistencia Neon (modelo + eventos)

- **Estado actual** en `signature_requests` (`SignatureRequest`): status, timestamps, SLA, reminders, hashes, token, evidencia del firmante.
- **OTP** en `signature_otps` (`SignatureOtp`): hash del código, intentos, expiración, verificación.
- **Trazabilidad** en `events` (`appendEvent`): `FIRMA_ENVIADA`, `FIRMA_COMPLETADA`, `FIRMA_RECHAZADA`, `FIRMA_EXPIRADA`, `FIRMA_RECORDATORIO_ENVIADO`, `FIRMA_SLA_ESCALADO`.

Campos relevantes en `SignatureRequest`:

- `documentHash`: SHA-256 del PDF original.
- `signingToken`: Token seguro para la URL pública (único).
- `signerIp`, `signerUserAgent`: Evidencia capturada al firmar.
- `consentText`: Texto exacto de consentimiento aceptado.
- `signedDocumentHash`: SHA-256 del PDF con sello visual.

## Variables de entorno relacionadas

Ver `.env.example`:

- `FIRMA_TOKEN_SECRET` — Clave HMAC para generación/verificación de tokens de enlace.
- `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_SMS_FROM` — Envío de SMS para OTP (si se usa el integrador actual).
- `SIGNATURIT_SLA_DAYS` — Días hasta escalado SLA (default: 5); nombre histórico.
- `SIGNATURIT_SIGN_API_TOKEN` — Token de auth server-to-server para `POST /api/contracts/sign` (nombre histórico).
- `SIGNATURIT_PDF_CONVERTER_URL` — URL del conversor DOCX→PDF (opcional).
- `SIGNATURIT_PDF_CONVERTER_TIMEOUT_MS` — Timeout del conversor (default: 45000).

## Mapeo de estados

| Acción | `SignatureRequest.status` | Evento dominio |
| --- | --- | --- |
| Envío a firma | `SENT` | `FIRMA_ENVIADA` |
| Firmante abre página | `OPENED` (si se implementa tracking) | — |
| Firmante firma | `COMPLETED` | `FIRMA_COMPLETADA` |
| Firmante rechaza | `DECLINED` | `FIRMA_RECHAZADA` |
| Expiración | `EXPIRED` | `FIRMA_EXPIRADA` |

## Validez legal

Firma electrónica simple conforme a la Ley 6/2020 (art. 3.1) y Reglamento (UE) 910/2014 (eIDAS, art. 25.1). No puede rechazarse como prueba en juicio únicamente por su formato electrónico. Válida para contratos privados entre partes (arras, señales, ofertas).

Limitación: no es firma avanzada ni cualificada. Para operaciones ante notario o registros públicos se necesitaría un QTSP.
