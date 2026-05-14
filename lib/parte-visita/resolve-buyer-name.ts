import { prisma } from "@/lib/prisma";

type ResolveBuyerNameInput = {
  buyerPhone: string;
  sessionBuyerName?: string | null;
  draftDemandId?: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function phoneSuffix(value: string): string {
  const digits = value.replace(/\D+/g, "");
  return digits.slice(-9);
}

export async function resolveParteVisitaBuyerName(
  input: ResolveBuyerNameInput,
): Promise<string | null> {
  const fromSession = nonEmpty(input.sessionBuyerName);
  if (fromSession) return fromSession;

  if (input.draftDemandId) {
    const demandById = await prisma.demandCurrent.findUnique({
      where: { codigo: input.draftDemandId },
      select: { nombre: true },
    });
    const fromDemandById = nonEmpty(demandById?.nombre);
    if (fromDemandById) return fromDemandById;

    const demandSnapshotById = await prisma.demandSnapshot.findUnique({
      where: { codigo: input.draftDemandId },
      select: { nombre: true },
    });
    const fromSnapshotById = nonEmpty(demandSnapshotById?.nombre);
    if (fromSnapshotById) return fromSnapshotById;
  }

  const suffix = phoneSuffix(input.buyerPhone);
  if (suffix.length >= 9) {
    const demandByPhone = await prisma.demandCurrent.findFirst({
      where: { telefono: { endsWith: suffix } },
      select: { nombre: true },
    });
    const fromDemandByPhone = nonEmpty(demandByPhone?.nombre);
    if (fromDemandByPhone) return fromDemandByPhone;

    const snapshotByPhone = await prisma.demandSnapshot.findFirst({
      where: { telefono: { endsWith: suffix } },
      orderBy: { lastSeenAt: "desc" },
      select: { nombre: true },
    });
    const fromSnapshotByPhone = nonEmpty(snapshotByPhone?.nombre);
    if (fromSnapshotByPhone) return fromSnapshotByPhone;
  }

  const latestInbound = await prisma.event.findFirst({
    where: {
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: input.buyerPhone,
      type: "WHATSAPP_RECIBIDO",
    },
    orderBy: { occurredAt: "desc" },
    select: { payload: true },
  });
  const payload =
    latestInbound?.payload &&
    typeof latestInbound.payload === "object" &&
    !Array.isArray(latestInbound.payload)
      ? (latestInbound.payload as Record<string, unknown>)
      : null;
  const profileName =
    payload && typeof payload.profileName === "string"
      ? nonEmpty(payload.profileName)
      : null;
  if (profileName) return profileName;

  return null;
}
