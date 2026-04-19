"use client";

import { useEffect, useState } from "react";

type StaticMapImageProps = {
  latitude: number;
  longitude: number;
  address: string | null;
  zone: string | null;
  city: string | null;
  apiKey: string;
};

export function StaticMapImage({
  latitude,
  longitude,
  address,
  zone,
  city,
  apiKey,
}: StaticMapImageProps) {
  const [failed, setFailed] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const locationLabel = address ?? zone ?? city ?? "ubicación";
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=800x400&scale=2&maptype=roadmap&markers=color:red%7C${latitude},${longitude}&key=${apiKey}`;

  useEffect(() => {
    if (!apiKey) {
      console.warn(
        "[StaticMapImage] NEXT_PUBLIC_GOOGLE_MAPS_KEY is empty — map will not render"
      );
      setErrorDetail("API key no configurada (NEXT_PUBLIC_GOOGLE_MAPS_KEY)");
      setFailed(true);
      return;
    }
    console.log(
      "[StaticMapImage] Rendering map",
      { latitude, longitude, apiKeyPrefix: apiKey.slice(0, 8) + "..." }
    );
  }, [apiKey, latitude, longitude]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span className="text-sm font-medium">{locationLabel}</span>
        <span className="text-xs text-slate-300">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        {errorDetail ? (
          <span className="text-xs text-red-400 mt-1">{errorDetail}</span>
        ) : null}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Mapa de ${locationLabel}`}
      className="w-full h-auto object-cover"
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        console.error(
          "[StaticMapImage] Image failed to load",
          { src: img.src, naturalWidth: img.naturalWidth, latitude, longitude }
        );
        setErrorDetail("Error cargando mapa de Google Maps");
        setFailed(true);
      }}
    />
  );
}
