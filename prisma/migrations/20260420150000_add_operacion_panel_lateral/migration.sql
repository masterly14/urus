-- Panel lateral por operación: notas internas, checklist ad-hoc y adjuntos.
-- Modelos mutables (no event store) — ver docs/plan.md M11 + decisión
-- arquitectónica en feat/M11-operacion-panel-lateral.

-- Notas internas ------------------------------------------------------------
CREATE TABLE "operacion_notas" (
  "id"           TEXT        NOT NULL,
  "operacionId"  TEXT        NOT NULL,
  "authorUserId" TEXT        NOT NULL,
  "authorName"   TEXT        NOT NULL,
  "authorRole"   TEXT        NOT NULL,
  "content"      TEXT        NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operacion_notas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operacion_notas_operacionId_createdAt_idx"
  ON "operacion_notas" ("operacionId", "createdAt");

CREATE INDEX "operacion_notas_authorUserId_idx"
  ON "operacion_notas" ("authorUserId");

ALTER TABLE "operacion_notas"
  ADD CONSTRAINT "operacion_notas_operacionId_fkey"
  FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Checklist ad-hoc ----------------------------------------------------------
CREATE TABLE "operacion_checklist_items" (
  "id"                     TEXT         NOT NULL,
  "operacionId"            TEXT         NOT NULL,
  "texto"                  TEXT         NOT NULL,
  "completado"             BOOLEAN      NOT NULL DEFAULT false,
  "orden"                  INTEGER      NOT NULL DEFAULT 0,
  "responsableComercialId" TEXT,
  "createdByUserId"        TEXT         NOT NULL,
  "completadoByUserId"     TEXT,
  "completadoAt"           TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operacion_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operacion_checklist_items_operacionId_orden_idx"
  ON "operacion_checklist_items" ("operacionId", "orden");

CREATE INDEX "operacion_checklist_items_responsableComercialId_idx"
  ON "operacion_checklist_items" ("responsableComercialId");

ALTER TABLE "operacion_checklist_items"
  ADD CONSTRAINT "operacion_checklist_items_operacionId_fkey"
  FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Adjuntos (Cloudinary) -----------------------------------------------------
CREATE TABLE "operacion_adjuntos" (
  "id"               TEXT         NOT NULL,
  "operacionId"      TEXT         NOT NULL,
  "nombre"           TEXT         NOT NULL,
  "mimeType"         TEXT         NOT NULL,
  "cloudinaryUrl"    TEXT         NOT NULL,
  "publicId"         TEXT         NOT NULL,
  "resourceType"     TEXT         NOT NULL DEFAULT 'raw',
  "bytes"            INTEGER      NOT NULL,
  "uploadedByUserId" TEXT         NOT NULL,
  "uploadedByName"   TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operacion_adjuntos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operacion_adjuntos_operacionId_createdAt_idx"
  ON "operacion_adjuntos" ("operacionId", "createdAt");

ALTER TABLE "operacion_adjuntos"
  ADD CONSTRAINT "operacion_adjuntos_operacionId_fkey"
  FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
