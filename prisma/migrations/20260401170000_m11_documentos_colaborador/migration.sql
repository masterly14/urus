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

-- CreateIndex
CREATE INDEX "documentos_colaborador_asignacionId_idx" ON "documentos_colaborador"("asignacionId");

-- CreateIndex
CREATE INDEX "documentos_colaborador_hitoId_idx" ON "documentos_colaborador"("hitoId");

-- AddForeignKey
ALTER TABLE "documentos_colaborador" ADD CONSTRAINT "documentos_colaborador_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "colaborador_asignaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_colaborador" ADD CONSTRAINT "documentos_colaborador_hitoId_fkey" FOREIGN KEY ("hitoId") REFERENCES "colaborador_hitos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
