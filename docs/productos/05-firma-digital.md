# Sistema de Firma Digital

> Motor de firma electrónica simple que permite a cualquier parte firmar un documento desde su móvil, con verificación de identidad por SMS y evidencia forense completa.

---

## Qué problema resuelve

Enviar un contrato a firma implica depender de plataformas externas de firma digital (coste por firma, dependencia de terceros, fricción para el firmante). Además, perseguir al firmante es trabajo manual: llamar, recordar, escalar.

Este sistema **integra la firma en el mismo ecosistema**: el firmante recibe un enlace por WhatsApp, verifica su identidad con un código SMS, firma en pantalla, y el documento queda sellado con evidencia forense. Todo sin salir de la conversación.

---

## Qué aporta

- **Cero dependencia de SaaS de firma** — sin coste por firma, sin límites de uso
- **Experiencia móvil nativa** — el firmante recibe un enlace, firma en su navegador
- **Verificación de identidad** — OTP por SMS antes de firmar
- **Evidencia forense** — IP, navegador, timestamps, hash del documento, firma manuscrita
- **Seguimiento automático** — recordatorios por WhatsApp + escalado por SLA
- **Integración total** — el estado de la firma actualiza automáticamente la operación

---

## Cómo funciona

### Flujo del firmante

```
1. Recibe enlace por WhatsApp: "Firma tu contrato de arras"
      ↓
2. Abre la página en su navegador móvil
      ↓
3. Ve el documento PDF embebido + datos de las partes
      ↓
4. Pulsa "Firmar" → recibe código SMS en su teléfono
      ↓
5. Introduce el código (máximo 5 intentos)
      ↓
6. Se abre un lienzo donde firma con el dedo
      ↓
7. Lee y acepta el texto de consentimiento
      ↓
8. Confirma → documento sellado en segundos
      ↓
9. Recibe confirmación. El equipo es notificado automáticamente.
```

### Seguridad

| Capa | Implementación |
|---|---|
| **Integridad del documento** | Hash SHA-256 calculado al crear la solicitud, verificado al firmar. Si el documento fue alterado, la firma se rechaza. |
| **Identidad del firmante** | Código OTP de 6 dígitos enviado por SMS al teléfono registrado. Hash bcrypt del código, máximo 5 intentos, expiración temporal. |
| **Consentimiento explícito** | Texto legal mostrado y aceptado antes de firmar. Registrado con el documento. |
| **Evidencia forense** | Dirección IP, User-Agent del navegador, timestamps de cada paso, hash del documento original y del firmado. |
| **No repudio** | Firma manuscrita digital + OTP verificado + hash + consentimiento = evidencia completa. |

### Documento sellado

El PDF firmado incluye:
- Firma visual del firmante insertada en el documento
- Sello de timestamp con fecha y hora exacta
- Hash de integridad
- Referencia al audit trail

### Audit trail

Se genera un PDF separado con toda la evidencia:
- Quién firmó (nombre, email, teléfono)
- Cuándo (timestamps de cada paso: envío, apertura, OTP, firma)
- Desde dónde (IP, navegador)
- Hash del documento original y del firmado
- Texto de consentimiento aceptado

### Seguimiento automático (SLA)

| Día | Acción |
|---|---|
| +1 | Recordatorio por WhatsApp al firmante |
| +3 | Segundo recordatorio |
| +5 | Último recordatorio (aviso de escalado) |
| +5 (sin firma) | Escalado: WhatsApp al comercial y al gestor |

Los recordatorios se envían solo si la firma sigue pendiente. Si el firmante ya firmó, se cancelan automáticamente.

### Rechazo

El firmante puede rechazar la firma con un motivo opcional. El documento vuelve a estado borrador y el equipo es notificado para actuar.

---

## Tecnología

- **Firma manuscrita:** Lienzo HTML Canvas (react-signature-canvas)
- **OTP:** Vonage SMS API
- **Sellado PDF:** Librería pdf-lib (inserción de imagen + metadatos)
- **Hashing:** SHA-256 nativo
- **Almacenamiento:** Cloudinary (documento firmado + audit trail)
- **Notificaciones:** WhatsApp Cloud API (Meta)
