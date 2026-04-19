# Sistema de Contratos Inteligentes y Revisión por Voz (Smart Closing)

> Sistema que genera contratos automáticamente a partir de los datos de la operación, permite al gestor revisarlos y modificarlos hablando, y gestiona el ciclo completo hasta la firma.

---

## Qué problema resuelve

Preparar un contrato de arras implica recopilar datos de comprador, vendedor, inmueble, precios, plazos y condiciones de múltiples fuentes. Luego rellenar una plantilla, revisar, ajustar cláusulas, generar versiones, enviar a firma, perseguir al firmante, y archivar. Eso toma 45-100 minutos por operación y es propenso a errores.

Este sistema **automatiza el 80% del proceso**: extrae datos, genera el contrato, permite revisión por voz, versiona automáticamente, envía a firma digital, hace seguimiento, y archiva.

---

## Qué aporta

| Proceso | Manual | Automatizado |
|---|---|---|
| Preparar contrato señal/arras | 20–45 min | 2–3 min (sistema) |
| Revisar y ajustar | 10–25 min | 5–12 min (gestor por voz) |
| Versiones + enviar + perseguir firma | 10–20 min | 2–5 min (sistema) |
| Archivar y actualizar registros | 5–10 min | 0 (automático) |
| **Total humano** | **45–100 min** | **7–20 min** |

**Ahorro: ~60–85% por operación.**

---

## Cómo funciona

### Fase 1 — Generación automática del borrador

**Disparador:** una operación avanza a fase de reserva, señal o arras.

El sistema:
1. Recopila datos del comprador, vendedor, inmueble, precios y plazos desde múltiples fuentes
2. Valida que todos los campos obligatorios estén presentes
3. Si faltan datos → crea tarea para el comercial con lista exacta de lo que falta
4. Si todo está completo → selecciona la plantilla correcta (arras, señal de compra, oferta en firme)
5. Genera el documento con variables inyectadas y bloques condicionales activados
6. Sube el borrador v1 a almacenamiento seguro

**Campos que se autorrellenan:**
- Datos personales: nombres, DNI/NIE, domicilios, contacto
- Datos del inmueble: dirección, referencia catastral, registro
- Datos económicos: precio total, importe de arras/señal, cuenta bancaria
- Plazos: fecha de firma ante notario, entrega de llaves
- Cláusulas condicionales: tipo de arras (penitenciales/confirmatorias), condición hipotecaria, mobiliario incluido

### Fase 2 — Revisión por voz

El gestor abre el borrador en el panel interno y **habla** para solicitar cambios:

> "Cambia honorarios a 3% + IVA"
> "Arras penitenciales"
> "Plazo para firma ante notario: 45 días"
> "Incluye anexo de mobiliario"

El sistema:
1. **Transcribe** la voz a texto (Speech-to-Text)
2. **Interpreta** las instrucciones con IA → acciones estructuradas (qué variable cambiar, a qué valor)
3. Si hay ambigüedad → pregunta: "¿45 días naturales o hábiles?"
4. **Aplica** los cambios en las variables/bloques del contrato
5. **Regenera** el documento completo (v2, v3...) sin romper formato
6. **Muestra** un resumen de cambios al gestor

El gestor confirma: "OK para firma".

### Fase 3 — Firma digital

El sistema envía el contrato a firma electrónica (ver documento de Firma Digital):
1. Normaliza a PDF
2. Genera enlace seguro de firma
3. El firmante verifica su identidad por SMS
4. Firma en pantalla
5. Se sella el documento con evidencia forense

### Fase 4 — Seguimiento y archivo

- **Recordatorios automáticos** por WhatsApp: día +1, +3, +5
- **Escalado** si no se firma en 5 días → notificación al comercial y gestor
- **Archivo** del documento firmado con audit trail
- **Actualización** del estado de la operación en todos los sistemas

### Control de versiones

Cada cambio genera una nueva versión con naming estándar:
```
OP-2026-000123_Arras_v1_Borrador.pdf
OP-2026-000123_Arras_v2_CambiosGestor.pdf
OP-2026-000123_Arras_Firmado.pdf
```

Cada versión registra: quién hizo el cambio, cuándo, qué cambió (diff), y el documento completo.

---

## Tipos de contrato soportados

| Tipo | Cuándo se usa |
|---|---|
| **Contrato de arras** | Operación en fase de arras |
| **Señal de compra** | Operación en fase de reserva/señal |
| **Oferta en firme** | Propuesta formal al vendedor |

Cada tipo tiene su builder específico con variables y bloques condicionales propios.

---

## Tecnología

- **Motor de plantillas:** Generación programática de documentos DOCX en TypeScript
- **Speech-to-Text:** OpenAI Whisper API
- **Intérprete de instrucciones:** LangGraph con structured output (Zod)
- **Firma digital:** Motor in-house (ver documento dedicado)
- **Almacenamiento:** Cloudinary con metadatos en base de datos
- **Notificaciones:** WhatsApp Cloud API
