"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Ruler,
  BedDouble,
  ArrowRight,
  Tag,
  Bath,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PropertyListItem } from "@/app/pricing/page";

interface PropertyCardProps {
  property: PropertyListItem;
  className?: string;
}

export function PropertyCard({ property, className }: PropertyCardProps) {
  const priceM2 =
    property.metrosConstruidos > 0
      ? Math.round(property.precio / property.metrosConstruidos)
      : 0;

  return (
    <Link href={`/pricing/informe/${property.codigo}`}>
      <Card
        className={cn(
          "border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card hover:shadow-lg hover:shadow-background/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer group overflow-hidden",
          className,
        )}
      >
        <div className="h-1 bg-secondary/40" />

        <CardContent className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="h-3.5 w-3.5 text-secondary shrink-0" />
                <p className="text-sm font-semibold truncate">
                  {property.titulo || property.ref || property.codigo}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[9px]">
                  <MapPin className="h-2.5 w-2.5 mr-0.5" />
                  {property.zona || property.ciudad}
                </Badge>
                <Badge variant="outline" className="text-[9px] font-mono">
                  {property.codigo}
                </Badge>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold font-mono">
                {property.precio.toLocaleString("es-ES")} €
              </p>
              {priceM2 > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {priceM2.toLocaleString("es-ES")} €/m²
                </p>
              )}
            </div>
          </div>

          {/* Property details */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {property.metrosConstruidos > 0 && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                {property.metrosConstruidos} m²
              </span>
            )}
            {property.habitaciones > 0 && (
              <span className="flex items-center gap-1">
                <BedDouble className="h-3 w-3" />
                {property.habitaciones} hab
              </span>
            )}
            {property.banyos > 0 && (
              <span className="flex items-center gap-1">
                <Bath className="h-3 w-3" />
                {property.banyos} baños
              </span>
            )}
            <Badge
              variant="outline"
              className="text-[9px]"
              style={{
                borderColor:
                  property.estado === "Reservado"
                    ? "var(--urus-success)"
                    : "var(--color-border)",
                color:
                  property.estado === "Reservado"
                    ? "var(--urus-success)"
                    : undefined,
              }}
            >
              {property.estado}
            </Badge>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/20">
            <span className="text-[10px] text-muted-foreground">
              {property.ciudad}
              {property.agente ? ` · ${property.agente}` : ""}
            </span>
            <span className="text-[10px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              Ver informe <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
