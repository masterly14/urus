-- H6: tabla key-value para checkpoints de ingestion.
CREATE TABLE IF NOT EXISTS "kv_store" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kv_store_pkey" PRIMARY KEY ("key")
);
