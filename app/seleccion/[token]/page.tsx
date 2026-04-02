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
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {demoMode ? <DemoUiBanner demoPath="/seleccion/demo" /> : null}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="text-sm text-neutral-400">Urus Capital Group</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Selección de propiedades
          </h1>
          {selection.demandNombre ? (
            <div className="mt-2 text-sm text-neutral-300">
              Preparada para{" "}
              <span className="text-neutral-200">{selection.demandNombre}</span>
            </div>
          ) : null}
          <div className="mt-1 text-xs text-neutral-500">
            {new Intl.DateTimeFormat("es-ES", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(selection.createdAt)}
            {" · "}
            {properties.length} {properties.length === 1 ? "propiedad" : "propiedades"}
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
              const detailHref = `/seleccion/${token}/propiedad/${p.propertyId}`;
              return (
                <Link
                  key={p.propertyId}
                  href={detailHref}
                  className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/30 transition hover:border-neutral-600 hover:bg-neutral-900/50"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-neutral-900">
                    {hero ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={hero}
                        alt={p.title}
                        className="h-full w-full object-cover transition group-hover:scale-105"
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
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold group-hover:text-white">
                      {p.title}
                    </h2>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-200">
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

                    {p.extras.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.extras.slice(0, 4).map((extra) => (
                          <span
                            key={`${p.propertyId}:${extra}`}
                            className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400"
                          >
                            {extra}
                          </span>
                        ))}
                        {p.extras.length > 4 ? (
                          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500">
                            +{p.extras.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 text-xs font-medium text-neutral-500 group-hover:text-neutral-300">
                      Ver ficha completa &rarr;
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-600">
        Urus Capital Group
      </footer>
    </main>
  );
}

