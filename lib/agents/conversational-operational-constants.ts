/**
 * Constantes operacionales compartidas entre el agente conversacional y los mocks
 * de evaluación. Un solo origen para que el prompt, la tool real y los mocks
 * hablen del mismo plazo ante el comprador.
 *
 * El microsite opera en modo IA-first (ver
 * `docs/contraste-docs-originales/validacion-comercial.md`): tras `update_demand`
 * o `request_more_options`, el job `GENERATE_MICROSITE` intenta generar,
 * aprobar y enviar la selección automáticamente. Puede terminar sin envío si
 * no hay stock suficiente o si falla una dependencia externa; esas ramas deben
 * quedar auditadas por el consumer.
 *
 * Si en el futuro se reintroduce la validación manual, actualizar aquí y se
 * reflejará en todos los canales (respuesta del agente, evals, UI de debug).
 */

/**
 * Plazo estimado (minutos) entre que se encola una nueva selección y llega al
 * comprador por WhatsApp. Cubre: descripciones IA en paralelo + envío
 * WhatsApp. En condiciones normales son segundos; usamos un upper bound
 * conservador realista para que el agente comunique un plazo concreto pero
 * sincero al comprador.
 */
export const MICROSITE_DELIVERY_ETA_MINUTES = 5;

/**
 * Frase natural que el agente debe usar al hablar al comprador del plazo.
 * Cumple la regla de AGENTS.md de no decir "pronto" / "en breve": "minutos"
 * es un plazo concreto.
 */
export const MICROSITE_DELIVERY_BUYER_PHRASE = "en unos minutos te llegan aquí mismo";

/**
 * Texto estándar que la tool entrega al agente en el campo `message`. Resume
 * el side-effect operativo sin prometer entrega hasta que el worker confirme
 * que pudo crear y enviar una selección.
 */
export const MICROSITE_DELIVERY_STANDARD_MESSAGE =
  `Nueva selección encolada. El sistema intentará generar y enviar opciones fiables; ` +
  `si no encuentra stock o falla una dependencia, dejará el resultado trazado y avisará según corresponda.`;
