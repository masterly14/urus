-- AlterEnum
-- Añade el valor MARKET_PROPERTY_REVIEW_REQUIRED al enum MarketEventType.
-- Se emite por el handler MARKET_RESOLVE_IDENTITY cuando el score de
-- similitud cae en [0.70, 0.90) y el listing requiere revisión manual
-- antes de hacer merge a un MarketProperty existente.
-- Ver docs/core-mvp-status.md §3.1 y plan Fase 3.
ALTER TYPE "MarketEventType" ADD VALUE 'MARKET_PROPERTY_REVIEW_REQUIRED';
