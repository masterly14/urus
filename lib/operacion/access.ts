import type { Prisma } from "@prisma/client";
import type { AppSession } from "@/lib/auth/session";

export const OPERACION_FORBIDDEN_ERROR = "No tienes permiso para acceder a esta operación";

type OperacionOwnership = {
  comercialId: string | null;
};

export function canAccessOperacion(
  session: AppSession,
  operacion: OperacionOwnership,
): boolean {
  if (session.role === "ceo" || session.role === "admin") {
    return true;
  }

  return Boolean(session.comercialId && operacion.comercialId === session.comercialId);
}

export function operacionAccessWhere(session: AppSession): Prisma.OperacionWhereInput {
  if (session.role === "ceo" || session.role === "admin") {
    return {};
  }

  if (!session.comercialId) {
    return { id: "__sin_acceso__" };
  }

  return { comercialId: session.comercialId };
}
