-- M10 Dashboard Comercial: schema de métricas analíticas (facts)

-- ---------------------------------------------------------------------------
-- Lead facts (M3 / LEAD_INGESTADO + LEAD_CONTACTADO)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "commercial_lead_facts" (
  "leadId" TEXT NOT NULL,
  "ingestedEventId" TEXT,
  "tipo" TEXT NOT NULL DEFAULT '',
  "ciudad" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT '',
  "score" INTEGER,
  "slaLevel" TEXT,
  "assignedComercialId" TEXT,
  "assignedComercialNombre" TEXT,
  "contactedAt" TIMESTAMP(3),
  "contactedEventId" TEXT,
  "contactedByComercialId" TEXT,
  "contactChannel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "raw" JSONB,

  CONSTRAINT "commercial_lead_facts_pkey" PRIMARY KEY ("leadId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_lead_facts_ingestedEventId_key"
  ON "commercial_lead_facts"("ingestedEventId");

CREATE INDEX IF NOT EXISTS "commercial_lead_facts_assignedComercialId_createdAt_idx"
  ON "commercial_lead_facts"("assignedComercialId", "createdAt");

CREATE INDEX IF NOT EXISTS "commercial_lead_facts_createdAt_idx"
  ON "commercial_lead_facts"("createdAt");

CREATE INDEX IF NOT EXISTS "commercial_lead_facts_ciudad_idx"
  ON "commercial_lead_facts"("ciudad");

CREATE INDEX IF NOT EXISTS "commercial_lead_facts_source_idx"
  ON "commercial_lead_facts"("source");

-- ---------------------------------------------------------------------------
-- Visit facts (M4 / VISITA_AGENDADA + VISITA_EVALUADA)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "commercial_visit_facts" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "comercialId" TEXT,
  "comercialNombre" TEXT NOT NULL DEFAULT '',
  "fecha" TEXT NOT NULL DEFAULT '',
  "horaInicio" TEXT NOT NULL DEFAULT '',
  "horaFin" TEXT NOT NULL DEFAULT '',
  "scheduledAt" TIMESTAMP(3),
  "ubicacion" TEXT NOT NULL DEFAULT '',
  "notas" TEXT NOT NULL DEFAULT '',
  "calendarEventId" TEXT,
  "calendarLink" TEXT,
  "calendarSuccess" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_visit_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_visit_facts_sourceEventId_key"
  ON "commercial_visit_facts"("sourceEventId");

CREATE INDEX IF NOT EXISTS "commercial_visit_facts_comercialId_scheduledAt_idx"
  ON "commercial_visit_facts"("comercialId", "scheduledAt");

CREATE INDEX IF NOT EXISTS "commercial_visit_facts_demandId_createdAt_idx"
  ON "commercial_visit_facts"("demandId", "createdAt");

CREATE INDEX IF NOT EXISTS "commercial_visit_facts_scheduledAt_idx"
  ON "commercial_visit_facts"("scheduledAt");

CREATE TABLE IF NOT EXISTS "commercial_visit_evaluation_facts" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "comercialId" TEXT,
  "comercialNombre" TEXT NOT NULL DEFAULT '',
  "interes" TEXT NOT NULL DEFAULT '',
  "notas" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_visit_evaluation_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_visit_evaluation_facts_sourceEventId_key"
  ON "commercial_visit_evaluation_facts"("sourceEventId");

CREATE INDEX IF NOT EXISTS "commercial_visit_evaluation_facts_comercialId_createdAt_idx"
  ON "commercial_visit_evaluation_facts"("comercialId", "createdAt");

CREATE INDEX IF NOT EXISTS "commercial_visit_evaluation_facts_demandId_createdAt_idx"
  ON "commercial_visit_evaluation_facts"("demandId", "createdAt");

CREATE INDEX IF NOT EXISTS "commercial_visit_evaluation_facts_interes_createdAt_idx"
  ON "commercial_visit_evaluation_facts"("interes", "createdAt");

-- ---------------------------------------------------------------------------
-- Operation facts (M9 / OPERACION_CERRADA)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "commercial_operation_facts" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "propertyCode" TEXT NOT NULL,
  "propertyRef" TEXT NOT NULL DEFAULT '',
  "ciudad" TEXT NOT NULL DEFAULT '',
  "zona" TEXT NOT NULL DEFAULT '',
  "newEstado" TEXT NOT NULL DEFAULT '',
  "closedAt" TIMESTAMP(3) NOT NULL,
  "firstSeenAt" TIMESTAMP(3),
  "daysToClose" INTEGER,
  "grossAmountEur" DOUBLE PRECISION,
  "comercialId" TEXT,
  "comercialNombre" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_operation_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_operation_facts_sourceEventId_key"
  ON "commercial_operation_facts"("sourceEventId");

CREATE INDEX IF NOT EXISTS "commercial_operation_facts_comercialId_closedAt_idx"
  ON "commercial_operation_facts"("comercialId", "closedAt");

CREATE INDEX IF NOT EXISTS "commercial_operation_facts_ciudad_closedAt_idx"
  ON "commercial_operation_facts"("ciudad", "closedAt");

CREATE INDEX IF NOT EXISTS "commercial_operation_facts_propertyCode_idx"
  ON "commercial_operation_facts"("propertyCode");

CREATE INDEX IF NOT EXISTS "commercial_operation_facts_closedAt_idx"
  ON "commercial_operation_facts"("closedAt");

