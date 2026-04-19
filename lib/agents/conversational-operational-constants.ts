/**
 * Constantes operacionales compartidas entre el agente conversacional y los mocks
 * de evaluación. Un solo origen para que el prompt, la tool real y los mocks
 * hablen del mismo plazo ante el comprador.
 *
 * Si cambia la SLA interna del comercial, actualiza aquí y se refleja en todos
 * los canales (respuesta del agente, evals, UI de debug).
 */

/**
 * Plazo estimado (minutos) entre que se encola una nueva selección y llega
 * al comprador tras la validación del comercial humano. Es el número que el
 * agente puede comunicar al comprador como "unos ~X minutos".
 */
export const MICROSITE_HANDOFF_ETA_MINUTES = 30;

/**
 * Texto estándar que la tool entrega al agente como "agentGuidance" para que
 * no se invente plazos ni omita la existencia del paso de validación humano.
 */
export const MICROSITE_HANDOFF_STANDARD_MESSAGE =
  `Nueva selección encolada. Un compañero del equipo la revisa antes de enviársela al comprador; ` +
  `normalmente tarda unos ${MICROSITE_HANDOFF_ETA_MINUTES} minutos en llegar.`;
