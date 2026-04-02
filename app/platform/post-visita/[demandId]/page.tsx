import { notFound } from "next/navigation";
import {
  isDemoUiEnabled,
  isDemoUiRouteSegment,
} from "@/lib/microfrontends/demo-ui";
import { PostVisitaForm } from "./post-visita-form";

export default async function PostVisitaPage({
  params,
}: {
  params: Promise<{ demandId: string }> | { demandId: string };
}) {
  const { demandId } = await Promise.resolve(params);

  if (isDemoUiRouteSegment(demandId) && !isDemoUiEnabled()) {
    notFound();
  }

  const demoMode = isDemoUiRouteSegment(demandId) && isDemoUiEnabled();

  return <PostVisitaForm demandId={demandId} demoMode={demoMode} />;
}
