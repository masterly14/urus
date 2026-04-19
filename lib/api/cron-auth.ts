/**
 * Autorización compartida para rutas de cron y workers.
 * Solo acepta header `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron y QStash deben configurarse para enviar el secret vía header,
 * nunca como query param (evita filtración en logs, Referer y URL bar).
 * Usado por: /api/cron/*, /api/events (POST y GET).
 */
export function isAuthorized(request: Request): boolean {
  const token = process.env.CRON_SECRET;
  if (!token) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${token}`;
}
