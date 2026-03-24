/**
 * URL pública de la app (enlaces WhatsApp al microsite y al panel de validación).
 * Prioridad: NEXT_PUBLIC_APP_URL > VERCEL_URL (https) > localhost.
 */
export function getPublicAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return host.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
