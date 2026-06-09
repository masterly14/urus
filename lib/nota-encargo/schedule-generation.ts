import type { NotaEncargoSession } from "@prisma/client";

export function isStaleNotaEncargoSchedule(
  session: Pick<NotaEncargoSession, "scheduleGeneration">,
  requestedGeneration?: number,
): boolean {
  const generation = requestedGeneration ?? 0;
  return generation !== session.scheduleGeneration;
}
