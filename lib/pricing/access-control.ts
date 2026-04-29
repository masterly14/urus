import type { AppSession } from "@/lib/auth/session";
import { isCeoOrAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function canAccessPricingProperty(
  session: AppSession,
  propertyCode: string,
): Promise<boolean> {
  if (isCeoOrAdmin(session.role)) return true;
  if (!session.comercialId) return false;

  const property = await prisma.propertyCurrent.findFirst({
    where: {
      OR: [{ codigo: propertyCode }, { ref: propertyCode }],
    },
    select: { comercialId: true },
  });

  return property?.comercialId === session.comercialId;
}
