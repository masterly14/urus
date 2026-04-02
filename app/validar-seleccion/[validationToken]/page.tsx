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
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {demoMode ? <DemoUiBanner demoPath="/validar-seleccion/demo" /> : null}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="text-sm text-neutral-400">Urus Capital — Validación comercial</div>
          <h1 className="mt-2 text-2xl font-semibold">Revisar selección de mercado</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Demanda{" "}
            <span className="font-mono text-neutral-100">{selection.demandId}</span>
            {selection.demandNombre ? (
              <>
                {" "}
                · {selection.demandNombre}
              </>
            ) : null}
          </p>
          {due ? (
            <p className="mt-2 text-xs text-amber-200/90">
              SLA validación: antes del{" "}
              {new Intl.DateTimeFormat("es-ES", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(due)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-neutral-500">
            Creado{" "}
            {new Intl.DateTimeFormat("es-ES", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(selection.createdAt)}
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8">
        {!pending ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-6 text-neutral-300">
            Estado actual: <strong className="text-neutral-100">{selection.status}</strong>
            . Esta selección ya fue procesada.
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-neutral-400">
              Revisa las fichas (30–60 s). Si apruebas, el comprador recibirá el enlace público por
              WhatsApp.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {properties.map((p) => {
                const hero = p.images[0] ?? null;
                return (
                  <article
                    key={p.propertyId}
                    className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40"
                  >
                    <div className="aspect-[4/3] bg-neutral-900">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hero}
                          alt={p.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-600">
                          Sin imagen
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="text-xs text-neutral-500">
                        {p.city ?? ""}
                        {p.zone ? ` · ${p.zone}` : ""}
                      </div>
                      <h2 className="mt-1 line-clamp-2 text-sm font-semibold">{p.title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-200">
                        <span className="font-semibold">{formatPrice(p.price)}</span>
                        {typeof p.metersBuilt === "number" ? (
                          <span className="text-neutral-400">{p.metersBuilt} m²</span>
                        ) : null}
                        {typeof p.rooms === "number" ? (
                          <span className="text-neutral-400">{p.rooms} hab</span>
                        ) : null}
                        {typeof p.baths === "number" ? (
                          <span className="text-neutral-400">{p.baths} baños</span>
                        ) : null}
                      </div>
                      {p.description ? (
                        <p className="mt-2 line-clamp-2 text-xs text-neutral-500">
                          {p.description}
                        </p>
                      ) : null}
                      {p.extras.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.extras.slice(0, 4).map((extra) => (
                            <span
                              key={`${p.propertyId}:${extra}`}
                              className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400"
                            >
                              {extra}
                            </span>
                          ))}
                          {p.extras.length > 4 ? (
                            <span className="text-[9px] text-neutral-600">
                              +{p.extras.length - 4}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-10 border-t border-neutral-800 pt-8">
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
