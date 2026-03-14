/**
 * Autorización compartida para rutas de cron y workers.
 * Acepta: header Authorization Bearer <CRON_SECRET> o query param "token".
 * Usado por: /api/cron/*, /api/events (POST y GET).
 */
export function isAuthorized(request: Request): boolean {
  const token = process.env.CRON_SECRET;
  if (!token) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${token}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("token") === token;
}
