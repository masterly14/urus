"use client";

import { useMemo, useState } from "react";

type Props = {
  propertyId: string;
  initialDescription: string | null;
  validationToken: string;
  demoMode?: boolean;
};

export function PropertyDescriptionEditor({
  propertyId,
  initialDescription,
  validationToken,
  demoMode = false,
}: Props) {
  const initialValue = useMemo(() => initialDescription ?? "", [initialDescription]);
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = value !== savedValue;

  const submit = async () => {
    if (saving || generating || !changed) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    if (demoMode) {
      setMessage("Vista demo: la descripción no se persiste.");
      setSavedValue(value);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/validar-seleccion/${validationToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ propertyId, description: value }],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSavedValue(value);
      setMessage("Descripción guardada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la descripción");
    } finally {
      setSaving(false);
    }
  };

  const generateWithAi = async () => {
    if (saving || generating) return;
    setGenerating(true);
    setError(null);
    setMessage(null);

    if (demoMode) {
      setValue(
        "Vista demo: descripción generada por IA. Revisa el texto, ajústalo a tu estilo comercial y guarda para persistir en producción.",
      );
      setMessage("Texto IA demo generado. Puedes editarlo y guardar.");
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch(`/api/validar-seleccion/${validationToken}/generate-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setValue(data.description ?? "");
      setMessage("Texto IA generado. Revísalo y pulsa Guardar descripción.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar descripción con IA");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <label
        htmlFor={`desc-${propertyId}`}
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        Descripción editable para comprador
      </label>
      <textarea
        id={`desc-${propertyId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        placeholder="Añade una descripción para el comprador"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          {value.trim().length} caracteres
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateWithAi}
            disabled={saving || generating}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:opacity-50"
          >
            {generating ? "Generando..." : "Generar con IA"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!changed || saving || generating}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar descripción"}
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 rounded-md border border-urus-success/20 bg-urus-success/10 px-2.5 py-1.5 text-xs font-medium text-urus-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-md border border-urus-danger/20 bg-urus-danger-bg px-2.5 py-1.5 text-xs font-medium text-urus-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
