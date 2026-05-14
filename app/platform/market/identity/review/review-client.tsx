"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReviewListingMini {
  id: string;
  source: string;
  externalId: string;
  canonicalUrl: string;
  city: string;
  zone: string | null;
  addressApprox: string | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  price: number | null;
  pricePerMeter: number | null;
  mainImageUrl: string | null;
  advertiserDisplayName: string | null;
  advertiserType: string | null;
  propertyId: string | null;
  qualityScore: number;
  lastSeenAt: string;
}

interface ReviewCandidate {
  eventId: string;
  score: number | null;
  origin: ReviewListingMini;
  bestCandidate: ReviewListingMini | null;
  otherCandidates: ReviewListingMini[];
  emittedAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPpm(value: number | null): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("es-ES").format(value)} €/m²`;
}

function ListingCard({
  listing,
  badge,
}: {
  listing: ReviewListingMini;
  badge: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <Badge variant="outline">{badge}</Badge>
        <Badge variant="secondary">{SOURCE_LABEL[listing.source] ?? listing.source}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {listing.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.mainImageUrl}
            alt={`Listing ${listing.externalId}`}
            className="h-32 w-full rounded object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
            sin foto
          </div>
        )}
        <div className="font-medium">
          {listing.addressApprox ?? listing.zone ?? listing.city}
        </div>
        <div className="text-muted-foreground">
          {listing.city}
          {listing.zone ? ` · ${listing.zone}` : ""}
        </div>
        <div className="text-muted-foreground">
          {listing.builtArea ?? "—"} m² · {listing.rooms ?? "—"} hab ·{" "}
          {listing.bathrooms ?? "—"} baños
          {listing.floor ? ` · planta ${listing.floor}` : ""}
        </div>
        <div className="font-medium">
          {formatPrice(listing.price)} · {formatPpm(listing.pricePerMeter)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          quality {listing.qualityScore.toFixed(2)} · cluster{" "}
          {listing.propertyId ? `${listing.propertyId.slice(0, 8)}…` : "no"}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {listing.advertiserDisplayName ?? "—"} ({listing.advertiserType ?? "—"})
        </div>
        <a
          href={listing.canonicalUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {listing.canonicalUrl}
        </a>
      </CardContent>
    </Card>
  );
}

export function ReviewClient({
  initialItems,
  initialPending,
}: {
  initialItems: ReviewCandidate[];
  initialPending: number;
}) {
  const [items, setItems] = useState<ReviewCandidate[]>(initialItems);
  const [pending, setPending] = useState<number>(initialPending);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const current = useMemo(() => items[index] ?? null, [items, index]);

  const advance = useCallback(() => {
    setIndex((prev) => prev + 1);
    setFeedback(null);
    setError(null);
  }, []);

  const refetch = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/market/identity/candidates?limit=50", {
        cache: "no-store",
      });
      const body = (await response.json()) as
        | { ok: true; items: ReviewCandidate[]; totalPending: number }
        | { ok: false; error?: { message?: string } };
      if (!response.ok || !("ok" in body) || !body.ok) {
        const msg =
          "error" in body && body.error?.message
            ? body.error.message
            : `HTTP ${response.status}`;
        setError(msg);
        return;
      }
      setItems(body.items);
      setPending(body.totalPending);
      setIndex(0);
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = useCallback(
    async (action: "merge" | "split" | "ignore") => {
      if (!current || busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/market/identity/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: current.eventId,
            action,
            ...(action === "merge" && current.bestCandidate
              ? { targetListingId: current.bestCandidate.id }
              : {}),
          }),
        });
        const body = (await response.json()) as
          | { ok: true; action: string }
          | { ok: false; error?: { message?: string } };
        if (!response.ok || !("ok" in body) || !body.ok) {
          const msg =
            "error" in body && body.error?.message
              ? body.error.message
              : `HTTP ${response.status}`;
          setError(msg);
          return;
        }
        setFeedback(
          action === "merge"
            ? "Fundido"
            : action === "split"
              ? "Marcado como distintos"
              : "Ignorado",
        );
        setPending((p) => Math.max(0, p - 1));
        advance();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [current, busy, advance],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLTextAreaElement) return;
      const k = event.key.toLowerCase();
      if (k === "m") void submit("merge");
      else if (k === "d") void submit("split");
      else if (k === "i") void submit("ignore");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  if (!current) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center text-sm text-muted-foreground">
          {pending === 0
            ? "No hay candidatos pendientes de revision."
            : `Procesados ${items.length}. Pendientes adicionales: ${Math.max(
                0,
                pending - items.length,
              )}.`}
          <div>
            <Button onClick={() => void refetch()} disabled={busy}>
              {busy ? "Recargando…" : "Recargar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Item {index + 1} de {items.length} · {pending} pendientes en total
        </span>
        <span className="font-medium">
          Score sugerido:{" "}
          {current.score != null
            ? (current.score * 100).toFixed(1) + "%"
            : "—"}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ListingCard listing={current.origin} badge="Origen" />
        {current.bestCandidate ? (
          <ListingCard listing={current.bestCandidate} badge="Candidato" />
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Sin candidato (probablemente eliminado o purgado).
            </CardContent>
          </Card>
        )}
      </div>

      {current.otherCandidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Otros candidatos ({current.otherCandidates.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {current.otherCandidates.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                badge="Alternativa"
              />
            ))}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-3 text-xs text-destructive">{error}</CardContent>
        </Card>
      )}
      {feedback && (
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground">
            {feedback}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="default"
          disabled={busy || !current.bestCandidate}
          onClick={() => void submit("merge")}
        >
          Mismo inmueble (M)
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void submit("split")}
        >
          Distintos (D)
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void submit("ignore")}
        >
          Ignorar (I)
        </Button>
      </div>
    </div>
  );
}
