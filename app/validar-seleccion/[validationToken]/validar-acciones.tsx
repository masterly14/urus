"use client";

import { useState } from "react";

type Props = {
  validationToken: string;
  /** Vista demo: no llama al API; solo mensaje local. */
  demoMode?: boolean;
};

export function ValidarAcciones({ validationToken, demoMode = false }: Props) {
  const [loading, setLoading] = useState<"APPROVE" | "REJECT" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: "APPROVE" | "REJECT") => {
    if (loading) return;
    setLoading(action);
    setError(null);
    setMessage(null);
    if (demoMode) {
      setMessage(
        action === "APPROVE"
          ? "Vista demo: aprobar no persiste. En producción se enviaría el enlace al comprador por WhatsApp."
          : "Vista demo: rechazar no persiste. En producción no se enviaría enlace al comprador.",
      );
      setLoading(null);
      return;
    }
    try {
      const res = await fetch(`/api/validar-seleccion/${validationToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; action?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setMessage(
        action === "APPROVE"
          ? "Aprobado. Se enviará el enlace al comprador por WhatsApp."
          : "Selección rechazada. No se enviará enlace al comprador.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={Boolean(loading) || Boolean(message)}
          onClick={() => submit("APPROVE")}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all"
        >
          {loading === "APPROVE" ? "Guardando…" : "Aprobar y enviar al comprador"}
        </button>
        <button
          type="button"
          disabled={Boolean(loading) || Boolean(message)}
          onClick={() => submit("REJECT")}
          className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
        >
          {loading === "REJECT" ? "Guardando…" : "Rechazar selección"}
        </button>
      </div>
      {message ? <p className="text-sm font-medium text-urus-success bg-urus-success/10 border border-urus-success/20 px-4 py-3 rounded-lg mt-4">{message}</p> : null}
      {error ? <p className="text-sm font-medium text-urus-danger bg-urus-danger/10 border border-urus-danger/20 px-4 py-3 rounded-lg mt-4">{error}</p> : null}
    </div>
  );
}
