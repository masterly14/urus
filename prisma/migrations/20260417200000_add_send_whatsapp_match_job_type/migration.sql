-- H21: nuevo JobType para envío asíncrono de WhatsApp al comprador tras MATCH_GENERADO.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'SEND_WHATSAPP_MATCH'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'SEND_WHATSAPP_MATCH';
    END IF;
END
$$;
