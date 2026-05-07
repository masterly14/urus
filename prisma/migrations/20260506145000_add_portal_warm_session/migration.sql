-- CreateEnum
CREATE TYPE "PortalWarmSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "portal_warm_sessions" (
    "id" TEXT NOT NULL,
    "source" "StatefoxPortalSource" NOT NULL,
    "cookieHeader" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "proxySession" TEXT,
    "status" "PortalWarmSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "maxRequests" INTEGER NOT NULL DEFAULT 40,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "warmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "invalidReason" TEXT,

    CONSTRAINT "portal_warm_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_warm_sessions_source_status_expiresAt_idx" ON "portal_warm_sessions"("source", "status", "expiresAt");
