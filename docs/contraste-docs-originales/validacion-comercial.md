# Flujo de Validación Comercial (Histórico)

> Este documento conserva contexto de una etapa anterior. El flujo manual fue retirado y ya no forma parte del runtime canónico.

## Estado actual

El microsite opera en modo **IA-first**:

1. `GENERATE_MICROSITE` crea la selección.
2. La IA aprueba automáticamente (`SELECCION_VALIDADA`) tras enriquecer contenido.
3. Se encola `SEND_MICROSITE_TO_BUYER` y se envía WhatsApp con `/seleccion/{token}`.

No existe ruta activa `/validar-seleccion/*`, no hay `validationToken` y no se usa cron de SLA de validación comercial.

## Resumen histórico (encapsulado)

Antes de este refactor existía una compuerta manual:

- Job `NOTIFY_MICROSITE_PENDING_VALIDATION`.
- UI interna para aprobar/rechazar.
- SLA de 2h con escalado por cron.

Ese diseño se mantiene solo como referencia documental para trazabilidad de decisiones de producto.
