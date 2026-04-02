-- AlterTable: make signaturitSignatureId nullable for in-house signatures
ALTER TABLE "signature_requests" ALTER COLUMN "signaturitSignatureId" DROP NOT NULL;

-- AddColumn: SHA-256 hash of the original PDF at signature creation time
ALTER TABLE "signature_requests" ADD COLUMN "documentHash" TEXT;

-- AddColumn: secure token for the public signing URL
ALTER TABLE "signature_requests" ADD COLUMN "signingToken" TEXT;

-- AddColumn: signer IP captured at signing time
ALTER TABLE "signature_requests" ADD COLUMN "signerIp" TEXT;

-- AddColumn: signer User-Agent captured at signing time
ALTER TABLE "signature_requests" ADD COLUMN "signerUserAgent" TEXT;

-- AddColumn: exact consent text accepted by the signer
ALTER TABLE "signature_requests" ADD COLUMN "consentText" TEXT;

-- AddColumn: SHA-256 hash of the stamped/signed PDF
ALTER TABLE "signature_requests" ADD COLUMN "signedDocumentHash" TEXT;

-- CreateIndex: unique index on signingToken for URL lookups
CREATE UNIQUE INDEX "signature_requests_signingToken_key" ON "signature_requests"("signingToken");
