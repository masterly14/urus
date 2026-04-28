# Visitas — Gestión Comercial

## Qué Cambia

El flujo principal de visitas ya no negocia horarios automáticamente por WhatsApp entre comprador y comercial. Cuando un comprador marca interés en una o varias propiedades, Urus genera un paquete operativo para el comercial: demanda, teléfono del comprador, propiedades interesadas, dirección, referencia, referencia catastral si existe y teléfonos disponibles del propietario, agencia o anunciante.

El comercial coordina la visita fuera de la plataforma llamando al propietario o agencia. Cuando ya tiene día y hora, entra en `Visitas`, selecciona la demanda y la propiedad, y registra la cita. En ese momento Urus crea el evento de Google Calendar, emite `VISITA_AGENDADA` y programa el WhatsApp Flow de parte de visita.

## Rutas y Archivos Principales

- `app/platform/visitas/page.tsx` y `app/platform/visitas/visitas-client.tsx`: pestaña interna para gestionar propiedades de interés y registrar visitas.
- `app/api/visitas/route.ts`: lista demandas con propiedades marcadas `ME_INTERESA`.
- `app/api/visitas/schedule/route.ts`: confirma una visita manualmente.
- `lib/visitas/interest-package.ts`: resuelve el paquete de visita desde `MicrositeSelectionFeedback`, `MicrositeSelection.properties` y `PropertyCurrent`.
- `lib/visitas/notify-commercial.ts`: notifica al comercial por WhatsApp con el paquete operativo.
- Plantilla Meta usada: `visita_paquete_comercial` (configurable con `WHATSAPP_TEMPLATE_VISITA_PAQUETE_COMERCIAL`).
- `lib/visitas/manual-schedule.ts`: crea calendario, `VisitSchedulingSession`, `PropertyVisitSlot`, evento `VISITA_AGENDADA` y programa el Flow.
- `lib/parte-visita/schedule.ts`: expone `scheduleParteVisitaFromDetails` para programar el Flow tanto con propiedades internas como externas.

## Datos de Contacto

Para cartera interna se usa `PropertyCurrent`: `ref`, `refCatastral`, `propietarioNombre`, `propietarioPhone`, `zona`, `ciudad`.

Para cartera externa se usa el JSON curado del microsite (`MicrositeSelection.properties`): `contactPhones`, `advertiserType`, `advertiserName`, `address`, `link`. Si no hay teléfono externo, la UI y el mensaje al comercial lo muestran explícitamente como faltante.

## Eventos y Jobs

- `SELECCION_COMPRADOR`: persiste feedback y, si la decisión es `ME_INTERESA`, marca la demanda como `VISITA_PENDIENTE` y notifica al comercial.
- `VISITA_AGENDADA`: se emite al registrar día/hora desde `Visitas`. Alimenta analítica comercial y deja trazabilidad.
- `PARTE_VISITA_ENVIAR_FORMULARIO`: se programa para la hora de la visita y dispara el WhatsApp Flow existente.

## Cómo Probar

1. Generar o usar un microsite donde el comprador haya marcado una propiedad como `ME_INTERESA`.
2. Abrir `/platform/visitas`.
3. Seleccionar la demanda y la propiedad interesada.
4. Introducir día, hora de inicio y hora de fin.
5. Confirmar. Debe crearse el evento en Google Calendar y quedar programado el Flow de parte de visita.

Tests focalizados:

```bash
npm test -- lib/visitas/__tests__/interest-package.test.ts lib/workers/consumer/__tests__/seleccion-comprador-handler.test.ts
```
