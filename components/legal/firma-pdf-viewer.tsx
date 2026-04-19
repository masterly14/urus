"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type FirmaPdfViewerProps = {
  pdfSrc: string;
};

export function FirmaPdfViewer({ pdfSrc }: FirmaPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      const fallback =
        typeof window !== "undefined" ? Math.min(window.innerWidth - 32, 920) : 600;
      setPageWidth(Math.max(280, Math.floor((w > 0 ? w : fallback) - 16)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-y-auto bg-slate-100/50"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 sm:gap-6 px-3 sm:px-4 py-4 sm:py-8">
        {loadError ? (
          <div className="rounded-lg bg-red-50 p-4 border border-red-100 text-center">
            <p className="text-sm font-medium text-red-600">{loadError}</p>
          </div>
        ) : (
          <Document
            file={pdfSrc}
            loading={
              <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                <span className="text-base font-medium">Cargando documento…</span>
              </div>
            }
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setLoadError(null);
            }}
            onLoadError={(err) => {
              setLoadError(err?.message ?? "No se pudo cargar el PDF");
              setNumPages(0);
            }}
          >
            {numPages > 0 &&
              pageWidth > 0 &&
              Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i + 1}
                  className="shadow-md ring-1 ring-slate-200/60 bg-white rounded-sm overflow-hidden mb-6"
                >
                  <Page
                    pageNumber={i + 1}
                    width={pageWidth}
                    renderTextLayer
                    renderAnnotationLayer
                  />
                </div>
              ))}
          </Document>
        )}
      </div>
    </div>
  );
}
