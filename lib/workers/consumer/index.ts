/**
 * Barrel "completo" del consumer general.
 *
 * IMPORTAR ESTE MODULO arrastra transitivamente TODOS los handlers
 * (eventos + jobs), incluyendo agentes LLM, integraciones WhatsApp,
 * pipelines de contratos y firmas. Eso es lo que necesitan:
 *   - `/api/cron/consumer` (Vercel) — red de seguridad multi-tipo.
 *   - `scripts/run-consumer.ts` en modo general/railway.
 *   - Tests E2E e integración del consumer.
 *
 * Procesos especializados (p. ej. `consumer:market`) NO deben importar
 * desde aquí; deben importar `./consumer`, `./types` y su propio archivo
 * de registro (`./market-job-handlers`) para evitar arrastrar dependencias
 * y env vars que no usan.
 */
import "./handlers";
import "./job-handlers";

export { runConsumerCycle, runConsumerLoop } from "./consumer";
export {
  registerHandler,
  getHandler,
  getRegisteredTypes,
  registerJobHandler,
  getJobHandler,
} from "./registry";
export type { JobHandler } from "./registry";

export {
  ALL_CONSUMER_JOB_TYPES,
  MARKET_CONSUMER_JOB_TYPES,
  RAILWAY_CONSUMER_JOB_TYPES,
} from "./types";

export type {
  EventHandler,
  HandlerResult,
  ConsumerConfig,
  ConsumerCycleResult,
  ConsumerLoopResult,
} from "./types";
