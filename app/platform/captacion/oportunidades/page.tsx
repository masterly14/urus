/**
 * /platform/captacion/oportunidades
 *
 * Pantalla desactivada: el pipeline Market in-house está apagado y el acceso
 * comercial se retiró del sidebar. Redirige a Captación (notas de encargo).
 *
 * Mock: `?mock=1` conserva la vista legacy para revisión de UI sin red.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { OportunidadesView } from "./oportunidades-view";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ mock?: string }>;
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const isMock = params.mock === "1";

  if (!isMock) {
    redirect("/platform/captacion");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login?redirectTo=/platform/captacion");
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Inmuebles (mock)" description="Vista legacy solo con ?mock=1" />
      <OportunidadesView mock={isMock} />
    </div>
  );
}
