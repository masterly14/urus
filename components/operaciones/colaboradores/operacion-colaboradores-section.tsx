"use client";

import { useState } from "react";
import { Plus, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperacionColaboradorCard } from "./operacion-colaborador-card";
import { OperacionAsignarColaboradorModal } from "./operacion-asignar-colaborador-modal";
import { EmptyState } from "@/components/ui/empty-state";

export function OperacionColaboradoresSection({
  operacionId,
  asignaciones,
  onRefresh,
}: {
  operacionId: string;
  asignaciones: any[];
  onRefresh: () => void;
}) {
  const [asignarOpen, setAsignarOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Colaboradores Externos</h3>
        <Button size="sm" onClick={() => setAsignarOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Asignar colaborador
        </Button>
      </div>

      {asignaciones.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin colaboradores asignados"
          description="Añade bancos, abogados, tasadores o cualquier otro proveedor que participe en la operación."
          action={
            <Button variant="outline" size="sm" onClick={() => setAsignarOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Añadir el primero
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {asignaciones.map((asig) => (
            <OperacionColaboradorCard
              key={asig.id}
              asignacion={asig}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {asignarOpen && (
        <OperacionAsignarColaboradorModal
          operacionId={operacionId}
          onOpenChange={setAsignarOpen}
          onSuccess={() => {
            setAsignarOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
