-- M6: nuevo JobType para enviar acuse al comprador cuando pulsa "Me encaja"
-- en el micrositio (flujo desacoplado del NLU).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'SEND_BUYER_INTEREST_ACK'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'SEND_BUYER_INTEREST_ACK';
    END IF;
END
$$;
