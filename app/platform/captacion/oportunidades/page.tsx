/**
 * /platform/captacion/oportunidades
 *
 * Pantalla unica de captacion de cartera externa para comerciales.
 * Muestra un listado plano de anuncios externos (Idealista, Pisos.com,
 * Fotocasa) ordenados por mas reciente, con accion para registrar al
 * publicante en Inmovilla CRM.
 *
 * Caracteristicas:
 *  - Filtros simples (ciudad, publicante, ventana temporal, precio, m²,
 *    habitaciones, "solo con telefono", ocultar Fotocasa).
 *  - Filtrado opcional por zona dibujada en mapa (Sheet lateral, opt-in).
 *  - Refresco automatico cada 90s (toggle, OFF por defecto).
 *  - Boton "Anadir a CRM" por anuncio (deshabilitado cuando no hay
 *    publicante o telefono detectado).
 *
 * Permisos: cualquier usuario autenticado.
 *
 * Mock: `?mock=1` activa fixtures locales sin red para revisar UI.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { OportunidadesView } from "./oportunidades-view";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ mock?: string }>;
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const isMock = params.mock === "1";

  if (!isMock) {
    const session = await getSession();
    if (!session) {
      redirect("/login?redirectTo=/platform/captacion/oportunidades");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
          Inmuebles
        </h1>
        <p className="text-sm text-muted-foreground">Listado de Inmuebles</p>
      </div>
      <OportunidadesView mock={isMock} />
    </div>
  );
}
