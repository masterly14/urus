"use client";

import { useEffect, useMemo, useState } from "react";

const defaultPhases = [
  "Inicializando análisis de mercado",
  "Indexando propiedad de referencia",
  "Construyendo comparables de la zona",
  "Evaluando variables del entorno",
  "Consolidando resultados del modelo",
  "El análisis continúa en segundo plano",
];

interface HouseLoaderVisualProps {
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  phases?: string[];
  animatePhases?: boolean;
  houseOnly?: boolean;
  className?: string;
}

export function HouseLoaderVisual({
  title,
  subtitle,
  badgeLabel = "Background job",
  phases = defaultPhases,
  animatePhases = true,
  houseOnly = false,
  className,
}: HouseLoaderVisualProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const phase = useMemo(() => phases[phaseIndex] ?? phases[0] ?? "", [phaseIndex, phases]);

  useEffect(() => {
    if (!animatePhases || phases.length <= 1) return;
    const interval = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, [animatePhases, phases.length]);

  return (
    <div
      className={[
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#161e3b] via-[#1f2a4d] to-[#2a3660] text-[#f4efe6]",
        className ?? "",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgba(201,177,124,0.14),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,rgba(201,177,124,0.12),transparent_45%)]" />

      <div
        className={[
          "relative z-10 flex w-full max-w-2xl items-center justify-center p-8",
          houseOnly ? "" : "flex-col space-y-12",
        ].join(" ")}
      >
        <div className="relative flex h-64 w-full items-center justify-center">
          <div className="absolute h-56 w-56 animate-spin rounded-full border border-dashed border-[#c9b17c]/30 [animation-duration:28s]" />
          <div className="absolute h-40 w-40 animate-spin rounded-full border border-[#c9b17c]/20 [animation-direction:reverse] [animation-duration:18s]" />
          <div className="absolute h-32 w-32 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(201,177,124,0.25),transparent_70%)] blur-md [animation-duration:3.2s]" />

          <svg
            viewBox="0 0 160 155"
            width="148"
            height="143"
            className="relative z-10 drop-shadow-[0_6px_24px_rgba(201,177,124,0.2)]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[5] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 80 8 L 8 68 L 152 68 Z"
            />
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[5] [animation-delay:0.08s] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 22 68 L 22 142 L 138 142 L 138 68"
            />
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[4] [animation-delay:0.08s] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 108 32 L 108 14 L 124 14 L 124 42"
            />
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[4] [animation-delay:0.16s] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 64 142 L 64 108 Q 80 94 96 108 L 96 142"
            />
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[4] [animation-delay:0.24s] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 32 82 L 56 82 L 56 106 L 32 106 Z M 32 94 L 56 94 M 44 82 L 44 106"
            />
            <path
              className="animate-[drawPath_3.8s_ease-in-out_infinite] fill-none stroke-[#c9b17c] stroke-[4] [animation-delay:0.32s] [stroke-dasharray:900] [stroke-dashoffset:900] [stroke-linecap:round] [stroke-linejoin:round]"
              d="M 104 82 L 128 82 L 128 106 L 104 106 Z M 104 94 L 128 94 M 116 82 L 116 106"
            />
          </svg>
        </div>

        {!houseOnly ? (
          <>
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#e2c892]">
                Urus Capital Group
              </p>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#c9b17c]/30 bg-[#c9b17c]/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[#b8c0de]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9b17c] shadow-[0_0_10px_rgba(201,177,124,0.8)]" />
                {badgeLabel}
              </span>
            </div>

            <div className="space-y-3 text-center">
              <h2 className="text-2xl font-semibold tracking-wide">{title}</h2>
              {phase ? (
                <p className="text-xs uppercase tracking-[0.14em] text-[#9ea8ca] transition-opacity duration-300">
                  {phase}
                </p>
              ) : null}
              {subtitle ? <p className="text-sm text-[#d2d8ec]">{subtitle}</p> : null}
            </div>

            <div className="w-full max-w-md space-y-4">
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-[#c9b17c]/10">
                <div className="h-full w-1/3 animate-[slide_2.3s_cubic-bezier(0.6,0.2,0.2,1)_infinite] rounded-full bg-gradient-to-r from-transparent via-[#c9b17c] to-transparent" />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <style jsx>{`
        @keyframes slide {
          0% {
            transform: translateX(-160%);
          }
          100% {
            transform: translateX(360%);
          }
        }
        @keyframes drawPath {
          0% {
            stroke-dashoffset: 900;
            opacity: 0.35;
          }
          30% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
          65% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
          100% {
            stroke-dashoffset: -900;
            opacity: 0.35;
          }
        }
      `}</style>
    </div>
  );
}
