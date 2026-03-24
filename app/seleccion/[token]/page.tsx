import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { DemoUiBanner } from "@/components/demo-ui-banner";
import {
  getMicrositeMockSelection,
  isMicrositeMockEnabled,
  isMicrositeMockToken,
} from "@/lib/microsite/mock-selection";
import { SelectionFeedbackButtons } from "./selection-feedback-buttons";

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
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {demoMode ? <DemoUiBanner demoPath="/seleccion/demo" /> : null}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="text-sm text-neutral-400">Urus Capital Group</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Selección de propiedades
          </h1>
          <div className="mt-2 text-sm text-neutral-300">
            Demanda <span className="font-mono text-neutral-200">{selection.demandId}</span>
            {selection.demandNombre ? (
              <>
                {" "}
                · <span className="text-neutral-200">{selection.demandNombre}</span>
              </>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Generado el{" "}
            {new Intl.DateTimeFormat("es-ES", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(selection.createdAt)}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10">
        {properties.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
            <div className="text-lg font-medium">Sin propiedades para mostrar</div>
            <div className="mt-2 text-sm text-neutral-400">
              Esta selección se generó sin resultados renderizables.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const hero = p.images[0] ?? null;
              return (
                <article
                  key={p.propertyId}
                  className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/30"
                >
                  <div className="aspect-[4/3] w-full bg-neutral-900">
                    {hero ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={hero}
                        alt={p.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                        Sin imagen
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="text-xs text-neutral-400">
                      {p.city ?? "Ciudad N/D"}
                      {p.zone ? ` · ${p.zone}` : ""}
                    </div>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold">
                      {p.title}
                    </h2>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-200">
                      <div className="font-semibold">{formatPrice(p.price)}</div>
                      {typeof p.metersBuilt === "number" ? (
                        <div className="text-neutral-400">{p.metersBuilt} m²</div>
                      ) : null}
                      {typeof p.rooms === "number" ? (
                        <div className="text-neutral-400">{p.rooms} hab</div>
                      ) : null}
                      {typeof p.baths === "number" ? (
                        <div className="text-neutral-400">{p.baths} baños</div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-neutral-500">
                        {p.advertiserType === "private"
                          ? "Particular"
                          : p.advertiserType === "professional"
                            ? "Profesional"
                            : "Anunciante N/D"}
                      </div>
                      {p.link ? (
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-white"
                        >
                          Ver anuncio
                        </a>
                      ) : (
                        <span className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-500">
                          Sin enlace
                        </span>
                      )}
                    </div>

                    {p.extras.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.extras.map((extra) => (
                          <span
                            key={`${p.propertyId}:${extra}`}
                            className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300"
                          >
                            {extra}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <SelectionFeedbackButtons
                        publicToken={selection.token}
                        propertyId={p.propertyId}
                        demoMode={demoMode}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

