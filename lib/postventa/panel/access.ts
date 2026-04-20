/**
 * Reglas de acceso al panel lateral de operaciones.
 *
 * Principios:
 * - CEO y admin tienen acceso total (equivalen, según lib/auth/session).
 * - Un comercial puede acceder al panel de cualquier operación post-venta
 *   que ya se le muestre en el pipeline; las notas quedan filtradas por
 *   autor. Checklist y adjuntos son compartidos (datos operativos).
 * - Las mutaciones (editar/eliminar) sólo las hace el autor o CEO/admin.
 */

import type { AppRole, AppSession } from "@/lib/auth/session";

export function isPrivileged(role: AppRole): boolean {
  return role === "ceo" || role === "admin";
}

/**
 * ¿Puede el usuario ver una nota determinada?
 * - CEO/admin: todas.
 * - comercial: solo las suyas.
 */
export function canViewNota(
  session: Pick<AppSession, "role" | "userId">,
  nota: { authorUserId: string },
): boolean {
  if (isPrivileged(session.role)) return true;
  return nota.authorUserId === session.userId;
}

/**
 * ¿Puede el usuario modificar/eliminar una nota?
 * Sólo autor o CEO/admin.
 */
export function canMutateNota(
  session: Pick<AppSession, "role" | "userId">,
  nota: { authorUserId: string },
): boolean {
  if (isPrivileged(session.role)) return true;
  return nota.authorUserId === session.userId;
}

/**
 * ¿Puede el usuario eliminar un ítem de checklist?
 * Cualquier usuario autenticado puede marcar/editar; para eliminar
 * exigimos ser creador o CEO/admin (para evitar pérdida accidental).
 */
export function canDeleteChecklistItem(
  session: Pick<AppSession, "role" | "userId">,
  item: { createdByUserId: string },
): boolean {
  if (isPrivileged(session.role)) return true;
  return item.createdByUserId === session.userId;
}

/**
 * ¿Puede el usuario eliminar un adjunto?
 * Autor del upload o CEO/admin.
 */
export function canDeleteAdjunto(
  session: Pick<AppSession, "role" | "userId">,
  adjunto: { uploadedByUserId: string },
): boolean {
  if (isPrivileged(session.role)) return true;
  return adjunto.uploadedByUserId === session.userId;
}
