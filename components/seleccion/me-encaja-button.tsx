"use client";

import { useState, useTransition } from "react";

export type MeEncajaButtonProps = {
  selectionToken: string;
  propertyId: string;
  propertyTitle: string;
  alreadyInterested: boolean;
  demoMode?: boolean;
  size?: "default" | "large";
};

type FeedbackState = "idle" | "submitting" | "recorded" | "error";

export function MeEncajaButton({
  selectionToken,
  propertyId,
  propertyTitle,
  alreadyInterested,
  demoMode = false,
  size = "default",
}: MeEncajaButtonProps) {
  const [state, setState] = useState<FeedbackState>(
    alreadyInterested ? "recorded" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isLocked = state === "recorded";
  const sizeClasses =
    size === "large"
      ? "px-4 py-3 text-base"
      : "px-3 py-2 text-sm";

  const handleClick = () => {
    if (isLocked || state === "submitting" || isPending) return;

    if (demoMode) {
      setState("recorded");
      setErrorMsg(null);
      return;
    }

    setState("submitting");
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/seleccion/${selectionToken}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            decision: "ME_INTERESA",
          }),
        });

        if (res.ok || res.status === 409) {
          setState("recorded");
          setErrorMsg(null);
          return;
        }

        setState("error");
        const text = await res.text().catch(() => "");
        setErrorMsg(
          text && text.length < 200
            ? text
            : "No pudimos registrar tu interés. Inténtalo de nuevo.",
        );
      } catch (err) {
        setState("error");
        setErrorMsg(
          err instanceof Error && err.message
            ? err.message
            : "No pudimos registrar tu interés. Inténtalo de nuevo.",
        );
      }
    });
  };

  if (isLocked) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700 ${sizeClasses}`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Ya elegida — un agente te contactará
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "submitting" || isPending}
        aria-busy={state === "submitting" || isPending}
        aria-label={`Me encaja: ${propertyTitle}`}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-wait disabled:opacity-70 ${sizeClasses}`}
      >
        {state === "submitting" || isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Registrando…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 21s-7.5-4.6-9.8-9.2C.6 8.2 2.4 4.5 6 4.5c1.9 0 3.6 1 4.5 2.4C11.4 5.5 13.1 4.5 15 4.5c3.6 0 5.4 3.7 3.8 7.3C19.5 16.4 12 21 12 21z" />
            </svg>
            Me encaja
          </>
        )}
      </button>
      {state === "error" && errorMsg ? (
        <div role="alert" className="text-xs font-medium text-red-600">
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}
