-- CreateTable
CREATE TABLE "inmovilla_session_store" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "l" TEXT NOT NULL,
    "idPestanya" TEXT NOT NULL,
    "miid" TEXT NOT NULL,
    "idUsuario" TEXT NOT NULL,
    "numAgencia" TEXT NOT NULL,
    "cookies" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_session_store_pkey" PRIMARY KEY ("id")
);
