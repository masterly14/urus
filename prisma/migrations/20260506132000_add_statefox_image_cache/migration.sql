-- CreateEnum
CREATE TYPE "StatefoxPortalSource" AS ENUM ('idealista', 'fotocasa', 'pisoscom', 'habitaclia', 'unknown');

-- CreateEnum
CREATE TYPE "StatefoxImageCacheStatus" AS ENUM ('PENDING', 'IMPORTED', 'FAILED', 'BLOCKED', 'CAPTCHA', 'LISTING_REMOVED', 'NO_IMAGES_FOUND');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'IMPORT_STATEFOX_PORTAL_IMAGES';

-- CreateTable
CREATE TABLE "statefox_comparable_images" (
    "id" TEXT NOT NULL,
    "source" "StatefoxPortalSource" NOT NULL,
    "statefoxId" TEXT NOT NULL,
    "portalUrl" TEXT NOT NULL,
    "imageIndex" INTEGER NOT NULL,
    "originalImageUrl" TEXT,
    "originalImageSha256" TEXT,
    "cloudinaryPublicId" TEXT,
    "cloudinarySecureUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "format" TEXT,
    "status" "StatefoxImageCacheStatus" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statefox_comparable_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "statefox_comparable_images_source_statefoxId_imageIndex_key" ON "statefox_comparable_images"("source", "statefoxId", "imageIndex");

-- CreateIndex
CREATE INDEX "statefox_comparable_images_statefoxId_status_idx" ON "statefox_comparable_images"("statefoxId", "status");

-- CreateIndex
CREATE INDEX "statefox_comparable_images_source_status_updatedAt_idx" ON "statefox_comparable_images"("source", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "statefox_comparable_images_originalImageSha256_idx" ON "statefox_comparable_images"("originalImageSha256");
