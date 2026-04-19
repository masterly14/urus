import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { DemoUiBanner } from "@/components/demo-ui-banner";
import {
  getMicrositeMockSelection,
  isMicrositeMockEnabled,
  isMicrositeMockToken,
} from "@/lib/microsite/mock-selection";

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
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-lg font-semibold text-slate-900">Sin propiedades para mostrar</div>
            <div className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
              Esta selección se generó sin resultados renderizables. Contacta con tu agente para más información.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const hero = p.images[0] ?? null;
              const detailHref = `/seleccion/${token}/propiedad/${p.propertyId}`;
              return (
                <Link
                  key={p.propertyId}
                  href={detailHref}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 relative">
                    {hero ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={hero}
                        alt={p.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400 font-medium">
                        Sin imagen
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md shadow-sm border border-white/20">
                      <span className="font-bold text-slate-900 text-sm">{formatPrice(p.price)}</span>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {p.city ?? "Ciudad N/D"}
                      {p.zone ? ` · ${p.zone}` : ""}
                    </div>
                    <h2 className="mt-1.5 line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-tight">
                      {p.title}
                    </h2>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 font-medium">
                      {typeof p.metersBuilt === "number" ? (
                        <span className="flex items-center gap-1"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>{p.metersBuilt} m²</span>
                      ) : null}
                      {typeof p.rooms === "number" ? (
                        <span className="flex items-center gap-1"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h18V2"/><path d="M3 13v9"/><path d="M21 13v9"/><path d="M3 13h18"/><path d="M12 13v9"/></svg>{p.rooms} hab</span>
                      ) : null}
                      {typeof p.baths === "number" ? (
                        <span className="flex items-center gap-1"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><line x1="10" x2="8" y1="5" y2="7"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="7" x2="7" y1="19" y2="21"/><line x1="17" x2="17" y1="19" y2="21"/></svg>{p.baths} baños</span>
                      ) : null}
                    </div>

                    {p.extras.length > 0 ? (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-1.5 mt-auto">
                        {p.extras.slice(0, 3).map((extra) => (
                          <span
                            key={`${p.propertyId}:${extra}`}
                            className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            {extra}
                          </span>
                        ))}
                        {p.extras.length > 3 ? (
                          <span className="rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                            +{p.extras.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 text-xs font-semibold text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
                      Ver ficha completa
                      <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </div>
                  </div>
                </Link>
              );
            })}
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
