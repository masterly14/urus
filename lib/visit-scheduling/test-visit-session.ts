import { prisma } from "@/lib/prisma";
import type { AppSession } from "@/lib/auth/session";
import { isCeoOrAdmin } from "@/lib/auth/session";

const comercialSelect = {
  id: true,
  nombre: true,
  waId: true,
  composioConnectionId: true,
  composioConnectedAt: true,
  inmovillaRefCode: true,
} as const;

/**
 * Comercial a usar en el simulador /platform/test-visit:
 * siempre el vinculado al usuario (User.comercialId), salvo CEO/admin
 * sin vínculo, que conservan el primer comercial con Composio (herramienta interna).
 */
export async function loadComercialForInteractiveTest(app: AppSession) {
  if (app.comercialId) {
    return prisma.comercial.findFirst({
      where: { id: app.comercialId, activo: true },
      select: comercialSelect,
    });
  }
  if (isCeoOrAdmin(app.role)) {
    return prisma.comercial.findFirst({
      where: {
        composioConnectionId: { not: null },
        activo: true,
      },
      select: comercialSelect,
      orderBy: { nombre: "asc" },
    });
  }
  return null;
}

export function canAccessTestVisitSession(
  app: AppSession,
  sessionComercialId: string,
): boolean {
  if (isCeoOrAdmin(app.role)) return true;
  return app.comercialId === sessionComercialId;
}
