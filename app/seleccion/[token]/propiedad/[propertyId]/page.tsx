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
import { StaticMapImage } from "./static-map-image";
import { MeEncajaButton } from "@/components/seleccion/me-encaja-button";

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
  let alreadyInterested = false;

  if (useMock) {
    const mock = getMicrositeMockSelection();
    properties = mock.properties;
    selectionDemandNombre = mock.demandNombre;
    demoMode = true;
  } else {
    const row = await prisma.micrositeSelection.findUnique({
      where: { token },
      select: {
        id: true,
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

    // Si el comprador ya pulsó "Me encaja" en esta propiedad, queremos que el
    // botón se renderice ya en estado bloqueado para evitar parpadeos y
    // posibles dobles envíos (la API responde 409, pero el badge debe ser la
    // verdad inicial). El flag se calcula en server-side.
    const interestRow = await prisma.micrositeSelectionFeedback.findUnique({
      where: {
        selectionId_propertyId: {
          selectionId: row.id,
          propertyId,
        },
      },
      select: { decision: true },
    });
    alreadyInterested = interestRow?.decision === "ME_INTERESA";
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
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {demoMode ? <DemoUiBanner demoPath="/seleccion/demo" /> : null}

      {/* Banner / Hero Image */}
      <div className="relative w-full h-[200px] md:h-[300px] overflow-hidden bg-slate-900">
        <div className="absolute inset-0 bg-blue-900/60 mix-blend-multiply z-10" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/edificios-eficientes-scaled.jpg"
          alt="Urus Capital Group - Propiedades"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-20 h-full flex flex-col items-center justify-center text-center px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/image.png"
            alt="Urus Capital Group Logo"
            className="mb-4 h-16 md:h-20 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]"
          />
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white drop-shadow-md">
            Detalle de propiedad
          </h1>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link
            href={`/seleccion/${token}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-md border border-slate-200 hover:border-blue-200 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Volver
          </Link>
          
          <div className="hidden sm:flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/image.png"
              alt="Urus Capital Logo"
              className="h-7 w-auto object-contain"
            />
          </div>

          <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="hidden md:inline">{selectionDemandNombre ? `${selectionDemandNombre} · ` : ""}</span>
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 shadow-sm">
              {currentIndex + 1} de {properties.length}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
          <ImageCarousel images={property.images} alt={property.title} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {property.city ?? ""}
                {property.zone ? ` · ${property.zone}` : ""}
              </div>
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl text-slate-900 leading-tight">
                {property.title}
              </h1>

              <div className="mt-6 flex flex-wrap items-center gap-4 pb-6 border-b border-slate-100">
                <span className="text-3xl font-bold text-slate-900 bg-blue-50/50 px-3 py-1 rounded-lg border border-blue-100">{formatPrice(property.price)}</span>
                {pricePerMeter ? (
                  <span className="text-sm font-medium text-slate-500">{pricePerMeter}</span>
                ) : null}
                <div className="ms-auto">
                  <MeEncajaButton
                    selectionToken={token}
                    propertyId={property.propertyId}
                    propertyTitle={property.title}
                    alreadyInterested={alreadyInterested}
                    demoMode={demoMode}
                    size="large"
                  />
                </div>
              </div>

              {property.description ? (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                    Descripción
                  </h2>
                  <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600 font-medium">
                    {property.description}
                  </div>
                </div>
              ) : null}
            </div>

            {property.extras.length > 0 ? (
              <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                  Características destacadas
                </h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  {property.extras.map((extra) => (
                    <span
                      key={extra}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
                    >
                      {extra}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hasMap ? (
              <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Ubicación
                </h2>
                <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 shadow-inner bg-slate-100">
                  <StaticMapImage
                    latitude={property.latitude!}
                    longitude={property.longitude!}
                    address={property.address}
                    zone={property.zone}
                    city={property.city}
                    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
                  />
                </div>
                {property.address ? (
                  <div className="mt-3 text-sm font-medium text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    {property.address}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sticky top-24">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-3 mb-4">Ficha técnica</h3>
              <dl className="space-y-3.5">
                {details.map((d) => (
                  <div key={d.label} className="flex justify-between gap-3 text-sm">
                    <dt className="text-slate-500 font-medium">{d.label}</dt>
                    <dd className="text-right font-semibold text-slate-900">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {property.energyCertRating ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-3 mb-4">Eficiencia energética</h3>
                <div className="flex items-center gap-4">
                  <EnergyCertBadge rating={property.energyCertRating} />
                  {property.energyCertValue ? (
                    <span className="text-sm font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">{property.energyCertValue}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <nav className="mt-12 flex items-center justify-between border-t border-slate-200 pt-8 gap-4">
          {prevProperty ? (
            <Link
              href={`/seleccion/${token}/propiedad/${prevProperty.propertyId}`}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </div>
              <div className="text-left overflow-hidden">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">Anterior</div>
                <div className="line-clamp-1 font-medium text-slate-900 text-sm mt-0.5">{prevProperty.title}</div>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {nextProperty ? (
            <Link
              href={`/seleccion/${token}/propiedad/${nextProperty.propertyId}`}
              className="flex-1 flex items-center justify-end gap-3 p-4 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all group text-right"
            >
              <div className="overflow-hidden">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">Siguiente</div>
                <div className="line-clamp-1 font-medium text-slate-900 text-sm mt-0.5">{nextProperty.title}</div>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </nav>
      </div>

      <footer className="border-t border-slate-200 bg-white py-12 px-4 mt-auto">
        <div className="mx-auto max-w-6xl flex flex-col items-center gap-6">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/image.png"
              alt="Urus Capital Group Logo"
              className="h-12 w-auto object-contain"
            />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              Urus Capital Group
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Te ayudamos a encontrar la propiedad de tus sueños.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-xs font-semibold text-slate-400">
            <span className="hover:text-blue-600 transition-colors cursor-pointer">Inicio</span>
            <span>·</span>
            <span className="hover:text-blue-600 transition-colors cursor-pointer">Propiedades</span>
            <span>·</span>
            <span className="hover:text-blue-600 transition-colors cursor-pointer">Contacto</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function EnergyCertBadge({ rating }: { rating: string }) {
  const colorMap: Record<string, string> = {
    A: "bg-emerald-600",
    B: "bg-emerald-500",
    C: "bg-lime-500",
    D: "bg-amber-500",
    E: "bg-orange-500",
    F: "bg-red-500",
    G: "bg-red-700",
  };
  const letter = rating.trim().toUpperCase().charAt(0);
  const bg = colorMap[letter] ?? "bg-slate-600";

  return (
    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm ${bg}`}>
      {letter || "?"}
    </div>
  );
}
