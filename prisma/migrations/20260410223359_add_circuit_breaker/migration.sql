-- CreateEnum
CREATE TYPE "CircuitBreakerStatus" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'COMPOSIO_CALENDAR_CONNECTED';

-- CreateTable
CREATE TABLE "circuit_breaker" (
    "id" TEXT NOT NULL,
    "status" "CircuitBreakerStatus" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "halfOpenAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuit_breaker_pkey" PRIMARY KEY ("id")
);
