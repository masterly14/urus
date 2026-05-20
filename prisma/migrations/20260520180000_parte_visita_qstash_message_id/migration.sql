-- Añade campos para el seguimiento del schedule en QStash:
--   * qstashMessageId         id del mensaje publicado en QStash (null si no se llegó a publicar).
--   * schedulePublishError    último error del publish (para diagnóstico humano).
--   * scheduleAttempts        contador de intentos de publish (idempotencia + rescate).
--
-- Y un índice (state, visitDateTime) para acelerar el barrido del cron de rescate
-- (WHERE state='PENDING' AND visitDateTime < now()).

ALTER TABLE "parte_visita_sessions"
  ADD COLUMN "qstashMessageId" TEXT,
  ADD COLUMN "schedulePublishError" TEXT,
  ADD COLUMN "scheduleAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "parte_visita_sessions_state_visitDateTime_idx"
  ON "parte_visita_sessions" ("state", "visitDateTime");
