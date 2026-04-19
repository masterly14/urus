import { redirect } from "next/navigation";

/**
 * Ruta deprecada: redirige al nuevo informe de pricing real.
 * Mantiene compatibilidad con links existentes.
 */
export default async function AnalisisRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/platform/pricing/informe/${id}`);
}
