import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "@/lib/microsite/selection";
import { DemoUiBanner } from "@/components/demo-ui-banner";
import {
  getMicrositeMockSelection,
  isMicrositeMockEnabled,
  isMicrositeMockToken,
} from "@/lib/microsite/mock-selection";
import { ImageCarousel } from "./image-carousel";

function formatPrice(n: number | null): string {
  if (n === null) return "Precio N/D";
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} €`;
  }
}

function formatPricePerMeter(n: number | null): string | null {
  if (n === null) return null;
  try {
    return `${new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 0,
    }).format(n)} €/m²`;
  } catch {
    return `${n} €/m²`;
  }
}

type DetailItem = { label: string; value: string };

function buildDetailItems(p: MicrositeCuratedProperty): DetailItem[] {
  const items: DetailItem[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value != null && value.trim()) items.push({ label, value: value.trim() });
  };

  if (typeof p.metersBuilt === "number") add("Superficie construida", `${p.metersBuilt} m²`);
  if (typeof p.metersUsable === "number") add("Superficie útil", `${p.metersUsable} m²`);
  if (typeof p.metersPlot === "number") add("Parcela", `${p.metersPlot} m²`);
  if (typeof p.metersTerrace === "number") add("Terraza", `${p.metersTerrace} m²`);
  if (typeof p.rooms === "number") add("Habitaciones", String(p.rooms));
  if (typeof p.baths === "number") add("Baños", String(p.baths));
  add("Planta", p.floor);
  add("Orientación", p.orientation);
  add("Tipología", p.housing);
  add("Estado", p.condition);
  add("Año de construcción", p.yearBuilt);
  add("Certificado energético", p.energyCertRating);
  if (p.energyCertValue) add("Consumo energético", p.energyCertValue);
  add("Dirección", p.address);
  if (p.advertiserType === "private") add("Anunciante", "Particular");
  else if (p.advertiserType === "professional") add("Anunciante", p.advertiserName ?? "Profesional");

  return items;
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ token: string; propertyId: string }> | { token: string; propertyId: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const { token, propertyId } = resolvedParams;
  const now = new Date();

  const useMock = isMicrositeMockToken(token) && isMicrositeMockEnabled();
  if (isMicrositeMockToken(token) && !isMicrositeMockEnabled()) notFound();

  let properties: MicrositeCuratedProperty[];
  let selectionDemandNombre = "";
  let demoMode = false;

  if (useMock) {
    const mock = getMicrositeMockSelection();
    properties = mock.properties;
    selectionDemandNombre = mock.demandNombre;
    demoMode = true;
  } else {
    const row = await prisma.micrositeSelection.findUnique({
      where: { token },
      select: {
        status: true,
        demandNombre: true,
        properties: true,
        expiresAt: true,
      },
    });

    if (!row) notFound();
    if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) notFound();
    if (row.status === "EXPIRED") notFound();

    properties = coerceMicrositeCuratedProperties(row.properties as unknown);
    selectionDemandNombre = row.demandNombre;
  }

  const property = properties.find((p) => p.propertyId === propertyId);
  if (!property) notFound();

  const currentIndex = properties.findIndex((p) => p.propertyId === propertyId);
  const prevProperty = currentIndex > 0 ? properties[currentIndex - 1] : null;
  const nextProperty = currentIndex < properties.length - 1 ? properties[currentIndex + 1] : null;

  const details = buildDetailItems(property);
  const pricePerMeter = formatPricePerMeter(property.pricePerMeter);
  const hasMap = property.latitude !== null && property.longitude !== null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {demoMode ? <DemoUiBanner demoPath="/seleccion/demo" /> : null}

      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link
            href={`/seleccion/${token}`}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 transition hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Volver a la selección
          </Link>
          <div className="mt-1 text-xs text-neutral-500">
            {selectionDemandNombre ? `${selectionDemandNombre} · ` : ""}
            Propiedad {currentIndex + 1} de {properties.length}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <ImageCarousel images={property.images} alt={property.title} />

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="text-sm text-neutral-400">
                {property.city ?? ""}
                {property.zone ? ` · ${property.zone}` : ""}
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">
                {property.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-3xl font-bold">{formatPrice(property.price)}</span>
              {pricePerMeter ? (
                <span className="text-sm text-neutral-400">{pricePerMeter}</span>
              ) : null}
            </div>

            {property.description ? (
              <div>
                <h2 className="text-lg font-semibold">Descripción</h2>
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-300">
                  {property.description}
                </div>
              </div>
            ) : null}

            {property.extras.length > 0 ? (
              <div>
                <h2 className="text-lg font-semibold">Características</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {property.extras.map((extra) => (
                    <span
                      key={extra}
                      className="rounded-full border border-neutral-700 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-200"
                    >
                      {extra}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hasMap ? (
              <div>
                <h2 className="text-lg font-semibold">Ubicación</h2>
                <div className="mt-3 overflow-hidden rounded-xl border border-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${property.latitude},${property.longitude}&zoom=15&size=800x400&scale=2&maptype=roadmap&markers=color:red%7C${property.latitude},${property.longitude}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}`}
                    alt={`Mapa de ${property.address ?? property.zone ?? property.city ?? "ubicación"}`}
                    className="w-full"
                    loading="lazy"
                  />
                </div>
                {property.address ? (
                  <div className="mt-2 text-xs text-neutral-500">{property.address}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
              <h3 className="text-sm font-semibold text-neutral-300">Ficha técnica</h3>
              <dl className="mt-4 space-y-3">
                {details.map((d) => (
                  <div key={d.label} className="flex justify-between gap-2 text-sm">
                    <dt className="text-neutral-500">{d.label}</dt>
                    <dd className="text-right font-medium text-neutral-200">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {property.energyCertRating ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
                <h3 className="text-sm font-semibold text-neutral-300">Certificado energético</h3>
                <div className="mt-3 flex items-center gap-3">
                  <EnergyCertBadge rating={property.energyCertRating} />
                  {property.energyCertValue ? (
                    <span className="text-xs text-neutral-400">{property.energyCertValue}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <nav className="mt-12 flex items-center justify-between border-t border-neutral-800 pt-6">
          {prevProperty ? (
            <Link
              href={`/seleccion/${token}/propiedad/${prevProperty.propertyId}`}
              className="flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              <div className="text-left">
                <div className="text-xs text-neutral-500">Anterior</div>
                <div className="line-clamp-1">{prevProperty.title}</div>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextProperty ? (
            <Link
              href={`/seleccion/${token}/propiedad/${nextProperty.propertyId}`}
              className="flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
            >
              <div className="text-right">
                <div className="text-xs text-neutral-500">Siguiente</div>
                <div className="line-clamp-1">{nextProperty.title}</div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </div>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-600">
        Urus Capital Group
      </footer>
    </main>
  );
}

function EnergyCertBadge({ rating }: { rating: string }) {
  const colorMap: Record<string, string> = {
    A: "bg-green-600",
    B: "bg-green-500",
    C: "bg-lime-500",
    D: "bg-yellow-500",
    E: "bg-orange-500",
    F: "bg-red-500",
    G: "bg-red-700",
  };
  const letter = rating.trim().toUpperCase().charAt(0);
  const bg = colorMap[letter] ?? "bg-neutral-600";

  return (
    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white ${bg}`}>
      {letter || "?"}
    </div>
  );
}
