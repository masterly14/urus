# Automatización: “Cierre → Contratos

# Autorrellenables → Revisión por Voz

# → Firma”

## Objetivo

Cuando una operación pasa a **“Reserva/Señal / Arras / Cierre acordado”** en **Inmovilla** , el
sistema:

1. extrae datos (comprador + vendedor + inmueble + comercial + precio)
2. genera contrato(s) desde plantillas
3. el **gestor revisa hablando** (modo conversación) y pide modificaciones (“cambia
    honorarios”, “pon arras penitenciales”, “plazo 30 días”, etc.)
4. el sistema aplica cambios, genera nueva versión y vuelve a presentar para OK
5. se envía a firma digital
6. se archiva y se actualiza Inmovilla con estados y documentos

## 1) Disparador (Trigger) en Inmovilla

**Evento:** cambio de estado/fase a:

```
● “Reserva/Señal”
```
```
● “Arras”
```
```
● “Operación aceptada / lista documentación”
```
**Condición mínima para disparar:**

```
● Comprador: DNI/NIE, domicilio, email/teléfono
```
```
● Vendedor: DNI/NIE, domicilio, contacto
```

```
● Inmueble: dirección + referencia interna
```
```
● Operación: precio, importes (señal/arras), plazos y forma de pago
```
```
● Agencia: comercial asignado, honorarios/comisión (si aplica)
```
📌 Si faltan campos → el sistema **no genera** y crea tarea “Faltan datos”.

## 2) Flujo lineal (diagrama de flujo exacto con revisión

## por voz)

```
● flowchart TD
● A[Inmovilla: Operación pasa a “Reserva/Arras”] -->
B{Validación campos obligatorios}
● B -->|Faltan| C[Tarea al comercial: completar datos]
● B -->|OK| D[Extraer datos:
vendedor+comprador+inmueble+precio+plazos+honorarios+comercial
]
● D --> E[Seleccionar plantilla correcta<br/>(Señal / Arras /
Anexos)]
● E --> F[Generar borrador v1 (Word/PDF) + ID de versión]
● F --> G[Gestor: revisión por voz (conversación)]
● G --> H{¿Cambios solicitados?}
● H -->|No| I[Aprobación gestor -> “OK para firma”]
● H -->|Sí| J[Captura por voz -> texto (STT)<br/>+ extracción
de instrucciones]
● J --> K[Aplicar cambios en variables /
cláusulas<br/>(honorarios, plazos, tipo arras, penalizaciones,
forma de pago, anexo mobiliario...)]
● K --> L[Regenerar contrato v2 + resumen de cambios]
● L --> G
●
● I --> M[Enviar a firma digital (comprador + vendedor)]
● M --> N{¿Firmado?}
● N -->|No| O[Recordatorios automáticos + seguimiento]
● N -->|Sí| P[Guardar firmado en expediente + adjuntar en
Inmovilla]
● P --> Q[Actualizar Inmovilla: estado, fechas, docs,
auditoría]
```

## 3) SOP interno (por roles) con revisión verbal

### Rol Comercial (mínimo)

● Cambia el estado a “Reserva/Arras”

● Completa campos faltantes si el sistema lo pide

● Si el gestor solicita datos extra (ej. “muebles incluidos”), los aporta

### Rol Gestor (control legal y calidad) — modo voz

● Abre el borrador v

● **Habla** con el sistema como contigo:

```
○ “Cambia honorarios a X + IVA”
```
```
○ “Arras penitenciales”
```
```
○ “Plazo para firma ante notario: 45 días”
```
```
○ “Incluye anexo de mobiliario”
```
```
○ “Añade cláusula de cancelación por denegación hipotecaria”
```
● El sistema:

```
○ aplica cambios
```
```
○ genera v
```
```
○ te muestra un resumen de cambios
```
● El gestor confirma: “OK para firma”

### Sistema (automatización)

● Genera borradores, versiona y registra cambios


```
● Interpreta voz y transforma en instrucciones estructuradas
```
```
● Regenera contratos y anexos
```
```
● Envía a firma digital y archiva
```
```
● Actualiza Inmovilla con todo (incluyendo auditoría)
```
## 4) Herramientas técnicas recomendadas (stack) para

## voz + contratos

### A) Motor de automatización

```
● Make (ideal para lógica/condiciones/versiones) o Zapier
```
### B) Conversación por voz (gestor) + ejecución de cambios

Necesitas 3 piezas:

1. **Captura de voz → texto (STT)**

```
○ OpenAI Speech-to-Text o Google Speech / Azure Speech
```
2. **“Intérprete” de instrucciones (LLM)**

```
○ Convierte lo verbal en acciones:
```
```
■ honorarios = 3% + IVA
```
```
■ tipo_arras = penitenciales
```
```
■ plazo_escritura = 45 días
```
```
■ clausula_hipoteca = sí/no
```
```
○ Con “confidence score” + fallback:
```
```
■ si hay ambigüedad → pregunta al gestor (“¿quieres 45 días naturales
o hábiles?”)
```
3. **Motor de plantillas + regeneración**


```
○ Documint / Plumsail / PDFMonkey o Google Docs/Word plantillas con merge
```
```
○ Soporte de:
```
```
■ variables
```
```
■ bloques condicionales (cláusulas que entran/salen)
```
```
■ anexos dinámicos
```
### C) Firma digital

```
● DocuSign / Dropbox Sign / Signaturit (muy habitual en España)
```
### D) Control de versiones y auditoría (imprescindible)

```
● Drive/SharePoint + naming estándar:
```
```
○ OP-2026-000123_Arras_v1_Borrador.pdf
```
```
○ ..._v2_CambiosGestor.pdf
```
```
○ ..._Firmado.pdf
```
```
● Registro en Inmovilla:
```
```
○ versión, fecha, autor (gestor), resumen de cambios
```
## 5) Cómo se “autorrellena completamente” con voz

## (regla de oro)

No es “editar texto a mano”. Es **editar variables y bloques** :

```
● Variables: importes, plazos, honorarios, domicilios, DNIs, cuentas...
```
```
● Bloques condicionales:
```
```
○ arras penitenciales vs confirmatorias
```
```
○ condición hipotecaria sí/no
```

```
○ entrega de llaves en firma vs en fecha posterior
```
```
○ mobiliario incluido (anexo)
```
Así, cuando el gestor dice “modifica X”, el sistema:

```
● cambia variable/bloque
```
```
● regenera el documento entero sin romper formato
```
```
● deja trazabilidad
```
# 6) ¿Cuánto tiempo se ahorra con esta

# automatización?

Te doy una estimación **operativa realista** (por operación), comparando un proceso típico
manual vs automatizado:

### Proceso tradicional (manual)

```
● Preparar contrato señal/arras: 20–45 min
```
```
● Revisar/ajustar: 10–25 min
```
```
● Versiones + enviar + perseguir firma: 10–20 min
```
```
● Archivar y actualizar CRM: 5–10 min
Total habitual: 45–100 min por operación (según complejidad)
```
### Con automatización + revisión verbal

```
● Generación v1: 2–3 min (sistema)
```
```
● Revisión gestor por voz + cambios: 5–12 min (la mayoría de casos)
```
```
● Envío firma + registro: 2–5 min (sistema)
```
```
● Archivo + actualización CRM: automático
Total habitual: 7–20 min de tiempo humano
```

✅ **Ahorro típico: 30–80 min por operación**
En porcentaje: **~60% a ~85%** menos tiempo operativo.

**Nota realista:** en operaciones complejas (cargas, herencias, varios compradores,
condiciones especiales), el ahorro sigue siendo alto, pero se acerca más a **40–60%** porque
el gestor tendrá más intervención.
