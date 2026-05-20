-- UI-only coach chat (isolated from WhatsApp/event-store traces)
CREATE TABLE "coach_chat_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "comercialId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "flujoActivo" TEXT,
  "flujoStep" INTEGER,
  "subtipoBloqueo" TEXT,
  "nivelEnergia" INTEGER,
  "turnCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coach_chat_messages" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coach_chat_sessions_userId_isActive_idx"
  ON "coach_chat_sessions"("userId", "isActive");
CREATE INDEX "coach_chat_sessions_comercialId_isActive_idx"
  ON "coach_chat_sessions"("comercialId", "isActive");
CREATE INDEX "coach_chat_sessions_lastMessageAt_idx"
  ON "coach_chat_sessions"("lastMessageAt");
CREATE INDEX "coach_chat_messages_sessionId_createdAt_idx"
  ON "coach_chat_messages"("sessionId", "createdAt");

CREATE UNIQUE INDEX "coach_chat_sessions_single_active_per_user"
  ON "coach_chat_sessions"("userId")
  WHERE "isActive" = true;

ALTER TABLE "coach_chat_sessions"
  ADD CONSTRAINT "coach_chat_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coach_chat_sessions"
  ADD CONSTRAINT "coach_chat_sessions_comercialId_fkey"
  FOREIGN KEY ("comercialId") REFERENCES "comerciales"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coach_chat_messages"
  ADD CONSTRAINT "coach_chat_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "coach_chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
