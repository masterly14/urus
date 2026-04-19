# Firma Live E2E

Script casi productivo para recorrer el tramo legal y de firma in-house con persistencia real en Neon y Cloudinary, envio real por WhatsApp y cierre de firma humano con OTP SMS.

## Objetivo

El script `scripts/test-signature-live-e2e.ts` hace lo siguiente:

1. Renderiza un contrato desde la misma API usada por la UI (`POST /api/contracts/render`).
2. Persiste un `LegalDocument` real en estado `DRAFT`.
3. Aprueba el contrato con `POST /api/contracts/approve`.
4. Lo envia a firma con `POST /api/contracts/sign`.
5. Procesa `FIRMA_ENVIADA` para disparar WhatsApp real al firmante.
6. Deja el `signingUrl` real listo para firma humana en navegador.
7. Espera y verifica `FIRMA_COMPLETADA`, `SignatureRequest.status = COMPLETED` y `LegalDocument.status = SIGNED`.

## Side effects reales

Este script usa servicios reales:

- Neon / Prisma
- Cloudinary
- WhatsApp Cloud API
- Vonage SMS para OTP

Ademas, tras procesar `FIRMA_COMPLETADA`, el handler real puede **encolar** `WRITE_TO_INMOVILLA`. El script verifica que ese job quede en cola, pero no ejecuta workers de escritura sobre Inmovilla.

## Variables requeridas

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `FIRMA_TOKEN_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `VONAGE_API_KEY`
- `VONAGE_API_SECRET`
- `SIGNATURIT_PDF_CONVERTER_URL`
- `CLOUDINARY_URL` o `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`

Autenticacion server-to-server:

- `SIGNATURIT_SIGN_API_TOKEN` para `POST /api/contracts/sign`, o
- `CRON_SECRET` como fallback

## Comandos

Validar prerequisitos sin side effects:

```bash
npm run firma:live-e2e -- --check-env
```

Ejecutar el flujo real:

```bash
npm run firma:live-e2e -- --confirm-live
```

Enviar y terminar sin esperar la firma humana:

```bash
npm run firma:live-e2e -- --confirm-live --no-wait
```

Cambiar fixture base o timeout:

```bash
npm run firma:live-e2e -- --confirm-live --fixture ctr-1 --timeout-minutes 30
```

## Parametros utiles

- `--fixture <id>`: fixture Smart Closing base. Default `ctr-1`.
- `--operation-id <id>`: fuerza `operationId`.
- `--property-code <id>`: fuerza `propertyCode`.
- `--signer-name <txt>`: nombre del firmante.
- `--signer-email <txt>`: email del firmante.
- `--signer-phone <txt>`: telefono del firmante y del OTP. Default `573113541077`.
- `--seller-email <txt>`: email sintetico de la contraparte.
- `--timeout-minutes <n>`: tiempo maximo de espera para firma humana.
- `--no-wait`: no espera la firma final.

## Flujo operativo recomendado

1. Ejecuta `--check-env`.
2. Ejecuta el script con `--confirm-live`.
3. Espera a que imprima el `signingUrl`.
4. Abre ese enlace en navegador.
5. Solicita el OTP en la pantalla de firma.
6. Introduce el codigo SMS recibido en el mismo numero configurado.
7. Dibuja la firma y completa el flujo.
8. Vuelve a la consola y espera la verificacion final.

## Evidencias esperadas

En Neon:

- `LegalDocument.status`: `SIGNED`
- `SignatureRequest.status`: `COMPLETED`
- evento `FIRMA_ENVIADA`
- evento `FIRMA_COMPLETADA`

En Cloudinary:

- PDF firmado (`signedDocumentUrl`)
- audit trail (`auditTrailUrl`)

En WhatsApp:

- mensaje real con el enlace de firma al numero del firmante

## Notas

- El script no automatiza la lectura del OTP desde base de datos porque eso se aleja del comportamiento real de produccion.
- El script usa un `operationId` y `propertyCode` unicos por defecto para no pisar ejecuciones anteriores.
- Si necesitas conservar las evidencias, no hace limpieza automatica.
