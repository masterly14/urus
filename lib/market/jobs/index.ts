/**
 * Job handlers del Core de Mercado.
 *
 * Cada handler procesa un `JobType` `MARKET_*` desde la cola JobQueue.
 * Se registran en `lib/workers/consumer/job-handlers.ts` y se incluyen en
 * `ALL_CONSUMER_JOB_TYPES` para que el cron `/api/cron/consumer` los procese.
 *
 * Ver:
 *   - docs/core-sistema-mercado-plan-implementacion.md (Fases 3-5)
 *   - docs/core-mvp-status.md §3
 */

export { handleMarketNormalizeBatch } from "./normalize-handler";
export { handleMarketFetchDetail } from "./fetch-detail-handler";
export { handleMarketResolveIdentity } from "./resolve-identity-handler";
export { handleMarketResolveAdvertiser } from "./resolve-advertiser-handler";
export { handleMarketDiffAndVersion } from "./diff-handler";
export { handleMarketRefreshSnapshot } from "./snapshot-handler";
export { handleMarketPushAdvertiserToInmovilla } from "./push-advertiser-inmovilla-handler";
