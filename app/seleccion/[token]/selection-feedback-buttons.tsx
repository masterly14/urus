"use client";

import { useState } from "react";

type SelectionDecision = "ME_INTERESA" | "NO_ME_ENCAJA";

type SelectionFeedbackButtonsProps = {
  publicToken: string;
  propertyId: string;
  /** Vista demo: no llama al API; solo estado local. */
  demoMode?: boolean;
};

export function SelectionFeedbackButtons({
  publicToken,
  propertyId,
  demoMode = false,
}: SelectionFeedbackButtonsProps) {
  const [saving, setSaving] = useState<SelectionDecision | null>(null);
  const [selected, setSelected] = useState<SelectionDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendDecision = async (decision: SelectionDecision) => {
    if (saving) return;
    setSaving(decision);
    setError(null);

    if (demoMode) {
      setSelected(decision);
      setSaving(null);
      return;
    }

    try {
      const response = await fetch(`/api/seleccion/${publicToken}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, decision }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSelected(decision);
    } catch {
      setError("No se pudo guardar tu selección. Inténtalo de nuevo.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => sendDecision("ME_INTERESA")}
          disabled={Boolean(saving)}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            selected === "ME_INTERESA"
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
              : "border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 disabled:opacity-60"
          }`}
        >
          Me interesa
        </button>
        <button
          type="button"
          onClick={() => sendDecision("NO_ME_ENCAJA")}
          disabled={Boolean(saving)}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            selected === "NO_ME_ENCAJA"
              ? "border-rose-400 bg-rose-500/20 text-rose-200"
              : "border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 disabled:opacity-60"
          }`}
        >
          No me encaja
        </button>
      </div>

      {selected ? (
        <div className="text-xs text-neutral-400">
          {demoMode ? "Vista demo: " : "Selección guardada: "}
          {selected === "ME_INTERESA" ? "Me interesa" : "No me encaja"}
          {demoMode ? " (no se persiste)." : "."}
        </div>
      ) : null}
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
