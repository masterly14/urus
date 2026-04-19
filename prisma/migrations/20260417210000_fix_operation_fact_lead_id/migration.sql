-- Fix C6 (recalibración de scoring): cerrar el join CommercialLeadFact ↔ CommercialOperationFact.
-- Añadimos `inmovillaDemandId` a CommercialLeadFact para poder correlacionarlo con
-- CommercialOperationFact.demandId (que es el código de demanda Inmovilla).
-- El `leadId` de CommercialLeadFact es un UUID interno (lead-xxxx) y nunca matcheará
-- contra `demandId` por sí solo.

ALTER TABLE "commercial_lead_facts" ADD COLUMN IF NOT EXISTS "inmovillaDemandId" TEXT;

CREATE INDEX IF NOT EXISTS "commercial_lead_facts_inmovillaDemandId_idx"
  ON "commercial_lead_facts"("inmovillaDemandId");
