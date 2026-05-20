# Smart Closing — Guion E2E Manual (Voz/Texto)

Este guion valida en UI las mejoras recientes del asistente de contratos:

1. Soporte de `anexo_mobiliario` en `voice-apply`.
2. Modificacion por voz de `sectionAddendums`.
3. Bloqueo por aclaracion cuando hay ambiguedades (aunque la confianza sea alta).
4. Aprobacion robusta (sin continuar a firma si no persiste `approve`).

## Prerrequisitos

- App levantada en local (`npm run dev`).
- Sesion iniciada en plataforma.
- Contrato en estado `DRAFT` en:
  - `/platform/legal/contratos/[id]`
- `OPENAI_API_KEY` configurada para STT/interpretacion.

Opcional: usar contrato seed de pruebas con `scripts/seed-test-contract.ts`.

## Caso 1 — `anexo_mobiliario` por voz

Objetivo: comprobar que `voice-apply` ya no rechaza `kind="anexo_mobiliario"` y aplica cambios.

1. Abre un contrato cuyo `kind` sea `anexo_mobiliario`.
2. En la pestana **Asistente**, escribe (o dicta) este prompt:

   `Anade al anexo: mesa de comedor, cantidad 1, incluida en el precio, valor estimado 350 euros.`

3. Resultado esperado:
   - No aparece error `kind no soportado`.
   - El asistente confirma el cambio.
   - Se regenera la vista previa DOCX.
   - En el contenido del anexo aparece el item de mobiliario anadido.

## Caso 2 — `sectionAddendums` por voz

Objetivo: verificar que una instruccion de ampliar seccion se materializa en detalles por seccion.

1. Abre contrato `arras` o `senal_compra`.
2. En el asistente, envia:

   `En la seccion inmueble anade: el trastero numero 12 se transmite junto con la vivienda.`

3. Resultado esperado:
   - El asistente confirma que anadio detalle por seccion.
   - Se regenera DOCX.
   - El detalle aparece dentro de la seccion correspondiente en preview.
   - Si abres el gestor de detalles/seccion, ves el nuevo bloque persistido en sesion.

## Caso 3 — Clarificacion por ambiguedad

Objetivo: comprobar bloqueo por `ambiguousPoints` aunque la confianza no sea baja.

1. En un contrato en borrador, envia:

   `Cambia el plazo y el precio como te parezca mejor.`

2. Resultado esperado:
   - El backend responde `needsClarification: true`.
   - La UI muestra preguntas de aclaracion.
   - No se reemplaza el DOCX actual.
   - No se aplican cambios operativos hasta responder con precision.

3. Responde luego con:

   `Pon el precio en 245000 euros y plazo de escritura de 45 dias naturales.`

4. Resultado esperado:
   - Ahora si aplica cambios y regenera.

## Caso 4 — Aprobacion robusta antes de firma

Objetivo: validar que no se envia a firma si `approve` falla.

### Ruta A (happy path)

1. En `DRAFT`, pulsa **Enviar a firma**.
2. Rellena comprador (y vendedor opcional) y confirma.
3. Resultado esperado:
   - Primero persiste aprobacion (`/api/contracts/approve` OK).
   - Despues ejecuta envio a firma.
   - Estado visual correcto (enviado/aprobado) sin errores.

### Ruta B (fallo de aprobacion)

1. Simula fallo en `POST /api/contracts/approve` (por ejemplo, contrato no DRAFT o forzar error de backend).
2. Vuelve a pulsar **Enviar a firma**.
3. Resultado esperado:
   - Se muestra error de aprobacion.
   - **No** se llama al envio a firma.
   - El documento no queda marcado como aprobado en cliente.

## Checklist de salida

- [ ] `anexo_mobiliario` acepta voz y aplica cambios.
- [ ] Voz crea/amplia `sectionAddendums`.
- [ ] Ambiguedad bloquea con aclaracion y no muta DOCX.
- [ ] Aprobacion fallida bloquea envio a firma.
- [ ] Aprobacion exitosa permite envio a firma.

