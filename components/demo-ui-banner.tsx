type DemoUiBannerProps = {
  /** Ruta completa mostrada al usuario, ej. `/agenda/demo`. */
  demoPath: string;
};

export function DemoUiBanner({ demoPath }: DemoUiBannerProps) {
  return (
    <div className="border-b border-amber-500/40 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-100">
      <strong>Vista demo</strong> — datos ficticios para diseño. URL:{" "}
      <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-xs">
        {demoPath}
      </code>
      . En producción activar{" "}
      <code className="font-mono text-xs">NEXT_PUBLIC_MICROSITE_MOCK=true</code> si hace falta.
    </div>
  );
}
