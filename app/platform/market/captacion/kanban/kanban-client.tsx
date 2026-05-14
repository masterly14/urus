"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CaptacionStage =
  | "NEW"
  | "PROSPECT_CREATING"
  | "PROSPECT_CREATED"
  | "ENCARGO_ATTACHED"
  | "READY_FOR_PROPERTY"
  | "PROPERTY_CREATING"
  | "PROPERTY_CREATED"
  | "FAILED";

export interface KanbanCard {
  id: string;
  propertyId: string | null;
  source: string;
  externalId: string;
  canonicalUrl: string;
  addressApprox: string | null;
  city: string;
  zone: string | null;
  price: number | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  mainImageUrl: string | null;
  stage: CaptacionStage;
  captacionFailureReason: string | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  assignedComercialId: string | null;
  assignedComercialNombre: string | null;
  lastSeenAt: string;
}

export interface ComercialOption {
  id: string;
  nombre: string;
}

const SOURCE_LABEL: Record<string, string> = {
  source_a: "Fotocasa",
  source_b: "Pisos.com",
  source_c: "Milanuncios",
  source_d: "Idealista",
};

const STAGE_LABEL: Record<CaptacionStage, string> = {
  NEW: "Nuevos",
  PROSPECT_CREATING: "Creando prospecto",
  PROSPECT_CREATED: "Prospecto creado",
  ENCARGO_ATTACHED: "Con nota de encargo",
  READY_FOR_PROPERTY: "Listo para alta",
  PROPERTY_CREATING: "Dando alta",
  PROPERTY_CREATED: "Propiedad activa",
  FAILED: "Descartado",
};

const INTERMEDIATE_STAGES = new Set<CaptacionStage>([
  "PROSPECT_CREATED",
  "ENCARGO_ATTACHED",
  "READY_FOR_PROPERTY",
]);

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function isLegalManualTransition(
  from: CaptacionStage,
  to: CaptacionStage,
): "legal" | "redirect" | "illegal" {
  if (from === to) return "legal";
  if (to === "FAILED") return "legal";
  if (from === "FAILED" && to === "NEW") return "legal";
  if (INTERMEDIATE_STAGES.has(from) && INTERMEDIATE_STAGES.has(to)) {
    return "legal";
  }
  // Mover a stages "*_CREATING" o "PROPERTY_CREATED" desde el kanban no se
  // permite: requiere disparar el workflow (modal de prospecto/alta) en
  // /platform/captacion/oportunidades. Lo redirigimos.
  if (
    to === "PROSPECT_CREATING" ||
    to === "PROPERTY_CREATING" ||
    to === "PROSPECT_CREATED" ||
    to === "PROPERTY_CREATED" ||
    to === "ENCARGO_ATTACHED" ||
    to === "READY_FOR_PROPERTY"
  ) {
    return "redirect";
  }
  return "illegal";
}

export function KanbanClient({
  initialCards,
  stages,
  comerciales,
  selectedComercial,
  selectedSource,
  canAssignAny,
}: {
  initialCards: KanbanCard[];
  stages: CaptacionStage[];
  comerciales: ComercialOption[];
  selectedComercial: string;
  selectedSource: string;
  canAssignAny: boolean;
}) {
  const [cards, setCards] = useState<KanbanCard[]>(initialCards);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    cardId: string;
    targetStage: CaptacionStage;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const cardsByStage = useMemo(() => {
    const map = new Map<CaptacionStage, KanbanCard[]>();
    for (const stage of stages) map.set(stage, []);
    for (const card of cards) {
      const list = map.get(card.stage);
      if (list) list.push(card);
    }
    return map;
  }, [cards, stages]);

  const updateStageLocally = useCallback(
    (cardId: string, nextStage: CaptacionStage, reason: string | null) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? {
                ...c,
                stage: nextStage,
                captacionFailureReason:
                  nextStage === "FAILED"
                    ? reason
                    : nextStage === "NEW"
                      ? null
                      : c.captacionFailureReason,
                captacionUpdatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    },
    [],
  );

  const sendStageChange = useCallback(
    async (cardId: string, nextStage: CaptacionStage, reason?: string) => {
      setError(null);
      try {
        const response = await fetch(
          `/api/market/listings/${cardId}/captacion-stage`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: nextStage, reason }),
          },
        );
        const body = (await response.json()) as
          | { ok: true; stage: CaptacionStage }
          | { ok: false; error?: { message?: string } };
        if (!response.ok || !("ok" in body) || !body.ok) {
          const msg =
            "error" in body && body.error?.message
              ? body.error.message
              : `HTTP ${response.status}`;
          setError(msg);
          return false;
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [],
  );

  const handleDrop = useCallback(
    async (cardId: string, targetStage: CaptacionStage) => {
      setDraggingId(null);
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      if (card.stage === targetStage) return;
      const verdict = isLegalManualTransition(card.stage, targetStage);
      if (verdict === "illegal") {
        setError(`No se puede mover de ${STAGE_LABEL[card.stage]} a ${STAGE_LABEL[targetStage]}.`);
        return;
      }
      if (verdict === "redirect") {
        const target =
          targetStage === "PROSPECT_CREATING"
            ? "prospecto"
            : targetStage === "PROPERTY_CREATING"
              ? "alta"
              : "prospecto";
        // Llevamos al usuario a oportunidades para abrir el modal correspondiente.
        const propertyId = card.propertyId ?? `virtual:${card.id}`;
        router.push(
          `/platform/captacion/oportunidades?openListingId=${encodeURIComponent(card.id)}&action=${target}`,
        );
        // Como aviso visual, no hacemos cambio local: el modal externo es quien actualizara.
        setError(
          `Para avanzar a ${STAGE_LABEL[targetStage]} usa el modal en oportunidades. Ya te he llevado alli (cluster ${propertyId.slice(0, 8)}…).`,
        );
        return;
      }
      if (targetStage === "FAILED") {
        // Pedir razon antes de aplicar.
        setReasonModal({ cardId: card.id, targetStage });
        setReasonText("");
        return;
      }
      // Optimista.
      updateStageLocally(card.id, targetStage, null);
      const ok = await sendStageChange(card.id, targetStage);
      if (!ok) {
        // Revertir.
        updateStageLocally(card.id, card.stage, card.captacionFailureReason);
      }
    },
    [cards, sendStageChange, updateStageLocally, router],
  );

  const submitFailure = useCallback(async () => {
    if (!reasonModal) return;
    if (reasonText.trim().length === 0) return;
    const card = cards.find((c) => c.id === reasonModal.cardId);
    if (!card) return;
    setSubmitting(true);
    const ok = await sendStageChange(card.id, "FAILED", reasonText.trim());
    if (ok) {
      updateStageLocally(card.id, "FAILED", reasonText.trim());
      setReasonModal(null);
      setReasonText("");
    }
    setSubmitting(false);
  }, [reasonModal, reasonText, cards, sendStageChange, updateStageLocally]);

  function handleFilterChange(
    nextComercial: string,
    nextSource: string,
  ) {
    const sp = new URLSearchParams();
    sp.set("comercial", nextComercial);
    if (nextSource !== "all") sp.set("source", nextSource);
    router.push(`/platform/market/captacion/kanban?${sp.toString()}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">Comercial</Label>
        <select
          value={selectedComercial}
          onChange={(e) => handleFilterChange(e.target.value, selectedSource)}
          className="h-9 rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm shadow-sm dark:border-neutral-700/70"
        >
          {canAssignAny && <option value="all">Todos</option>}
          {comerciales.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <Label className="ml-3 text-xs">Portal</Label>
        <select
          value={selectedSource}
          onChange={(e) => handleFilterChange(selectedComercial, e.target.value)}
          className="h-9 rounded-md border border-neutral-300/60 bg-background/70 px-2 text-sm shadow-sm dark:border-neutral-700/70"
        >
          <option value="all">Todos</option>
          <option value="source_d">Idealista</option>
          <option value="source_a">Fotocasa</option>
          <option value="source_b">Pisos.com</option>
          <option value="source_c">Milanuncios</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {cards.length} oportunidades cargadas
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            cards={cardsByStage.get(stage) ?? []}
            onDragStart={setDraggingId}
            onDrop={handleDrop}
            draggingId={draggingId}
          />
        ))}
      </div>

      <Dialog open={reasonModal != null} onOpenChange={(open) => !open && setReasonModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo del descarte</DialogTitle>
            <DialogDescription>
              Indica por que descartas esta oportunidad. Quedara registrado en
              el listing.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Ej. Publicante no responde tras 3 llamadas. Fuera de zona objetivo."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonModal(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submitFailure()}
              disabled={submitting || reasonText.trim().length === 0}
            >
              {submitting ? "Guardando…" : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Column({
  stage,
  cards,
  onDragStart,
  onDrop,
  draggingId,
}: {
  stage: CaptacionStage;
  cards: KanbanCard[];
  onDragStart: (id: string | null) => void;
  onDrop: (cardId: string, stage: CaptacionStage) => void;
  draggingId: string | null;
}) {
  const isDestination = draggingId != null;
  return (
    <div
      onDragOver={(e) => {
        if (draggingId) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) onDrop(cardId, stage);
      }}
      className={`flex w-72 flex-shrink-0 flex-col rounded border bg-muted/40 p-2 ${
        isDestination
          ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1 py-1">
        <span className="text-sm font-semibold">{STAGE_LABEL[stage]}</span>
        <Badge variant="outline" className="text-xs">
          {cards.length}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {cards.map((card) => (
          <KanbanCardComponent
            key={card.id}
            card={card}
            onDragStart={() => onDragStart(card.id)}
            onDragEnd={() => onDragStart(null)}
          />
        ))}
        {cards.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
            Sin oportunidades aqui.
          </p>
        )}
      </div>
    </div>
  );
}

function KanbanCardComponent({
  card,
  onDragStart,
  onDragEnd,
}: {
  card: KanbanCard;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="rounded border border-neutral-200 bg-background p-2 text-xs shadow-sm transition-shadow hover:shadow-md dark:border-neutral-700"
    >
      {card.mainImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.mainImageUrl}
          alt={`Listing ${card.externalId}`}
          className="mb-2 h-24 w-full rounded object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="flex items-center justify-between gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {SOURCE_LABEL[card.source] ?? card.source}
        </Badge>
        <span className="font-medium">{formatPrice(card.price)}</span>
      </div>
      <div className="mt-1 truncate font-medium">
        {card.addressApprox ?? card.zone ?? card.city}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {card.builtArea ?? "—"} m² · {card.rooms ?? "—"} hab ·{" "}
        {card.bathrooms ?? "—"} baños
      </div>
      {card.assignedComercialNombre && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          → {card.assignedComercialNombre}
        </div>
      )}
      {card.captacionFailureReason && card.stage === "FAILED" && (
        <div className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {card.captacionFailureReason}
        </div>
      )}
      {card.captacionLastError && (
        <div className="mt-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
          {card.captacionLastError}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-1">
        <a
          href={`/platform/market/properties/${encodeURIComponent(card.propertyId ?? `virtual:${card.id}`)}`}
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Ficha
        </a>
        <a
          href={card.canonicalUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Portal
        </a>
      </div>
    </div>
  );
}
