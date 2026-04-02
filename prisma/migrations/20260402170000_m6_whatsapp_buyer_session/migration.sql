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

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_buyer_sessions_waId_key" ON "whatsapp_buyer_sessions"("waId");

-- CreateIndex
CREATE INDEX "whatsapp_buyer_sessions_demandId_idx" ON "whatsapp_buyer_sessions"("demandId");
