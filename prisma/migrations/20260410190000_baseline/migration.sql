-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AggregateType" AS ENUM ('PROPERTY', 'LEAD', 'DEMAND', 'MATCH', 'SLA', 'SYSTEM', 'WHATSAPP_CONVERSATION', 'OPERACION', 'CEO', 'MENTAL_CONVERSATION', 'VISIT_SCHEDULING');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PROPIEDAD_CREADA', 'PROPIEDAD_MODIFICADA', 'ESTADO_CAMBIADO', 'PROPIEDAD_ELIMINADA', 'DEMANDA_CREADA', 'DEMANDA_MODIFICADA', 'DEMANDA_ESTADO_CAMBIADO', 'LEAD_INGESTADO', 'LEAD_SCORED', 'LEAD_CONTACTADO', 'SLA_INICIADO', 'DEMANDA_ACTUALIZADA', 'MATCH_GENERADO', 'WHATSAPP_RECIBIDO', 'WHATSAPP_ENVIADO', 'VISITA_EVALUADA', 'VISITA_AGENDADA', 'SELECCION_COMPRADOR', 'SELECCION_VALIDADA', 'SELECCION_RECHAZADA', 'DATOS_INCOMPLETOS', 'CONTRATO_BORRADOR_GENERADO', 'CONTRATO_VERSIONADO', 'CONTRATO_APROBADO', 'FIRMA_ENVIADA', 'FIRMA_COMPLETADA', 'FIRMA_RECHAZADA', 'FIRMA_EXPIRADA', 'FIRMA_RECORDATORIO_ENVIADO', 'FIRMA_SLA_ESCALADO', 'PRICING_ANALISIS_GENERADO', 'PRICING_RECOMENDACION_GENERADA', 'INCIDENCIA_POSTVENTA_ABIERTA', 'INCIDENCIA_POSTVENTA_RESUELTA', 'OPERACION_CERRADA', 'RESENA_SOLICITADA', 'RESENA_RECIBIDA', 'RECORDATORIO_RESENA_ENVIADO', 'REFERIDO_CAPTURADO', 'REFERIDO_ASIGNADO', 'REFERIDO_SOLICITUD_ENVIADA', 'COLABORADOR_SLA_BREACH', 'COLABORADOR_RECOMENDACION_GENERADA', 'CEO_DIAGNOSTICO_GENERADO', 'CEO_EXPANSION_EVALUADA', 'CEO_FINANZAS_GENERADA', 'MENTAL_MSG_RECIBIDO', 'MENTAL_MSG_ENVIADO', 'VISITA_SOLICITADA', 'VISITA_SLOTS_PROPUESTOS', 'VISITA_SLOT_SELECCIONADO', 'VISITA_PROPUESTA_ENVIADA', 'VISITA_COMPRADOR_ACEPTO', 'VISITA_COMPRADOR_RECHAZO', 'VISITA_DATOS_RECOPILADOS', 'VISITA_ESCALADA_MANUAL', 'VISITA_CANCELADA', 'VISITA_REPROGRAMADA');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROCESS_EVENT', 'UPDATE_PROPERTY_PROJECTION', 'UPDATE_DEMAND_PROJECTION', 'WRITE_TO_INMOVILLA', 'NOTIFY_LEAD_WHATSAPP', 'FOLLOW_UP_LEAD', 'GENERATE_MICROSITE', 'NOTIFY_MICROSITE_PENDING_VALIDATION', 'SEND_MICROSITE_TO_BUYER', 'NOTIFY_CONTRACT_DATA_INCOMPLETE', 'GENERATE_CONTRACT_DRAFT', 'SEND_SIGNATURE_REQUEST', 'PROCESS_SIGNATURE_WEBHOOK', 'NOTIFY_SIGNATURE_REMINDER', 'RUN_PRICING_ANALYSIS', 'NOTIFY_PRICING_WHATSAPP', 'START_POSTVENTA_CADENCE', 'SEND_POSTVENTA_MESSAGE', 'SEND_POST_SALE_MESSAGE', 'SEND_REVIEW_REQUEST', 'SEND_REFERRAL_REQUEST', 'SEND_REVIEW_REMINDER', 'SEND_DEV_EXERCISE_NUDGE', 'VISIT_FETCH_SLOTS', 'VISIT_PROPOSE_TO_COMMERCIAL', 'VISIT_PROPOSE_TO_BUYER', 'VISIT_CHECK_COMMERCIAL_TIMEOUT', 'VISIT_CHECK_BUYER_TIMEOUT', 'VISIT_CREATE_CALENDAR_EVENT', 'VISIT_CANCEL_CALENDAR_EVENT', 'VISIT_CLEANUP_EXPIRED_LOCKS', 'VISIT_CHECK_COMPOSIO_HEALTH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "ProjectionName" AS ENUM ('PROPERTIES_CURRENT', 'DEMANDS_CURRENT');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('SENT', 'OPENED', 'SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELED', 'ERROR');

-- CreateEnum
CREATE TYPE "MicrositeSelectionStatus" AS ENUM ('PENDING_VALIDATION', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MicrositeSelectionDecision" AS ENUM ('ME_INTERESA', 'NO_ME_ENCAJA');

-- CreateEnum
CREATE TYPE "VisitSessionState" AS ENUM ('INITIATED', 'FETCHING_SLOTS', 'SLOTS_PROPOSED_TO_COMMERCIAL', 'COMMERCIAL_ACCEPTED_SLOT', 'SLOT_PROPOSED_TO_BUYER', 'BUYER_ACCEPTED', 'BUYER_REJECTED', 'ASKING_BUYER_PREFERENCE', 'FETCHING_SPECIFIC_SLOT', 'SPECIFIC_SLOT_TO_COMMERCIAL', 'COLLECTING_VISITOR_DATA', 'VISIT_CONFIRMED', 'VISIT_COMPLETED', 'VISIT_CANCELLED', 'VISIT_RESCHEDULED', 'ESCALATED_MANUAL');

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT_TO_SIGNATURE', 'SIGNED', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDIENTE_ASIGNACION', 'ASIGNADO', 'CONTACTADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "OperacionEstado" AS ENUM ('EN_CURSO', 'RESERVA', 'ARRAS', 'PENDIENTE_FIRMA', 'CERRADA_VENTA', 'CERRADA_ALQUILER', 'CERRADA_TRASPASO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AsignacionEstado" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "HitoEstado" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'BLOQUEADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DevExerciseType" AS ENUM ('DAILY', 'WEEKLY_CHALLENGE');

-- CreateEnum
CREATE TYPE "DevExerciseStatus" AS ENUM ('NUDGE_SENT', 'DELIVERED', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "position" BIGSERIAL NOT NULL,
    "type" "EventType" NOT NULL,
    "aggregateType" "AggregateType" NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "correlationId" TEXT,
    "causationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projections_checkpoint" (
    "projectionName" "ProjectionName" NOT NULL,
    "lastEventId" TEXT,
    "lastEventPosition" BIGINT,
    "lastProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projections_checkpoint_pkey" PRIMARY KEY ("projectionName")
);

-- CreateTable
CREATE TABLE "property_snapshots" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "tipoOfer" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metrosConstruidos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitaciones" INTEGER NOT NULL DEFAULT 0,
    "banyos" INTEGER NOT NULL DEFAULT 0,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "zona" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT '',
    "nodisponible" BOOLEAN NOT NULL DEFAULT false,
    "prospecto" BOOLEAN NOT NULL DEFAULT false,
    "fechaAlta" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "numFotos" INTEGER NOT NULL DEFAULT 0,
    "agente" TEXT NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_snapshots_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "demand_snapshots" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "nombre" TEXT NOT NULL DEFAULT '',
    "estadoId" TEXT NOT NULL DEFAULT '',
    "estadoNombre" TEXT NOT NULL DEFAULT '',
    "presupuestoMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presupuestoMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitacionesMin" INTEGER NOT NULL DEFAULT 0,
    "tipos" TEXT NOT NULL DEFAULT '',
    "zonas" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "agente" TEXT NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_snapshots_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "properties_current" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL DEFAULT '',
    "tipoOfer" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metrosConstruidos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitaciones" INTEGER NOT NULL DEFAULT 0,
    "banyos" INTEGER NOT NULL DEFAULT 0,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "zona" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT '',
    "nodisponible" BOOLEAN NOT NULL DEFAULT false,
    "prospecto" BOOLEAN NOT NULL DEFAULT false,
    "fechaAlta" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "numFotos" INTEGER NOT NULL DEFAULT 0,
    "agente" TEXT NOT NULL DEFAULT '',
    "lastEventId" TEXT NOT NULL,
    "lastEventPosition" BIGINT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_current_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "pricing_reports" (
    "propertyCode" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "sourceTrigger" TEXT NOT NULL DEFAULT 'manual',
    "semaforo" TEXT NOT NULL DEFAULT 'sin_datos',
    "gapPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalComparables" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "comparables" JSONB NOT NULL,
    "recommendation" JSONB,
    "recommendationError" TEXT,
    "trend" JSONB,
    "queryMeta" JSONB NOT NULL,
    "lastAnalysisEventId" TEXT,
    "lastRecommendationEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_reports_pkey" PRIMARY KEY ("propertyCode")
);

-- CreateTable
CREATE TABLE "demands_current" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "nombre" TEXT NOT NULL DEFAULT '',
    "estadoId" TEXT NOT NULL DEFAULT '',
    "estadoNombre" TEXT NOT NULL DEFAULT '',
    "presupuestoMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presupuestoMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitacionesMin" INTEGER NOT NULL DEFAULT 0,
    "tipos" TEXT NOT NULL DEFAULT '',
    "zonas" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "agente" TEXT NOT NULL DEFAULT '',
    "lastEventId" TEXT NOT NULL,
    "lastEventPosition" BIGINT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "demands_current_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "ingestion_cycle_metrics" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "itemsRead" INTEGER NOT NULL DEFAULT 0,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "snapshotSize" INTEGER NOT NULL DEFAULT 0,
    "eventsEmitted" INTEGER NOT NULL DEFAULT 0,
    "diffCreated" INTEGER NOT NULL DEFAULT 0,
    "diffModified" INTEGER NOT NULL DEFAULT 0,
    "diffStatusChanged" INTEGER NOT NULL DEFAULT 0,
    "diffUnchanged" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "phases" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_cycle_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observability_logs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "workerId" TEXT,
    "workerName" TEXT,
    "jobId" TEXT,
    "jobType" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "route" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observability_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_metrics" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "throughputCount" INTEGER NOT NULL DEFAULT 1,
    "statusCode" INTEGER,
    "requestId" TEXT,
    "correlationId" TEXT,
    "workerId" TEXT,
    "workerName" TEXT,
    "jobId" TEXT,
    "jobType" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "route" TEXT,
    "method" TEXT,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_scheduling_sessions" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "buyerWaId" TEXT NOT NULL,
    "comercialWaId" TEXT NOT NULL,
    "state" "VisitSessionState" NOT NULL DEFAULT 'INITIATED',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "confirmedSlotStart" TIMESTAMP(3),
    "confirmedSlotEnd" TIMESTAMP(3),
    "visitorName" TEXT,
    "visitorPhone" TEXT,
    "visitorCount" INTEGER,
    "calendarEventId" TEXT,
    "calendarLink" TEXT,
    "escalationReason" TEXT,
    "lastProposedSlots" JSONB,
    "lastCommercialMsgId" TEXT,
    "lastBuyerMsgId" TEXT,
    "buyerPreferredDate" TEXT,
    "currentStepDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "visit_scheduling_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_slot_locks" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "propertyCode" TEXT,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_slot_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_visit_slots" (
    "id" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visit_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'comercial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "comercialId" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comerciales" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL DEFAULT 'general',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "cargaActual" INTEGER NOT NULL DEFAULT 0,
    "cargaMaxima" INTEGER NOT NULL DEFAULT 20,
    "leadsAsignados" INTEGER NOT NULL DEFAULT 0,
    "leadsCerrados" INTEGER NOT NULL DEFAULT 0,
    "tasaConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waId" TEXT,
    "composioConnectionId" TEXT,
    "composioConnectedAt" TIMESTAMP(3),
    "calendarProvider" TEXT DEFAULT 'google',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comerciales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_calidad" (
    "id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valores" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_calidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_tipo" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_tipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_pais" (
    "id" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "iso3" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_pais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_ciudad" (
    "id" TEXT NOT NULL,
    "key_loca" INTEGER NOT NULL,
    "ciudad" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "cod_prov" INTEGER NOT NULL,
    "pais_valor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_zona" (
    "id" TEXT NOT NULL,
    "key_zona" INTEGER NOT NULL,
    "key_loca" INTEGER NOT NULL,
    "zona" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_zona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microsite_selections" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "MicrositeSelectionStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "demandId" TEXT NOT NULL,
    "demandNombre" TEXT NOT NULL DEFAULT '',
    "comercialId" TEXT NOT NULL DEFAULT 'system',
    "statefoxQuery" JSONB NOT NULL,
    "resultFilters" JSONB NOT NULL,
    "properties" JSONB NOT NULL,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "validationToken" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL DEFAULT '',
    "validationDueAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedByComercialId" TEXT,
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "microsite_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microsite_selection_feedback" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "decision" "MicrositeSelectionDecision" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsite_selection_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "templateVersion" TEXT,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "contractInput" JSONB,
    "cloudinaryUrl" TEXT,
    "signedDocumentUrl" TEXT,
    "auditTrailUrl" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "signatureRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_parties" (
    "id" TEXT NOT NULL,
    "legalDocumentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nifNie" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "inmovilla_cod_cli" TEXT,
    "hasSigned" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "reminderDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_document_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "signaturitSignatureId" TEXT,
    "signaturitDocumentId" TEXT,
    "operationId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "templateVersion" TEXT,
    "cloudinaryUrl" TEXT NOT NULL,
    "signingUrl" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'SENT',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signerPhone" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "slaDeadlineDays" INTEGER NOT NULL DEFAULT 5,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "lastReminderDay" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    "auditTrailUrl" TEXT,
    "documentHash" TEXT,
    "signingToken" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "consentText" TEXT,
    "signedDocumentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_otps" (
    "id" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "referrerName" TEXT NOT NULL,
    "referrerPhone" TEXT NOT NULL,
    "referredName" TEXT NOT NULL,
    "referredPhone" TEXT NOT NULL,
    "referredEmail" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDIENTE_ASIGNACION',
    "comercialId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_lead_facts" (
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
    "scoringModelVersion" INTEGER,
    "aiScoringUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "commercial_lead_facts_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "commercial_visit_facts" (
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

-- CreateTable
CREATE TABLE "commercial_visit_evaluation_facts" (
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

-- CreateTable
CREATE TABLE "commercial_operation_facts" (
    "id" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "operacionId" TEXT,
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

-- CreateTable
CREATE TABLE "commercial_classifications" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "rangeFrom" TIMESTAMP(3) NOT NULL,
    "rangeTo" TIMESTAMP(3) NOT NULL,
    "profile" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profileScores" JSONB NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_model_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weightPclose" DOUBLE PRECISION NOT NULL,
    "weightValue" DOUBLE PRECISION NOT NULL,
    "weightUrgency" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "backtestScore" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_alerts" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "comercialNombre" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "baselineValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "details" JSONB NOT NULL DEFAULT '{}',
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operaciones" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "demandId" TEXT,
    "buyerClientId" TEXT,
    "sellerClientId" TEXT,
    "comercialId" TEXT,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "estado" "OperacionEstado" NOT NULL DEFAULT 'EN_CURSO',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaboradores" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "especialidad" TEXT NOT NULL DEFAULT '',
    "contactoNombre" TEXT NOT NULL DEFAULT '',
    "contactoEmail" TEXT NOT NULL DEFAULT '',
    "contactoTelefono" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_tipos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hito_plantillas" (
    "id" TEXT NOT NULL,
    "colaboradorTipoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hito_plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_sla_configs" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "hitoPlantillaId" TEXT,
    "slaDias" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_sla_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_asignaciones" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "estado" "AsignacionEstado" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT NOT NULL DEFAULT '',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_asignaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_hitos" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "hitoPlantillaId" TEXT,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "HitoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "iniciadoAt" TIMESTAMP(3),
    "completadoAt" TIMESTAMP(3),
    "slaDias" INTEGER,
    "slaVenceAt" TIMESTAMP(3),
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_hitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_colaborador" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "hitoId" TEXT,
    "nombre" TEXT NOT NULL,
    "cloudinaryUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ceo_monthly_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "revenueEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossVolumeEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operationsClosed" INTEGER NOT NULL DEFAULT 0,
    "operationsActive" INTEGER NOT NULL DEFAULT 0,
    "ebitdaEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatingCostEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashAvailableEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixedCostsEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variableCostsEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgMarginPerOp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reinvestmentCapacity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ceo_monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ceo_targets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "targetRevenueEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetEbitdaEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxOperatingCostEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ceo_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_buyer_sessions" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "selectionId" TEXT,
    "selectionToken" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_buyer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mental_health_sessions" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "comercialId" TEXT,
    "flujoActivo" TEXT,
    "flujoStep" INTEGER,
    "subtipoBloqueo" TEXT,
    "nivelEnergia" INTEGER,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mental_health_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scenarioCount" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "buyerMessage" TEXT NOT NULL,
    "nluOutput" JSONB NOT NULL,
    "propertyResolutionScore" DOUBLE PRECISION NOT NULL,
    "sentimentAccuracyScore" DOUBLE PRECISION NOT NULL,
    "variableExtractionScore" DOUBLE PRECISION NOT NULL,
    "intentionScore" DOUBLE PRECISION NOT NULL,
    "wantsMoreScore" DOUBLE PRECISION NOT NULL,
    "hallucinationPenalty" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "judgeReasoning" TEXT,
    "failures" TEXT[],
    "latencyMs" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_program_exercises" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "type" "DevExerciseType" NOT NULL,
    "theme" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "exerciseContent" TEXT,
    "nudgeSentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "DevExerciseStatus" NOT NULL DEFAULT 'NUDGE_SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dev_program_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_position_key" ON "events"("position");

-- CreateIndex
CREATE INDEX "events_aggregateType_aggregateId_position_idx" ON "events"("aggregateType", "aggregateId", "position");

-- CreateIndex
CREATE INDEX "events_type_position_idx" ON "events"("type", "position");

-- CreateIndex
CREATE INDEX "events_occurredAt_idx" ON "events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_idempotencyKey_key" ON "job_queue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "job_queue_status_availableAt_priority_idx" ON "job_queue"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "job_queue_type_status_idx" ON "job_queue"("type", "status");

-- CreateIndex
CREATE INDEX "job_queue_sourceEventId_idx" ON "job_queue"("sourceEventId");

-- CreateIndex
CREATE INDEX "properties_current_estado_idx" ON "properties_current"("estado");

-- CreateIndex
CREATE INDEX "properties_current_ciudad_zona_idx" ON "properties_current"("ciudad", "zona");

-- CreateIndex
CREATE INDEX "properties_current_lastEventPosition_idx" ON "properties_current"("lastEventPosition");

-- CreateIndex
CREATE INDEX "pricing_reports_analyzedAt_idx" ON "pricing_reports"("analyzedAt");

-- CreateIndex
CREATE INDEX "pricing_reports_sourceTrigger_analyzedAt_idx" ON "pricing_reports"("sourceTrigger", "analyzedAt");

-- CreateIndex
CREATE INDEX "pricing_reports_semaforo_analyzedAt_idx" ON "pricing_reports"("semaforo", "analyzedAt");

-- CreateIndex
CREATE INDEX "demands_current_estadoId_idx" ON "demands_current"("estadoId");

-- CreateIndex
CREATE INDEX "demands_current_zonas_idx" ON "demands_current"("zonas");

-- CreateIndex
CREATE INDEX "demands_current_lastEventPosition_idx" ON "demands_current"("lastEventPosition");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_cycle_metrics_cycleId_key" ON "ingestion_cycle_metrics"("cycleId");

-- CreateIndex
CREATE INDEX "ingestion_cycle_metrics_worker_startedAt_idx" ON "ingestion_cycle_metrics"("worker", "startedAt");

-- CreateIndex
CREATE INDEX "ingestion_cycle_metrics_success_startedAt_idx" ON "ingestion_cycle_metrics"("success", "startedAt");

-- CreateIndex
CREATE INDEX "observability_logs_scope_createdAt_idx" ON "observability_logs"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_source_createdAt_idx" ON "observability_logs"("source", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_level_createdAt_idx" ON "observability_logs"("level", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_operation_createdAt_idx" ON "observability_logs"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_requestId_idx" ON "observability_logs"("requestId");

-- CreateIndex
CREATE INDEX "observability_logs_correlationId_idx" ON "observability_logs"("correlationId");

-- CreateIndex
CREATE INDEX "observability_logs_workerId_createdAt_idx" ON "observability_logs"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_jobId_createdAt_idx" ON "observability_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_eventId_createdAt_idx" ON "observability_logs"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "execution_metrics_scope_startedAt_idx" ON "execution_metrics"("scope", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_source_startedAt_idx" ON "execution_metrics"("source", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_name_startedAt_idx" ON "execution_metrics"("name", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_operation_startedAt_idx" ON "execution_metrics"("operation", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_success_startedAt_idx" ON "execution_metrics"("success", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_requestId_idx" ON "execution_metrics"("requestId");

-- CreateIndex
CREATE INDEX "execution_metrics_correlationId_idx" ON "execution_metrics"("correlationId");

-- CreateIndex
CREATE INDEX "execution_metrics_workerId_startedAt_idx" ON "execution_metrics"("workerId", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_jobId_startedAt_idx" ON "execution_metrics"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_eventId_startedAt_idx" ON "execution_metrics"("eventId", "startedAt");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_demandId_idx" ON "visit_scheduling_sessions"("demandId");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_buyerWaId_state_idx" ON "visit_scheduling_sessions"("buyerWaId", "state");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_comercialWaId_state_idx" ON "visit_scheduling_sessions"("comercialWaId", "state");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_propertyCode_state_idx" ON "visit_scheduling_sessions"("propertyCode", "state");

-- CreateIndex
CREATE INDEX "visit_slot_locks_comercialId_expiresAt_idx" ON "visit_slot_locks"("comercialId", "expiresAt");

-- CreateIndex
CREATE INDEX "visit_slot_locks_propertyCode_slotStart_slotEnd_idx" ON "visit_slot_locks"("propertyCode", "slotStart", "slotEnd");

-- CreateIndex
CREATE INDEX "visit_slot_locks_sessionId_idx" ON "visit_slot_locks"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_slot_locks_comercialId_slotStart_slotEnd_released_key" ON "visit_slot_locks"("comercialId", "slotStart", "slotEnd", "released");

-- CreateIndex
CREATE INDEX "property_visit_slots_propertyCode_slotStart_idx" ON "property_visit_slots"("propertyCode", "slotStart");

-- CreateIndex
CREATE INDEX "property_visit_slots_sessionId_idx" ON "property_visit_slots"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_comercialId_key" ON "user"("comercialId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "comerciales_ciudad_activo_idx" ON "comerciales"("ciudad", "activo");

-- CreateIndex
CREATE INDEX "comerciales_activo_cargaActual_idx" ON "comerciales"("activo", "cargaActual");

-- CreateIndex
CREATE INDEX "comerciales_waId_idx" ON "comerciales"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_calidad_campo_key" ON "inmovilla_enum_calidad"("campo");

-- CreateIndex
CREATE INDEX "inmovilla_enum_tipo_tipo_valor_idx" ON "inmovilla_enum_tipo"("tipo", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_pais_valor_key" ON "inmovilla_enum_pais"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_ciudad_key_loca_key" ON "inmovilla_enum_ciudad"("key_loca");

-- CreateIndex
CREATE INDEX "inmovilla_enum_ciudad_key_loca_idx" ON "inmovilla_enum_ciudad"("key_loca");

-- CreateIndex
CREATE INDEX "inmovilla_enum_ciudad_ciudad_provincia_idx" ON "inmovilla_enum_ciudad"("ciudad", "provincia");

-- CreateIndex
CREATE INDEX "inmovilla_enum_zona_key_loca_key_zona_idx" ON "inmovilla_enum_zona"("key_loca", "key_zona");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_zona_key_loca_key_zona_key" ON "inmovilla_enum_zona"("key_loca", "key_zona");

-- CreateIndex
CREATE UNIQUE INDEX "microsite_selections_token_key" ON "microsite_selections"("token");

-- CreateIndex
CREATE UNIQUE INDEX "microsite_selections_validationToken_key" ON "microsite_selections"("validationToken");

-- CreateIndex
CREATE INDEX "microsite_selections_demandId_createdAt_idx" ON "microsite_selections"("demandId", "createdAt");

-- CreateIndex
CREATE INDEX "microsite_selections_token_idx" ON "microsite_selections"("token");

-- CreateIndex
CREATE INDEX "microsite_selections_status_validationDueAt_idx" ON "microsite_selections"("status", "validationDueAt");

-- CreateIndex
CREATE INDEX "microsite_selection_feedback_selectionId_createdAt_idx" ON "microsite_selection_feedback"("selectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "microsite_selection_feedback_selectionId_propertyId_key" ON "microsite_selection_feedback"("selectionId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_signatureRequestId_key" ON "legal_documents"("signatureRequestId");

-- CreateIndex
CREATE INDEX "legal_documents_propertyCode_idx" ON "legal_documents"("propertyCode");

-- CreateIndex
CREATE INDEX "legal_documents_status_idx" ON "legal_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_operationId_documentKind_key" ON "legal_documents"("operationId", "documentKind");

-- CreateIndex
CREATE INDEX "legal_document_parties_legalDocumentId_hasSigned_idx" ON "legal_document_parties"("legalDocumentId", "hasSigned");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_parties_legalDocumentId_email_key" ON "legal_document_parties"("legalDocumentId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_signaturitSignatureId_key" ON "signature_requests"("signaturitSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_signingToken_key" ON "signature_requests"("signingToken");

-- CreateIndex
CREATE INDEX "signature_requests_status_slaDeadline_idx" ON "signature_requests"("status", "slaDeadline");

-- CreateIndex
CREATE INDEX "signature_requests_operationId_idx" ON "signature_requests"("operationId");

-- CreateIndex
CREATE INDEX "signature_otps_signatureRequestId_verified_idx" ON "signature_otps"("signatureRequestId", "verified");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referrals_propertyCode_idx" ON "referrals"("propertyCode");

-- CreateIndex
CREATE INDEX "referrals_comercialId_idx" ON "referrals"("comercialId");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_lead_facts_ingestedEventId_key" ON "commercial_lead_facts"("ingestedEventId");

-- CreateIndex
CREATE INDEX "commercial_lead_facts_assignedComercialId_createdAt_idx" ON "commercial_lead_facts"("assignedComercialId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_lead_facts_createdAt_idx" ON "commercial_lead_facts"("createdAt");

-- CreateIndex
CREATE INDEX "commercial_lead_facts_ciudad_idx" ON "commercial_lead_facts"("ciudad");

-- CreateIndex
CREATE INDEX "commercial_lead_facts_source_idx" ON "commercial_lead_facts"("source");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_visit_facts_sourceEventId_key" ON "commercial_visit_facts"("sourceEventId");

-- CreateIndex
CREATE INDEX "commercial_visit_facts_comercialId_scheduledAt_idx" ON "commercial_visit_facts"("comercialId", "scheduledAt");

-- CreateIndex
CREATE INDEX "commercial_visit_facts_demandId_createdAt_idx" ON "commercial_visit_facts"("demandId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_visit_facts_scheduledAt_idx" ON "commercial_visit_facts"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_visit_evaluation_facts_sourceEventId_key" ON "commercial_visit_evaluation_facts"("sourceEventId");

-- CreateIndex
CREATE INDEX "commercial_visit_evaluation_facts_comercialId_createdAt_idx" ON "commercial_visit_evaluation_facts"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_visit_evaluation_facts_demandId_createdAt_idx" ON "commercial_visit_evaluation_facts"("demandId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_visit_evaluation_facts_interes_createdAt_idx" ON "commercial_visit_evaluation_facts"("interes", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_operation_facts_sourceEventId_key" ON "commercial_operation_facts"("sourceEventId");

-- CreateIndex
CREATE INDEX "commercial_operation_facts_comercialId_closedAt_idx" ON "commercial_operation_facts"("comercialId", "closedAt");

-- CreateIndex
CREATE INDEX "commercial_operation_facts_ciudad_closedAt_idx" ON "commercial_operation_facts"("ciudad", "closedAt");

-- CreateIndex
CREATE INDEX "commercial_operation_facts_propertyCode_idx" ON "commercial_operation_facts"("propertyCode");

-- CreateIndex
CREATE INDEX "commercial_operation_facts_closedAt_idx" ON "commercial_operation_facts"("closedAt");

-- CreateIndex
CREATE INDEX "commercial_operation_facts_operacionId_idx" ON "commercial_operation_facts"("operacionId");

-- CreateIndex
CREATE INDEX "commercial_classifications_comercialId_createdAt_idx" ON "commercial_classifications"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_classifications_rangeFrom_rangeTo_idx" ON "commercial_classifications"("rangeFrom", "rangeTo");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_model_versions_version_key" ON "scoring_model_versions"("version");

-- CreateIndex
CREATE INDEX "scoring_model_versions_activatedAt_idx" ON "scoring_model_versions"("activatedAt");

-- CreateIndex
CREATE INDEX "dashboard_alerts_comercialId_createdAt_idx" ON "dashboard_alerts"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "dashboard_alerts_type_severity_idx" ON "dashboard_alerts"("type", "severity");

-- CreateIndex
CREATE INDEX "dashboard_alerts_resolvedAt_createdAt_idx" ON "dashboard_alerts"("resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_codigo_key" ON "operaciones"("codigo");

-- CreateIndex
CREATE INDEX "operaciones_propertyCode_estado_idx" ON "operaciones"("propertyCode", "estado");

-- CreateIndex
CREATE INDEX "operaciones_comercialId_createdAt_idx" ON "operaciones"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "operaciones_ciudad_estado_idx" ON "operaciones"("ciudad", "estado");

-- CreateIndex
CREATE INDEX "operaciones_estado_closedAt_idx" ON "operaciones"("estado", "closedAt");

-- CreateIndex
CREATE INDEX "colaboradores_tipo_ciudad_activo_idx" ON "colaboradores"("tipo", "ciudad", "activo");

-- CreateIndex
CREATE INDEX "colaboradores_activo_idx" ON "colaboradores"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_tipos_nombre_key" ON "colaborador_tipos"("nombre");

-- CreateIndex
CREATE INDEX "hito_plantillas_colaboradorTipoId_idx" ON "hito_plantillas"("colaboradorTipoId");

-- CreateIndex
CREATE UNIQUE INDEX "hito_plantillas_colaboradorTipoId_orden_key" ON "hito_plantillas"("colaboradorTipoId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_sla_configs_colaboradorId_hitoPlantillaId_key" ON "colaborador_sla_configs"("colaboradorId", "hitoPlantillaId");

-- CreateIndex
CREATE INDEX "colaborador_asignaciones_operacionId_estado_idx" ON "colaborador_asignaciones"("operacionId", "estado");

-- CreateIndex
CREATE INDEX "colaborador_asignaciones_colaboradorId_estado_idx" ON "colaborador_asignaciones"("colaboradorId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_asignaciones_colaboradorId_operacionId_key" ON "colaborador_asignaciones"("colaboradorId", "operacionId");

-- CreateIndex
CREATE INDEX "colaborador_hitos_asignacionId_orden_idx" ON "colaborador_hitos"("asignacionId", "orden");

-- CreateIndex
CREATE INDEX "colaborador_hitos_estado_slaVenceAt_idx" ON "colaborador_hitos"("estado", "slaVenceAt");

-- CreateIndex
CREATE INDEX "documentos_colaborador_asignacionId_idx" ON "documentos_colaborador"("asignacionId");

-- CreateIndex
CREATE INDEX "documentos_colaborador_hitoId_idx" ON "documentos_colaborador"("hitoId");

-- CreateIndex
CREATE UNIQUE INDEX "ceo_monthly_snapshots_period_key" ON "ceo_monthly_snapshots"("period");

-- CreateIndex
CREATE INDEX "ceo_monthly_snapshots_period_idx" ON "ceo_monthly_snapshots"("period");

-- CreateIndex
CREATE UNIQUE INDEX "ceo_targets_year_month_key" ON "ceo_targets"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_buyer_sessions_waId_key" ON "whatsapp_buyer_sessions"("waId");

-- CreateIndex
CREATE INDEX "whatsapp_buyer_sessions_demandId_idx" ON "whatsapp_buyer_sessions"("demandId");

-- CreateIndex
CREATE UNIQUE INDEX "mental_health_sessions_waId_key" ON "mental_health_sessions"("waId");

-- CreateIndex
CREATE INDEX "mental_health_sessions_waId_lastMessageAt_idx" ON "mental_health_sessions"("waId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "eval_runs_status_idx" ON "eval_runs"("status");

-- CreateIndex
CREATE INDEX "eval_results_runId_idx" ON "eval_results"("runId");

-- CreateIndex
CREATE INDEX "eval_results_category_idx" ON "eval_results"("category");

-- CreateIndex
CREATE INDEX "eval_results_overallScore_idx" ON "eval_results"("overallScore");

-- CreateIndex
CREATE INDEX "dev_program_exercises_waId_status_idx" ON "dev_program_exercises"("waId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dev_program_exercises_comercialId_weekNumber_dayOfWeek_type_key" ON "dev_program_exercises"("comercialId", "weekNumber", "dayOfWeek", "type");

-- AddForeignKey
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_comercialId_fkey" FOREIGN KEY ("comercialId") REFERENCES "comerciales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microsite_selection_feedback" ADD CONSTRAINT "microsite_selection_feedback_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "microsite_selections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "signature_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_parties" ADD CONSTRAINT "legal_document_parties_legalDocumentId_fkey" FOREIGN KEY ("legalDocumentId") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_otps" ADD CONSTRAINT "signature_otps_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_comercialId_fkey" FOREIGN KEY ("comercialId") REFERENCES "comerciales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hito_plantillas" ADD CONSTRAINT "hito_plantillas_colaboradorTipoId_fkey" FOREIGN KEY ("colaboradorTipoId") REFERENCES "colaborador_tipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_sla_configs" ADD CONSTRAINT "colaborador_sla_configs_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_asignaciones" ADD CONSTRAINT "colaborador_asignaciones_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_asignaciones" ADD CONSTRAINT "colaborador_asignaciones_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_hitos" ADD CONSTRAINT "colaborador_hitos_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "colaborador_asignaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_colaborador" ADD CONSTRAINT "documentos_colaborador_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "colaborador_asignaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_colaborador" ADD CONSTRAINT "documentos_colaborador_hitoId_fkey" FOREIGN KEY ("hitoId") REFERENCES "colaborador_hitos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "eval_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

