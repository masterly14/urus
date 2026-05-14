# Instrucciones para el Agente — Urus Capital

## Regla cardinal

**No asumas nada.** Antes de implementar cualquier cambio:

1. Lee la documentación relevante en `docs/` y `README.md`.
2. Consulta `docs/plan.md` para entender el módulo, sus dependencias y el sprint actual.
3. Si la información no existe o es ambigua, **pregunta antes de actuar**. Haz preguntas claras, concretas y acotadas.

Nunca construyas funcionalidad aislada. Cada pieza debe encajar en la arquitectura de 4 capas documentada en `README.md`.

## Fuentes de verdad (leer antes de codificar)


| Qué necesitas saber                                          | Dónde está                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Arquitectura, módulos, flujos end-to-end                     | `README.md`                                                                      |
| Plan de ejecución, sprints, entregables, reglas del proyecto | `docs/plan.md`                                                                   |
| Decisiones arquitectónicas (ADRs)                            | `docs/adr/`                                                                      |
| API REST Inmovilla (endpoints, rate limits, auth)            | `docs/documentacion-api-rest-inmovilla.md`, `docs/inmovilla-rest-rate-limits.md` |
| API REST Statefox                                            | `docs/documentacion-api-rest-statefox.md`                                        |
| Workers (ingestion, egestion, endpoints legacy)              | `docs/workers.md`, `docs/workers/`                                               |
| Catálogos y enums Inmovilla                                  | `docs/catalogos-inmovilla.md`                                                    |
| Variables de entorno                                         | `.env.example`                                                                   |


Si un archivo de `docs/` puede responder tu duda, **léelo antes de preguntar o asumir**.

## Principios de desarrollo

- **Integridad holística**: cada cambio debe considerar Event Store, Job Queue, proyecciones, workers y las interfaces que consume. No hay componentes aislados.
- **Event Sourcing**: los cambios de estado se registran como eventos inmutables. No mutar estado directamente.
- **TypeScript estricto**: sin `any` injustificado. Tipar todo: payloads, responses, eventos, jobs.
- **Idempotencia**: jobs y handlers deben ser seguros de reintentar.
- **Errores explícitos**: nunca silenciar errores. Log + propagación adecuada.

## Testeo (lógica vs UI)

- **Funciones y lógica (no UI):** además de `npm test` y tests en `__tests__/`, debe existir al menos un camino ejecutable con **scripts** (por convención bajo `scripts/` y/o comandos `npm run …`) que ejercite el flujo **lo más cercano posible a producción**: mismas variables de entorno que el runtime real (salvo secretos distintos por entorno), misma pila (DB vía `DATABASE_URL`, colas, llamadas a APIs externas cuando el contrato y los rate limits lo permitan). Evitar mocks que sustituyan integraciones críticas en ese camino; el objetivo es detectar fallos de configuración y de contrato antes del deploy.
- **UI:** cuando se implemente o modifique una pantalla o flujo visual, debe poder abrirse en el navegador con un **query parameter documentado** (convención del equipo: p. ej. `mock=1`, `uiMock=1` o `fixture=demo`) que **active modo mock** (datos estáticos, fixtures o stubs en servidor/componente) para **visualizar y revisar la UI** sin depender de sesión real, datos sensibles ni backends aún no disponibles. Documentar en el código de la ruta (`page.tsx`, layout o handler) qué parámetro acepta y qué datos muestra.

Esta política está alineada con `README.md` y `docs/plan.md`.

## Git (Conventional Commits)

Formato: `<tipo>(<alcance>): <descripción imperativa en español>`

- Commits atómicos: un commit = un cambio lógico.
- Alcance: ID del módulo (`M0`–`M14`), `deps`, `ci`, etc.
- Ramas: `<tipo>/<módulo>-<descripción-kebab>` (base habitual `develop`; `main` si el flujo del equipo lo indica).
- PRs: base `develop` para integración; `main` cuando proceda (sin prohibición automática de merge a `main`).
- **Nunca** commitear `.env`, secretos ni credenciales.

## Antes de cada tarea

1. Identifica qué módulo(s) del plan toca (`M0`–`M14`).
2. Lee las secciones relevantes de `docs/plan.md` y cualquier doc de `docs/` que aplique.
3. Verifica qué existe ya en el código (busca exhaustivamente antes de crear algo nuevo).
4. Si el cambio afecta más de un módulo, confirma el impacto antes de proceder.
5. Si necesitas una dependencia nueva, verifica que no exista una alternativa ya instalada en `package.json`.

## Análisis de completitud — nada se da por hecho

Este es un producto pensado para producción. Cada funcionalidad descrita en la documentación debe llegar al código con **todos** sus parámetros operativos definidos. Si la documentación dice algo genérico (p. ej. "recordatorios automáticos", "notificación al comercial", "actualizar estado"), el agente **no puede asumir** que eso es autoexplicativo ni implementarlo superficialmente.

### Antes de implementar cualquier comportamiento, verifica que estén definidos:

| Aspecto | Pregunta que debes responder | Ejemplo de hueco |
| --- | --- | --- |
| **Canal** | ¿Por dónde se envía? (WhatsApp, email, Slack, webhook interno, push) | "Enviar recordatorio" sin canal = no implementable |
| **Destinatario** | ¿A quién? (firmante, comercial, gestor, CEO, sistema externo) | "Notificar" sin destinatario = ambiguo |
| **Disparador** | ¿Qué evento o condición lo activa? (webhook, cron, cambio de estado, timeout) | "Cuando no firme" sin definir cuándo se evalúa = indefinido |
| **Cadencia / timing** | ¿Cuándo y cada cuánto? (días naturales, hábiles; una vez, recurrente; offset desde qué evento) | "Recordatorios periódicos" sin cadencia = no implementable |
| **SLA** | ¿Hay un plazo máximo? ¿Qué pasa si se incumple? ¿Quién escala? | "Seguimiento" sin SLA ni escalado = comportamiento indefinido |
| **Persistencia** | ¿Dónde se registra? (evento en Neon, tarea, log, tabla dedicada) | "Registrar" sin tabla ni tipo de evento = no trazable |
| **Idempotencia** | ¿Qué pasa si se ejecuta dos veces? (dedup por id, upsert, check previo) | Enviar el mismo recordatorio dos veces el mismo día = bug |
| **Contenido / plantilla** | ¿Qué dice el mensaje? ¿Necesita aprobación (p. ej. Meta)? ¿Qué variables lleva? | WhatsApp proactivo sin plantilla Meta = mensaje rechazado |
| **Orquestación** | ¿Quién lo ejecuta? (cron QStash, job queue, handler síncrono, edge function) | "Job periódico" sin definir scheduler ni dedup = no construible |
| **Contingencia** | ¿Qué pasa si falla el canal, el proveedor o el destinatario no responde? | "Enviar a firma" sin plan B si el proveedor cae = riesgo sin mitigar |

### Protocolo obligatorio

1. **Detectar huecos antes de codificar.** Lee la tarea del plan y la sección correspondiente del README. Para cada comportamiento descrito, recorre la tabla anterior mentalmente. Si **cualquier** celda queda sin respuesta concreta en la documentación, **no implementes**: señala el hueco con una pregunta específica, o propón la especificación faltante para que el usuario la confirme.

2. **No rellenar huecos con suposiciones implícitas.** "Enviar recordatorio" no implica WhatsApp. "Guardar documento" no implica Cloudinary. "Actualizar estado" no implica qué campo ni qué valor. Si la documentación no lo dice, **pregunta o propón** — no asumas ni dejes el detalle para después.

3. **Buscar inconsistencias lógicas activamente.** Antes de escribir código, verifica:
   - ¿El flujo tiene un camino para **cada** rama del diagrama (éxito, fallo, timeout, dato incompleto)?
   - ¿Los eventos referenciados existen en el schema de Prisma y en la documentación de Event Sourcing?
   - ¿Los endpoints que se van a llamar existen en la documentación de la API correspondiente (`docs/documentacion-api-rest-inmovilla.md`, `docs/documentacion-api-rest-statefox.md`) y respetan sus rate limits?
   - ¿Las variables de entorno necesarias están documentadas en `.env.example`?
   - ¿Los tipos TypeScript del payload cubren todos los campos que el flujo necesita?

4. **Validar contra la realidad del stack.** Si la documentación dice "adjuntar PDF en Inmovilla" pero la API REST de Inmovilla no tiene endpoint de gestión documental, eso es una inconsistencia — no la ignores ni la implementes a ciegas. Levanta la discrepancia.

5. **Tratar cada "especificación de construcción" como contrato.** Cuando el plan incluye un bloque detallado bajo una tabla (como las specs de SLAs, cadencias y plantillas del día 15), ese bloque es **vinculante** para la implementación: no se puede simplificar, omitir campos ni cambiar valores sin confirmación explícita.

### Ejemplo concreto (anti-patrón vs patrón correcto)

**Anti-patrón:** la documentación dice "Recordatorios automáticos si no se firma". El agente implementa un `console.log('TODO: send reminder')` o un envío genérico sin canal, sin cadencia, sin SLA y sin idempotencia.

**Patrón correcto:** el agente detecta que faltan canal, cadencia, SLA, destinatario, plantilla y orquestación. Antes de escribir código, pregunta o propone la especificación completa. Solo implementa cuando **todos** los aspectos de la tabla están resueltos en la documentación o confirmados por el usuario.

## Qué NO hacer

- No crear archivos, módulos o patrones sin verificar que no existan ya.
- No inventar convenciones nuevas; seguir las existentes en el código.
- No ignorar rate limits de APIs externas (Inmovilla: 10 props/min, 20 clientes/min).
- No hardcodear valores que deben ser variables de entorno.
- No generar código comentado, código muerto o TODOs vagos.
- No responder "no sé" sin antes haber buscado en la documentación.

