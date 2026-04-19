"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

type ColaboradorFormData = {
  nombre: string;
  tipo: string;
  ciudad: string;
  especialidad: string;
  contactoNombre: string;
  contactoEmail: string;
  contactoTelefono: string;
  notas: string;
};

export function ColaboradorForm({
  initialData,
  tipos,
  onSubmit,
  onCancel,
  submitLabel = "Guardar",
}: {
  initialData?: Partial<ColaboradorFormData>;
  tipos: string[];
  onSubmit: (data: ColaboradorFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [data, setData] = useState<ColaboradorFormData>({
    nombre: initialData?.nombre ?? "",
    tipo: initialData?.tipo ?? "",
    ciudad: initialData?.ciudad ?? "",
    especialidad: initialData?.especialidad ?? "",
    contactoNombre: initialData?.contactoNombre ?? "",
    contactoEmail: initialData?.contactoEmail ?? "",
    contactoTelefono: initialData?.contactoTelefono ?? "",
    notas: initialData?.notas ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customTipo, setCustomTipo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.nombre.trim() || !data.tipo.trim()) {
      setError("Nombre y tipo son obligatorios");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const set = (field: keyof ColaboradorFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setData((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nombre" className="text-xs">Nombre *</Label>
          <Input
            id="nombre"
            value={data.nombre}
            onChange={set("nombre")}
            placeholder="Ej: Banco Santander"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tipo" className="text-xs">Tipo *</Label>
          {!customTipo && tipos.length > 0 ? (
            <div className="flex gap-1.5">
              <select
                id="tipo"
                value={data.tipo}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCustomTipo(true);
                    setData((p) => ({ ...p, tipo: "" }));
                  } else {
                    setData((p) => ({ ...p, tipo: e.target.value }));
                  }
                }}
                className="flex-1 bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                <option value="">Seleccionar...</option>
                {tipos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__new__">+ Nuevo tipo...</option>
              </select>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input
                id="tipo"
                value={data.tipo}
                onChange={set("tipo")}
                placeholder="Ej: Banco"
                className="h-8 text-sm flex-1"
              />
              {tipos.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCustomTipo(false)}
                >
                  Lista
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ciudad" className="text-xs">Ciudad</Label>
          <Input
            id="ciudad"
            value={data.ciudad}
            onChange={set("ciudad")}
            placeholder="Ej: Valencia"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="especialidad" className="text-xs">Especialidad</Label>
          <Input
            id="especialidad"
            value={data.especialidad}
            onChange={set("especialidad")}
            placeholder="Ej: Hipotecas residenciales"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactoNombre" className="text-xs">Contacto</Label>
          <Input
            id="contactoNombre"
            value={data.contactoNombre}
            onChange={set("contactoNombre")}
            placeholder="Nombre del contacto"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactoEmail" className="text-xs">Email</Label>
          <Input
            id="contactoEmail"
            type="email"
            value={data.contactoEmail}
            onChange={set("contactoEmail")}
            placeholder="contacto@ejemplo.com"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactoTelefono" className="text-xs">Teléfono</Label>
          <Input
            id="contactoTelefono"
            value={data.contactoTelefono}
            onChange={set("contactoTelefono")}
            placeholder="+34 600 000 000"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notas" className="text-xs">Notas</Label>
        <Textarea
          id="notas"
          value={data.notas}
          onChange={set("notas")}
          placeholder="Notas internas sobre el colaborador..."
          className="text-sm min-h-[60px]"
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--urus-danger)]">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
