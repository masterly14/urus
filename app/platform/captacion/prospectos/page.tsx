/**
 * /platform/captacion/prospectos
 *
 * Vista operativa de prospectos ya enviados a Inmovilla.
 * - Comercial: ve prospectos enviados por él.
 * - CEO/Admin: ve todos y puede filtrar por comercial en cliente.
 *
 * Mock: `?mock=1` activa fixtures locales.
 */

import { redirect } from "next/navigation";
import { getSession, isCeoOrAdmin } from "@/lib/auth/session";
import { OportunidadesView } from "../oportunidades/oportunidades-view";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ mock?: string }>;
}

export default async function ProspectosPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const isMock = params.mock === "1";

  if (!isMock) {
    const session = await getSession();
    if (!session) {
      redirect("/login?redirectTo=/platform/captacion/prospectos");
    }
    const canSeeAll = isCeoOrAdmin(session.role);
    return (
      <div className="flex h-full flex-col gap-3 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
            Prospectos enviados
          </h1>
          <p className="text-sm text-muted-foreground">
            Inmuebles ya sincronizados como prospecto y listos para alta/operación.
          </p>
        </div>
        <OportunidadesView
          mock={false}
          mode="prospectos"
          prospectScope={{
            enabled: true,
            canChooseActor: canSeeAll,
            actorUserId: canSeeAll ? null : session.userId,
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
          Prospectos enviados
        </h1>
        <p className="text-sm text-muted-foreground">
          Inmuebles ya sincronizados como prospecto y listos para alta/operación.
        </p>
      </div>
      <OportunidadesView
        mock
        mode="prospectos"
        prospectScope={{
          enabled: true,
          canChooseActor: true,
          actorUserId: null,
        }}
      />
    </div>
  );
}
