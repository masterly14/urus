import { notFound } from "next/navigation";
import { DemoUiBanner } from "@/components/demo-ui-banner";
import {
  isDemoUiEnabled,
  isDemoUiRouteSegment,
} from "@/lib/microfrontends/demo-ui";
import { prisma } from "@/lib/prisma";
import { MICROSITE_VALIDATION_SLA_MS } from "@/lib/microsite/constants";
import { getMicrositeMockSelection } from "@/lib/microsite/mock-selection";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { proxiedStatefoxImageUrl } from "@/lib/statefox/image-url";
import { PropertyDescriptionEditor } from "./property-description-editor";
import { ValidarAcciones } from "./validar-acciones";

function formatPrice(n: number | null): string {
  if (n === null) return "N/D";
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

export default async function ValidarSeleccionPage({
  params,
}: {
  params: Promise<{ validationToken: string }> | { validationToken: string };
}) {
  const { validationToken } = await Promise.resolve(params);

  if (isDemoUiRouteSegment(validationToken) && !isDemoUiEnabled()) {
    notFound();
  }

  const useMock =
    isDemoUiRouteSegment(validationToken) && isDemoUiEnabled();
  const demoMode = useMock;

  type SelectionView = {
    demandId: string;
    demandNombre: string | null;
    status: string;
    properties: ReturnType<typeof coerceMicrositeCuratedProperties>;
    validationDueAt: Date | null;
    createdAt: Date;
  };

  let selection: SelectionView;

  if (useMock) {
    const mock = getMicrositeMockSelection();
    selection = {
      demandId: mock.demandId,
      demandNombre: mock.demandNombre,
      status: "PENDING_VALIDATION",
      properties: mock.properties,
      validationDueAt: new Date(mock.createdAt.getTime() + MICROSITE_VALIDATION_SLA_MS),
      createdAt: mock.createdAt,
    };
  } else {
    const row = await prisma.micrositeSelection.findUnique({
      where: { validationToken },
      select: {
        demandId: true,
        demandNombre: true,
        status: true,
        properties: true,
        validationDueAt: true,
        createdAt: true,
      },
    });

    if (!row) notFound();

    selection = {
      demandId: row.demandId,
      demandNombre: row.demandNombre,
      status: row.status,
      properties: coerceMicrositeCuratedProperties(row.properties as unknown),
      validationDueAt: row.validationDueAt,
      createdAt: row.createdAt,
    };
  }

  const properties = selection.properties;
  const pending = selection.status === "PENDING_VALIDATION";
  const due = selection.validationDueAt;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {demoMode ? <DemoUiBanner demoPath="/validar-seleccion/demo" /> : null}

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
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/image.png" 
              alt="Urus Capital Group Logo" 
              className="h-16 md:h-20 object-contain"
            />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white drop-shadow-md">
            Validación Comercial
          </h1>
        </div>
      </div>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Urus Capital — Validación comercial</div>
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 hidden sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/image.png" 
                alt="Urus Capital Logo" 
                className="h-6 object-contain"
              />
            </div>
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
            Revisar selección de mercado
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
              {selection.demandId}
            </span>
            {selection.demandNombre ? (
              <span className="text-sm font-medium text-slate-600">
                {selection.demandNombre}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
            {due ? (
              <p className="text-xs font-medium text-urus-warning bg-urus-warning/10 border border-urus-warning/30 px-2.5 py-1 rounded shadow-sm inline-flex items-center gap-1.5 w-fit">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Vence: {new Intl.DateTimeFormat("es-ES", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(due)}
              </p>
            ) : null}
            <p className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded shadow-sm w-fit">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              Creado el {new Intl.DateTimeFormat("es-ES", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(selection.createdAt)}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 md:py-10">
        {!pending ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600 shadow-sm flex items-center gap-4">
            <div className="bg-slate-100 p-3 rounded-full text-slate-400">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
            </div>
            <div>
              <p className="font-medium text-slate-900">Estado actual: <strong>{selection.status}</strong></p>
              <p className="text-sm mt-1 text-slate-500">Esta selección ya fue procesada y no requiere más acciones.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8 flex items-start sm:items-center gap-3">
              <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 sm:mt-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <p className="text-sm text-blue-800 font-medium">
                Revisa las fichas (30–60 s) y ajusta la descripción si hace falta. Si apruebas, el comprador recibirá el enlace público por WhatsApp.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((p) => {
                const hero = p.images.find((url) => !isExpiredStatefoxImageUrl(url)) ?? null;
                const heroSrc = hero ? proxiedStatefoxImageUrl(hero) : null;
                return (
                  <article
                    key={p.propertyId}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="aspect-[4/3] bg-slate-100 relative">
                      {heroSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={heroSrc}
                          alt={p.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
                          Sin imagen
                        </div>
                      )}
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md shadow-sm border border-white/20">
                        <span className="font-bold text-slate-900 text-sm">{formatPrice(p.price)}</span>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {p.city ?? ""}
                        {p.zone ? ` · ${p.zone}` : ""}
                      </div>
                      <h2 className="mt-1.5 line-clamp-2 text-base font-semibold text-slate-900 leading-tight">{p.title}</h2>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600">
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
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Teléfonos
                        </span>
                        {p.contactPhones.length > 0 ? (
                          p.contactPhones.map((phone) => (
                            <span
                              key={`${p.propertyId}:phone:${phone}`}
                              className="rounded-full border border-urus-success/30 bg-urus-success/10 px-2 py-0.5 text-xs font-semibold text-urus-success"
                            >
                              {phone}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Sin teléfono
                          </span>
                        )}
                      </div>
                      {p.description ? (
                        <p className="mt-4 pt-4 border-t border-slate-100 line-clamp-3 text-xs text-slate-500 font-medium">
                          {p.description}
                        </p>
                      ) : null}
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
                      <PropertyDescriptionEditor
                        propertyId={p.propertyId}
                        initialDescription={p.description}
                        validationToken={validationToken}
                        demoMode={demoMode}
                      />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-12 bg-white border border-slate-200 shadow-md shadow-slate-200/50 rounded-2xl p-6 md:p-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                Decisión comercial
              </h2>
              <ValidarAcciones
                validationToken={validationToken}
                demoMode={demoMode}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
