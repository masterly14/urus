"use client";

import { useState, useCallback } from "react";

type ImageCarouselProps = {
  images: string[];
  alt: string;
};

export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const count = images.length;

  const prev = useCallback(() => {
    setCurrent((c) => (c === 0 ? count - 1 : c - 1));
  }, [count]);

  const next = useCallback(() => {
    setCurrent((c) => (c === count - 1 ? 0 : c + 1));
  }, [count]);

  if (count === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl bg-neutral-900 text-sm text-neutral-500">
        Sin imágenes disponibles
      </div>
    );
  }

  const carousel = (
    <div className="relative">
      <div
        className={
          fullscreen
            ? "flex h-[80vh] items-center justify-center bg-black"
            : "aspect-[16/9] w-full overflow-hidden rounded-2xl bg-neutral-900"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[current]}
          alt={`${alt} — ${current + 1}/${count}`}
          className={
            fullscreen
              ? "max-h-full max-w-full object-contain"
              : "h-full w-full object-cover"
          }
        />
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
            aria-label="Anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
            aria-label="Siguiente"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </>
      ) : null}

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
        <span>{current + 1} / {count}</span>
        {!fullscreen ? (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="ml-1 rounded p-0.5 hover:bg-white/20"
            aria-label="Pantalla completa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!fullscreen) {
    return (
      <div>
        {carousel}
        {count > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === current
                    ? "border-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Miniatura ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-label="Galería de imágenes"
    >
      <div className="flex items-center justify-end p-4">
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1">{carousel}</div>
      <div className="flex gap-2 overflow-x-auto p-4">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            className={`h-14 w-[72px] flex-shrink-0 overflow-hidden rounded-md border-2 transition ${
              i === current
                ? "border-white"
                : "border-transparent opacity-50 hover:opacity-100"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Miniatura ${i + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
