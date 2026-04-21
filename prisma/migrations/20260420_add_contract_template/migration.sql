-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "structure" JSONB NOT NULL,
    "variableBindings" JSONB NOT NULL DEFAULT '[]',
    "sharedClauseOverrides" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_templates_documentKind_version_key" ON "contract_templates"("documentKind", "version");

-- CreateIndex
CREATE INDEX "contract_templates_documentKind_isActive_idx" ON "contract_templates"("documentKind", "isActive");

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
