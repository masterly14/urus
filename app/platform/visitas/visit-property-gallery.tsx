"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageOff, Loader2, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GalleryCacheEntry = {
  imageUrls: string[];
  fetchedAt: number;
};

const GALLERY_CACHE_TTL_MS = 10 * 60 * 1000;
const galleryCache = new Map<string, GalleryCacheEntry>();
const inFlightRequests = new Map<string, Promise<string[]>>();

type VisitPropertyGalleryProps = {
  propertyId: string;
  propertySource: string;
  selectionId: string | null;
  className?: string;
};

function buildCacheKey(input: {
  propertyId: string;
  propertySource: string;
  selectionId: string | null;
}): string {
  return `${input.propertyId}::${input.propertySource}::${input.selectionId ?? "-"}`;
}

function readCachedGallery(cacheKey: string): string[] | null {
  const entry = galleryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > GALLERY_CACHE_TTL_MS) {
    galleryCache.delete(cacheKey);
    return null;
  }
  return entry.imageUrls;
}

export function VisitPropertyGallery({
  propertyId,
  propertySource,
  selectionId,
  className,
}: VisitPropertyGalleryProps) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const cacheKey = buildCacheKey({ propertyId, propertySource, selectionId });
    const cached = readCachedGallery(cacheKey);
    if (cached) {
      setImageUrls(cached);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    const params = new URLSearchParams({ source: propertySource });
    if (selectionId) params.set("selectionId", selectionId);

    const requestUrl = `/api/visitas/properties/${encodeURIComponent(propertyId)}/gallery?${params.toString()}`;
    const pendingRequest =
      inFlightRequests.get(cacheKey) ??
      fetch(requestUrl, { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as {
            ok?: boolean;
            imageUrls?: string[];
            error?: string;
          };
          if (!response.ok || !data.ok) {
            throw new Error(data.error ?? "No se pudo cargar la galería");
          }
          const resolvedUrls = data.imageUrls ?? [];
          galleryCache.set(cacheKey, {
            imageUrls: resolvedUrls,
            fetchedAt: Date.now(),
          });
          return resolvedUrls;
        })
        .finally(() => {
          inFlightRequests.delete(cacheKey);
        });
    inFlightRequests.set(cacheKey, pendingRequest);

    void pendingRequest
      .then((urls) => {
        if (cancelled) return;
        setImageUrls(urls);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error cargando galería");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, propertySource, selectionId]);

  useEffect(() => {
    if (!lightboxOpen || imageUrls.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setLightboxIndex((i) => (i + 1) % imageUrls.length);
      } else if (event.key === "ArrowLeft") {
        setLightboxIndex((i) => (i - 1 + imageUrls.length) % imageUrls.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, imageUrls.length]);

  if (loading) {
    return (
      <div className={cn("flex h-32 items-center justify-center rounded-lg bg-muted/20", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{error}</p>
    );
  }

  if (imageUrls.length === 0) {
    return (
      <div className={cn("flex h-32 items-center justify-center gap-2 rounded-lg bg-muted/20 text-sm text-muted-foreground", className)}>
        <ImageOff className="h-4 w-4" />
        Sin fotos disponibles
      </div>
    );
  }

  return (
    <>
      <div className={cn("space-y-2", className)}>
        <p className="text-sm font-medium">Galería de la propiedad</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {imageUrls.slice(0, 9).map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => openLightbox(idx)}
              className="group relative block h-28 overflow-hidden rounded-lg border border-border/40 bg-muted shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              title="Ver foto a tamaño grande"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Foto ${idx + 1}`}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="h-5 w-5" />
              </span>
            </button>
          ))}
          {imageUrls.length > 9 ? (
            <button
              type="button"
              onClick={() => openLightbox(9)}
              className="flex h-28 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground hover:bg-muted/70"
            >
              +{imageUrls.length - 9} fotos
            </button>
          ) : null}
        </div>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl gap-4 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Visor de fotos</DialogTitle>
          </DialogHeader>
          {imageUrls.length > 0 ? (
            <div className="relative flex min-h-[280px] items-center justify-center rounded-lg bg-muted/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrls[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[70vh] w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          {imageUrls.length > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLightboxIndex(
                    (i) => (i - 1 + imageUrls.length) % imageUrls.length,
                  )
                }
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {lightboxIndex + 1} / {imageUrls.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLightboxIndex((i) => (i + 1) % imageUrls.length)
                }
              >
                Siguiente
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
