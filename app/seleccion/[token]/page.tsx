import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { DemoUiBanner } from "@/components/demo-ui-banner";
import { PropertyCard } from "@/components/seleccion/property-card";
import {
  getMicrositeMockSelection,
  isMicrositeMockEnabled,
  isMicrositeMockToken,
} from "@/lib/microsite/mock-selection";

export default async function SeleccionPage({
  params,
}: {
  params: Promise<{ token: string }> | { token: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const token = resolvedParams.token;
  const now = new Date();

  const useMock =
    isMicrositeMockToken(token) && isMicrositeMockEnabled();

  if (isMicrositeMockToken(token) && !isMicrositeMockEnabled()) {
    notFound();
  }

  let selection: {
    token: string;
    demandId: string;
    demandNombre: string;
    createdAt: Date;
  };
  let properties: ReturnType<typeof coerceMicrositeCuratedProperties>;
  let alreadyInterestedIds: Set<string> = new Set();
  const demoMode = useMock;

  if (useMock) {
    const mock = getMicrositeMockSelection();
    selection = {
      token: mock.token,
      demandId: mock.demandId,
      demandNombre: mock.demandNombre,
      createdAt: mock.createdAt,
    };
    properties = mock.properties;
  } else {
    const row = await prisma.micrositeSelection.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        status: true,
        demandId: true,
        demandNombre: true,
        properties: true,
        createdAt: true,
        expiresAt: true,
        firstViewedAt: true,
      },
    });

    if (!row) notFound();
    if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) notFound();
    if (row.status === "EXPIRED") notFound();

    await prisma.micrositeSelection.update({
      where: { token },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: now,
        firstViewedAt: row.firstViewedAt ?? now,
      },
    });

    // Cargamos el conjunto de `propertyId` que ya han sido marcadas como
    // `ME_INTERESA` para esta selección. El componente cliente usa este flag
    // para renderizar el badge "Ya elegida" de forma permanente (idempotencia
    // hard: el botón solo registra interés una única vez por propiedad y la
    // API responde 409 ante intentos posteriores).
    const interestRows = await prisma.micrositeSelectionFeedback.findMany({
      where: {
        selectionId: row.id,
        decision: "ME_INTERESA",
      },
      select: { propertyId: true },
    });
    alreadyInterestedIds = new Set(interestRows.map((r) => r.propertyId));

    selection = {
      token: row.token,
      demandId: row.demandId,
      demandNombre: row.demandNombre,
      createdAt: row.createdAt,
    };
    properties = coerceMicrositeCuratedProperties(row.properties as unknown);
  }

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
            Tu selección exclusiva
          </h1>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Urus Capital Group</div>
              <h2 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
                Selección de propiedades
              </h2>
              {selection.demandNombre ? (
                <div className="mt-1 text-sm text-slate-500">
                  Preparada para{" "}
                  <span className="font-medium text-slate-800">{selection.demandNombre}</span>
                </div>
              ) : null}
            </div>
            <div className="text-xs text-slate-400 font-medium flex flex-wrap items-center gap-2">
              <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                {new Intl.DateTimeFormat("es-ES", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(selection.createdAt)}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200 shadow-sm font-semibold flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {properties.length} {properties.length === 1 ? "propiedad" : "propiedades"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        {properties.length > 0 ? (
          <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 md:p-6">
            <p className="text-sm leading-relaxed text-slate-700 font-medium">
              Hemos analizado el mercado actual y seleccionado estas propiedades especialmente para ti.
              Nuestro motor de búsqueda ha evaluado cientos de opciones para encontrar las que mejor
              se ajustan a tus criterios. Revísalas con calma y dinos cuáles te interesan.
            </p>
          </div>
        ) : null}
        {properties.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-lg font-semibold text-slate-900">Sin propiedades para mostrar</div>
            <div className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
              Esta selección se generó sin resultados renderizables. Contacta con tu agente para más información.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <PropertyCard
                key={p.propertyId}
                selectionToken={selection.token}
                property={p}
                alreadyInterested={alreadyInterestedIds.has(p.propertyId)}
                demoMode={demoMode}
              />
            ))}
          </div>
        )}
      </section>

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
