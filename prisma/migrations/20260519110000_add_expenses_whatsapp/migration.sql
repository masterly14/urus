-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM (
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'NEEDS_CORRECTION',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "ExpensePromptType" AS ENUM (
  'CONFIRMATION',
  'CORRECTION',
  'CLARITY_REQUEST'
);

-- CreateTable
CREATE TABLE "expenses" (
  "id" TEXT NOT NULL,
  "waId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "vendor" TEXT,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "rawInput" JSONB NOT NULL,
  "aiConfidence" DOUBLE PRECISION,
  "createdByRole" TEXT NOT NULL DEFAULT 'ceo',
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_attachments" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "metaMediaId" TEXT,
  "cloudinaryUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "sha256" TEXT,
  "filename" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_conversation_states" (
  "id" TEXT NOT NULL,
  "waId" TEXT NOT NULL,
  "draft" JSONB NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastPromptType" "ExpensePromptType" NOT NULL DEFAULT 'CONFIRMATION',
  "pendingMessageId" TEXT,
  "lastMessageId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "expense_conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_sourceMessageId_key" ON "expenses"("sourceMessageId");

-- CreateIndex
CREATE INDEX "expenses_waId_createdAt_idx" ON "expenses"("waId", "createdAt");

-- CreateIndex
CREATE INDEX "expenses_waId_status_idx" ON "expenses"("waId", "status");

-- CreateIndex
CREATE INDEX "expense_attachments_expenseId_idx" ON "expense_attachments"("expenseId");

-- CreateIndex
CREATE INDEX "expense_attachments_metaMediaId_idx" ON "expense_attachments"("metaMediaId");

-- CreateIndex
CREATE INDEX "expense_attachments_sha256_idx" ON "expense_attachments"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "expense_conversation_states_waId_key" ON "expense_conversation_states"("waId");

-- CreateIndex
CREATE INDEX "expense_conversation_states_expiresAt_idx" ON "expense_conversation_states"("expiresAt");

-- CreateIndex
CREATE INDEX "expense_conversation_states_waId_updatedAt_idx" ON "expense_conversation_states"("waId", "updatedAt");

-- AddForeignKey
ALTER TABLE "expense_attachments"
ADD CONSTRAINT "expense_attachments_expenseId_fkey"
FOREIGN KEY ("expenseId") REFERENCES "expenses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
