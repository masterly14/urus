/**
 * Subset Market del consumer: registra SOLO los handlers de post-crawl Market.
 *
 * Este módulo NO importa los handlers generales (whatsapp/NLU/contracts/visitas
 * /etc.) ni sus agentes LLM. Permite que el proceso dedicado `consumer:market`
 * arranque sin requerir env vars que solo necesita el consumer general
 * (`OPENAI_API_KEY`, `BETTER_AUTH_SECRET`, etc.) y sin pagar el coste de
 * importar la app completa.
 *
 * Lista canónica de tipos: `MARKET_CONSUMER_JOB_TYPES` en `./types.ts`.
 */
import {
  handleMarketNormalizeBatch,
  handleMarketFetchDetail,
  handleMarketResolveIdentity,
  handleMarketResolveAdvertiser,
  handleMarketDiffAndVersion,
  handleMarketRefreshSnapshot,
  handleMarketImportListingImages,
  handleMarketPushAdvertiserToInmovilla,
} from "@/lib/market/jobs";
import { registerJobHandler } from "./registry";

let registered = false;

/**
 * Registra los handlers Market en el registry compartido. Idempotente: si se
 * llama varias veces, no duplica registros.
 */
export function registerMarketJobHandlers(): void {
  if (registered) return;
  registerJobHandler("MARKET_NORMALIZE_BATCH", handleMarketNormalizeBatch);
  registerJobHandler("MARKET_FETCH_DETAIL", handleMarketFetchDetail);
  registerJobHandler("MARKET_RESOLVE_IDENTITY", handleMarketResolveIdentity);
  registerJobHandler("MARKET_RESOLVE_ADVERTISER", handleMarketResolveAdvertiser);
  registerJobHandler("MARKET_DIFF_AND_VERSION", handleMarketDiffAndVersion);
  registerJobHandler("MARKET_REFRESH_SNAPSHOT", handleMarketRefreshSnapshot);
  registerJobHandler("MARKET_IMPORT_LISTING_IMAGES", handleMarketImportListingImages);
  registerJobHandler(
    "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
    handleMarketPushAdvertiserToInmovilla,
  );
  registered = true;
}
