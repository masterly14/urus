/**
 * Constantes del banco de pruebas del agente NLU de micrositios.
 *
 * No es el flujo de producción: es un simulador end-to-end que ejecuta
 * el pipeline real (Event Store + Job Queue) contra una Demand + MicrositeSelection
 * sintéticas creadas al iniciar cada sesión de test.
 */

/**
 * Teléfono único que actúa como "comprador de test". Todo WhatsApp emitido
 * por el pipeline durante una sesión de test se envía a este número.
 *
 * Es intencionalmente fijo y no configurable por usuario final: la UI
 * garantiza que nunca se mensajea a un comprador de producción aunque el
 * contexto del microsite provenga de un selection real.
 */
export const TEST_BUYER_WAID = "573113541077";

/** Prefijo para identificar recursos sintéticos creados por el banco de pruebas. */
export const TEST_RESOURCE_PREFIX = "TEST-NLU";

export const TEST_DEMAND_PREFIX = `${TEST_RESOURCE_PREFIX}-DEM`;
export const TEST_SELECTION_TOKEN_PREFIX = `${TEST_RESOURCE_PREFIX}-SEL`;

/** Nombre fijo del comercial sintético que figura en la demanda de test. */
export const TEST_COMERCIAL_ID = "test-nlu-microsite";
