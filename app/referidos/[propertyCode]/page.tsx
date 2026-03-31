import { prisma } from "@/lib/prisma";
import { ReferralForm } from "./referral-form";

export default async function ReferidosPage({
  params,
}: {
  params: Promise<{ propertyCode: string }> | { propertyCode: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const propertyCode = resolvedParams.propertyCode;

  const closedEvent = await prisma.event.findFirst({
    where: {
      type: "OPERACION_CERRADA",
      aggregateId: propertyCode,
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });

  const eventPayload = (closedEvent?.payload ?? {}) as Record<string, unknown>;
  const referrerName = typeof eventPayload.clientName === "string"
    ? eventPayload.clientName.trim().split(/\s+/)[0]
    : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">URUS Capital</h1>
          <p className="text-xs text-muted-foreground mt-1">Programa de referidos</p>
        </div>
        <ReferralForm propertyCode={propertyCode} referrerName={referrerName} />
      </div>
    </div>
  );
}
