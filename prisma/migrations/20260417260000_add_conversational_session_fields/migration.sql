-- AlterTable: add conversational agent fields to WhatsAppBuyerSession
ALTER TABLE "whatsapp_buyer_sessions" ADD COLUMN "conversationPhase" TEXT;
ALTER TABLE "whatsapp_buyer_sessions" ADD COLUMN "buyerDigest" TEXT;
