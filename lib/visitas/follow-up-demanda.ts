import { Client } from "@upstash/qstash";
import { fromZonedTime } from "date-fns-tz";
import { getPublicAppUrl } from "@/lib/microsite/app-url";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VISIT_TIMEZONE = "Europe/Madrid";
const FOLLOW_UP_ROUTE = "/api/cron/visitas/follow-up-demanda";

export type FollowUpDemandaScheduleInput = {
  visitSessionId: string;
  comercialId: string;
  demandId: string | null;
  propertyCode: string | null;
  visitorName: string;
  visitorPhone: string;
  visitDate: string;
  visitStartTime: string;
};

type VisitDateTimeInput = {
  visitDate: string;
  visitStartTime: string;
};

function parseVisitDateTime(input: VisitDateTimeInput): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) return null;
  if (!/^\d{2}:\d{2}$/.test(input.visitStartTime)) return null;
  const visitStart = fromZonedTime(
    `${input.visitDate}T${input.visitStartTime}:00`,
    VISIT_TIMEZONE,
  );
  if (Number.isNaN(visitStart.getTime())) return null;
  return visitStart;
}

export function computeFollowUpDemandaSendAt(input: VisitDateTimeInput): Date | null {
  const visitStart = parseVisitDateTime(input);
  if (!visitStart) return null;
  return new Date(visitStart.getTime() + DAY_IN_MS);
}

export async function scheduleFollowUpDemanda(input: FollowUpDemandaScheduleInput): Promise<{
  scheduled: boolean;
  reason?: string;
  sendAtIso?: string;
}> {
  const qstashToken = process.env.QSTASH_TOKEN?.trim();
  if (!qstashToken) {
    return { scheduled: false, reason: "QSTASH_TOKEN no configurado" };
  }

  const sendAt = computeFollowUpDemandaSendAt({
    visitDate: input.visitDate,
    visitStartTime: input.visitStartTime,
  });
  if (!sendAt) {
    return { scheduled: false, reason: "Fecha/hora de visita inválidas" };
  }

  const baseUrl = getPublicAppUrl();
  const client = new Client({ token: qstashToken });

  await client.publishJSON({
    url: `${baseUrl}${FOLLOW_UP_ROUTE}`,
    body: {
      visitSessionId: input.visitSessionId,
      comercialId: input.comercialId,
      demandId: input.demandId,
      propertyCode: input.propertyCode,
      visitorName: input.visitorName,
      visitorPhone: input.visitorPhone,
      sendAtIso: sendAt.toISOString(),
    },
    notBefore: Math.floor(sendAt.getTime() / 1000),
    retries: 3,
  });

  return { scheduled: true, sendAtIso: sendAt.toISOString() };
}
