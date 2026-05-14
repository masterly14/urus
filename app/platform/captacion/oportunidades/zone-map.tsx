"use client";

/**
 * Mapa Leaflet con dibujo libre de poligono punto-a-punto.
 *
 * Se usa SOLO cuando el comercial decide explicitamente filtrar la lista
 * por una zona en concreto. Vive dentro de un Sheet lateral (no se monta
 * a menos que el comercial pulse "Filtrar por zona").
 *
 * UX:
 *  - Click en el mapa: anade un punto al poligono en construccion.
 *  - Boton "Cerrar area": cierra el poligono y dispara `onPolygonChange`.
 *    Solo habilitado con >=3 puntos.
 *  - Boton "Borrar ultimo": quita el ultimo punto.
 *  - Boton "Limpiar": resetea poligono completo y dispara
 *    `onPolygonChange(null)`.
 *  - Doble click: cierra el poligono (atajo).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { LngLat } from "./types";

const CORDOBA_CENTER: [number, number] = [37.88, -4.78];
const CORDOBA_ZOOM = 12;

interface ZoneMapProps {
  /** Poligono cerrado actual (cuando el usuario lo confirmo). null = no hay. */
  polygon: LngLat[] | null;
  onPolygonChange: (polygon: LngLat[] | null) => void;
  /** Pins opcionales para densidad visual. */
  markers?: LngLat[];
}

interface DraftPolygonState {
  points: LngLat[];
}

export function ZoneMap({ polygon, onPolygonChange, markers = [] }: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [draft, setDraft] = useState<DraftPolygonState>({ points: [] });
  const [mapError, setMapError] = useState<string | null>(null);

  const closePolygon = useCallback(() => {
    setDraft((prev) => {
      if (prev.points.length >= 3) {
        onPolygonChange(prev.points);
        return { points: [] };
      }
      return prev;
    });
  }, [onPolygonChange]);

  const undoLastPoint = useCallback(() => {
    setDraft((prev) => ({ points: prev.points.slice(0, -1) }));
  }, []);

  const clearAll = useCallback(() => {
    setDraft({ points: [] });
    onPolygonChange(null);
  }, [onPolygonChange]);

  const draftCount = draft.points.length;
  const canClose = draftCount >= 3;
  const hasPolygon = polygon != null && polygon.length >= 3;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = L.map(containerRef.current, {
        center: CORDOBA_CENTER,
        zoom: CORDOBA_ZOOM,
        doubleClickZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      draftLayerRef.current = L.layerGroup().addTo(map);
      polygonLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => {
        setDraft((prev) => ({
          points: [...prev.points, [e.latlng.lng, e.latlng.lat]],
        }));
      });
      map.on("dblclick", () => {
        setDraft((prev) => {
          if (prev.points.length >= 3) {
            onPolygonChange(prev.points);
            return { points: [] };
          }
          return prev;
        });
      });
      mapRef.current = map;
      // El Sheet anima la apertura; tras el primer paint hay que reinvalidar
      // tamano para que las tiles llenen el contenedor.
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 250);
      const onResize = () => map.invalidateSize();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        map.remove();
        mapRef.current = null;
        draftLayerRef.current = null;
        polygonLayerRef.current = null;
        markersLayerRef.current = null;
      };
    } catch (err) {
      setMapError(err instanceof Error ? err.message : String(err));
    }
  }, [onPolygonChange]);

  useEffect(() => {
    const layer = draftLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const [lng, lat] of draft.points) {
      L.circleMarker([lat, lng], {
        radius: 5,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1d4ed8",
        fillOpacity: 1,
      }).addTo(layer);
    }
    if (draft.points.length >= 2) {
      const linePoints = [
        ...draft.points,
        ...(draft.points.length >= 3 ? [draft.points[0]!] : []),
      ].map(([lng, lat]) => [lat, lng] as [number, number]);
      L.polyline(linePoints, {
        color: "#1d4ed8",
        weight: 2,
        dashArray: "6 6",
      }).addTo(layer);
    }
  }, [draft]);

  useEffect(() => {
    const layer = polygonLayerRef.current;
    const map = mapRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (polygon && polygon.length >= 3) {
      const points = polygon.map(([lng, lat]) => [lat, lng] as [number, number]);
      const poly = L.polygon(points, {
        color: "#1d4ed8",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.18,
      }).addTo(layer);
      if (map) {
        map.fitBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 15 });
      }
    }
  }, [polygon]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const [lng, lat] of markers) {
      L.circleMarker([lat, lng], {
        radius: 4,
        color: "#065f46",
        weight: 1,
        fillColor: "#10b981",
        fillOpacity: 0.85,
      }).addTo(layer);
    }
  }, [markers]);

  const status = useMemo(() => {
    if (hasPolygon && draftCount === 0) {
      return "Area aplicada. Pulsa Limpiar para volver a dibujar.";
    }
    if (draftCount === 0) return "Haz clic en el mapa para anadir puntos.";
    if (!canClose) return `Anade al menos ${3 - draftCount} punto(s) mas.`;
    return "Pulsa Cerrar area o doble clic para finalizar.";
  }, [hasPolygon, draftCount, canClose]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border">
      <div ref={containerRef} className="absolute inset-0" />
      {mapError && (
        <div className="absolute inset-x-3 bottom-3 z-[500] rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          Error cargando mapa: {mapError}
        </div>
      )}
      <div className="absolute left-3 top-3 z-[500] flex max-w-[20rem] flex-col gap-2 rounded-md bg-background/95 p-3 shadow">
        <div className="text-xs text-muted-foreground">{status}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={undoLastPoint}
            disabled={draftCount === 0}
            className="rounded border bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Borrar ultimo
          </button>
          <button
            type="button"
            onClick={closePolygon}
            disabled={!canClose}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cerrar area ({draftCount})
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={draftCount === 0 && !hasPolygon}
            className="rounded border bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}
