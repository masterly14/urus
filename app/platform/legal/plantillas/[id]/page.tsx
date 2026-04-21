import { redirect } from "next/navigation";

export default async function PlantillaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/platform/legal/plantillas/${id}/editor`);
}
