-- ============================================================================
-- Fase 4 Captacion: push de publicante a Inmovilla como cliente.
-- Anade el JobType MARKET_PUSH_ADVERTISER_TO_INMOVILLA.
-- ============================================================================

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_PUSH_ADVERTISER_TO_INMOVILLA';
