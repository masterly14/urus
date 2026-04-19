import { redirect } from "next/navigation";

export default async function LegacyPricingAnalisisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/platform/pricing/analisis/${id}`);
}
