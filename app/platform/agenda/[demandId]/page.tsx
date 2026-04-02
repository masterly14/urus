import { notFound } from "next/navigation";
import {
  isDemoUiEnabled,
  isDemoUiRouteSegment,
} from "@/lib/microfrontends/demo-ui";
import { AgendaForm } from "./agenda-form";

export default async function AgendaPage({
  params,
}: {
  params: Promise<{ demandId: string }> | { demandId: string };
}) {
  const { demandId } = await Promise.resolve(params);

  if (isDemoUiRouteSegment(demandId) && !isDemoUiEnabled()) {
    notFound();
  }

  const demoMode = isDemoUiRouteSegment(demandId) && isDemoUiEnabled();

  return <AgendaForm demandId={demandId} demoMode={demoMode} />;
}
