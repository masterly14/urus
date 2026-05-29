"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  CircleHelp,
  Home,
  Loader2,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GlobalPropertyOption } from "@/components/properties/global-property-selector";
import { GlobalPropertyListPicker } from "@/components/properties/global-property-list-picker";
import type { GlobalDemandOption } from "@/components/demands/global-demand-selector";
import { GlobalDemandListPicker } from "@/components/demands/global-demand-list-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type ManualCreateStep = "demanda" | "propiedad" | "horario";

type ComercialOption = {
  id: string;
  nombre: string;
  ciudad: string;
  inmovillaAgentId: number | null;
};

type DemandPropertyTypeOption = {
  valor: number;
  nombre: string;
};

type LocalidadOption = {
  key_loca: number;
  ciudad: string;
  provincia: string;
};

type VisitWorkItemDto = {
  id: string;
  demandId: string;
  propertyId: string;
};

const STEPS: { id: ManualCreateStep; label: string }[] = [
  { id: "demanda", label: "Demanda" },
  { id: "propiedad", label: "Propiedad" },
  { id: "horario", label: "Horario" },
];

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

function isValidManualPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

function normalizePhoneForInmovillaClientUpdate(phone: string): { telefono1: number; prefijotel1?: number } | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("34")) {
    return { telefono1: Number(digits.slice(2)), prefijotel1: 34 };
  }
  if (digits.length === 9) {
    return { telefono1: Number(digits), prefijotel1: 34 };
  }
  return { telefono1: Number(digits) };
}

function InlineHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Más información"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-xs text-sm leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function CreateVisitStepper({ currentStep }: { currentStep: ManualCreateStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav
      aria-label="Pasos de creación de visita"
      className="flex w-full justify-center px-2"
    >
      <ol className="flex list-none items-start gap-0 p-0">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = step.id === currentStep;
          return (
            <li key={step.id} className="flex items-start">
              <div className="flex w-[5.5rem] flex-col items-center gap-1 sm:w-[6.25rem]">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-primary/10 text-primary",
                    !isCompleted && !isCurrent && "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="size-4" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-center text-[11px] font-medium leading-tight",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "mt-4 h-px w-10 shrink-0 sm:w-14",
                    index < currentIndex ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type CrearVisitaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  useMock?: boolean;
  onSuccess: (visitId: string) => void;
};

export function CrearVisitaDialog({ open, onOpenChange, useMock = false, onSuccess }: CrearVisitaDialogProps) {
  const [step, setStep] = useState<ManualCreateStep>("demanda");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [demands, setDemands] = useState<GlobalDemandOption[]>([]);
  const [properties, setProperties] = useState<GlobalPropertyOption[]>([]);
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [demandPropertyTypes, setDemandPropertyTypes] = useState<DemandPropertyTypeOption[]>([]);
  const [localidades, setLocalidades] = useState<LocalidadOption[]>([]);

  const [demandMode, setDemandMode] = useState<"existing" | "draft">("existing");
  const [propertyMode, setPropertyMode] = useState<"existing" | "draft">("existing");
  const [demandAdvancedOpen, setDemandAdvancedOpen] = useState(false);
  const [propertyAdvancedOpen, setPropertyAdvancedOpen] = useState(false);

  const [comercialId, setComercialId] = useState("");
  const [demandId, setDemandId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [draftBuyerName, setDraftBuyerName] = useState("");
  const [draftBuyerPhone, setDraftBuyerPhone] = useState("");
  const [draftDemandPropertyType, setDraftDemandPropertyType] = useState("");
  const [draftDemandBudgetMax, setDraftDemandBudgetMax] = useState("9999999");
  const [draftOwnerPhone, setDraftOwnerPhone] = useState("");
  const [draftCadastralRef, setDraftCadastralRef] = useState("");
  const [draftPropertyKeyTipo, setDraftPropertyKeyTipo] = useState("");
  const [draftPropertyKeyLoca, setDraftPropertyKeyLoca] = useState("");
  const [draftPropertyOperationType, setDraftPropertyOperationType] = useState<"VENTA" | "ALQUILER">("VENTA");
  const [draftPropertyAddress, setDraftPropertyAddress] = useState("");
  const [draftPropertyPrice, setDraftPropertyPrice] = useState("");

  const [fecha, setFecha] = useState(tomorrow());
  const [horaInicio, setHoraInicio] = useState("10:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [notas, setNotas] = useState("");

  const selectedDemand = useMemo(
    () => demands.find((demand) => demand.codigo === demandId) ?? null,
    [demands, demandId],
  );

  const selectedDemandNeedsPhone = Boolean(
    demandMode === "existing" && selectedDemand && !selectedDemand.telefono?.trim(),
  );

  const resetForm = useCallback(() => {
    setStep("demanda");
    setError(null);
    setDemandMode("existing");
    setPropertyMode("existing");
    setDemandAdvancedOpen(false);
    setPropertyAdvancedOpen(false);
    setDemandId("");
    setPropertyId("");
    setBuyerPhone("");
    setDraftBuyerName("");
    setDraftBuyerPhone("");
    setDraftOwnerPhone("");
    setDraftCadastralRef("");
    setDraftPropertyAddress("");
    setDraftPropertyPrice("");
    setFecha(tomorrow());
    setHoraInicio("10:00");
    setHoraFin("11:00");
    setNotas("");
  }, []);

  const loadMockOptions = useCallback(() => {
    setDemands([
      {
        codigo: "DEM-MOCK-MANUAL",
        nombre: "Comprador manual",
        telefono: "34600123456",
        leadStatus: "NUEVO",
        createdAt: new Date().toISOString(),
      },
    ]);
    setProperties([
      {
        codigo: "PROP-MOCK-MANUAL",
        ref: "URUS-MANUAL",
        refCatastral: "MOCK-CATASTRAL",
        titulo: "Piso manual mock",
        ciudad: "Córdoba",
        zona: "Centro",
        precio: 220000,
        habitaciones: 3,
        metrosConstruidos: 88,
        mainPhotoUrl: null,
        portalUrl: null,
        propietarioNombre: "Propietaria Mock",
        propietarioPhone: "34666777888",
      },
    ]);
    setComerciales([{ id: "com-mock", nombre: "Comercial Mock", ciudad: "Córdoba", inmovillaAgentId: 1 }]);
    setDemandPropertyTypes([{ valor: 2799, nombre: "Piso" }]);
    setLocalidades([{ key_loca: 1, ciudad: "Córdoba", provincia: "Córdoba" }]);
    setComercialId("com-mock");
    setDraftDemandPropertyType("2799");
    setDraftPropertyKeyTipo("2799");
    setDraftPropertyKeyLoca("1");
  }, []);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/visitas/manual-options?limit=100", { cache: "no-store" });
      const data = (await response.json()) as {
        ok?: boolean;
        demands?: GlobalDemandOption[];
        properties?: GlobalPropertyOption[];
        comerciales?: ComercialOption[];
        demandPropertyTypes?: DemandPropertyTypeOption[];
        localidades?: LocalidadOption[];
        currentComercialId?: string | null;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No se pudieron cargar opciones");
      setDemands(data.demands ?? []);
      setProperties(data.properties ?? []);
      setComerciales(data.comerciales ?? []);
      setDemandPropertyTypes(data.demandPropertyTypes ?? []);
      setLocalidades(data.localidades ?? []);
      setComercialId((current) => current || data.currentComercialId || data.comerciales?.[0]?.id || "");
      setDraftDemandPropertyType((current) => current || String(data.demandPropertyTypes?.[0]?.valor ?? "2799"));
      setDraftPropertyKeyTipo((current) => current || String(data.demandPropertyTypes?.[0]?.valor ?? ""));
      setDraftPropertyKeyLoca((current) => current || String(data.localidades?.[0]?.key_loca ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando opciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    if (useMock) {
      loadMockOptions();
      return;
    }
    void loadOptions();
  }, [open, useMock, resetForm, loadMockOptions, loadOptions]);

  const isDemandStepValid = useMemo(() => {
    if (!comercialId) return false;
    if (demandMode === "existing") {
      if (!demandId) return false;
      if (selectedDemandNeedsPhone && !isValidManualPhone(buyerPhone)) return false;
      return true;
    }
    return isValidManualPhone(draftBuyerPhone) && Boolean(draftDemandPropertyType) && Number(draftDemandBudgetMax || "0") > 0;
  }, [
    comercialId,
    demandMode,
    demandId,
    selectedDemandNeedsPhone,
    buyerPhone,
    draftBuyerPhone,
    draftDemandPropertyType,
    draftDemandBudgetMax,
  ]);

  const isPropertyStepValid = useMemo(() => {
    if (propertyMode === "existing") return Boolean(propertyId);
    const price = Number(draftPropertyPrice);
    return (
      isValidManualPhone(draftOwnerPhone) &&
      Boolean(draftCadastralRef.trim()) &&
      draftPropertyAddress.trim().length >= 5 &&
      Number.isFinite(price) &&
      price > 0 &&
      Boolean(draftPropertyKeyTipo) &&
      Boolean(draftPropertyKeyLoca)
    );
  }, [
    propertyMode,
    propertyId,
    draftOwnerPhone,
    draftCadastralRef,
    draftPropertyAddress,
    draftPropertyPrice,
    draftPropertyKeyTipo,
    draftPropertyKeyLoca,
  ]);

  const isScheduleStepValid = useMemo(
    () => Boolean(fecha) && horaInicio < horaFin,
    [fecha, horaInicio, horaFin],
  );

  const stepDescription: Record<ManualCreateStep, string> = {
    demanda: "Asigna el comercial y selecciona o crea la demanda del comprador.",
    propiedad: "Elige la propiedad a visitar (existente o provisional).",
    horario: "Define fecha, franja horaria y notas internas.",
  };

  async function ensureDemandPhone(): Promise<void> {
    if (demandMode !== "existing" || !selectedDemandNeedsPhone) return;
    if (!isValidManualPhone(buyerPhone)) {
      throw new Error("Introduce un teléfono válido para el comprador antes de continuar.");
    }
    const phonePatch = normalizePhoneForInmovillaClientUpdate(buyerPhone);
    if (!phonePatch) {
      throw new Error("Introduce un teléfono válido para el comprador antes de continuar.");
    }
    const response = await fetch(`/api/demands/${encodeURIComponent(demandId)}/update-client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phonePatch),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };
    if (!response.ok || !data.ok) {
      throw new Error(data.message ?? data.error ?? "No se pudo actualizar el teléfono del comprador");
    }
    setDemands((prev) =>
      prev.map((demand) =>
        demand.codigo === demandId ? { ...demand, telefono: `34${phonePatch.telefono1}` } : demand,
      ),
    );
  }

  const handleNext = async () => {
    setError(null);
    if (step === "demanda") {
      if (!isDemandStepValid) {
        setError("Completa la demanda y el comercial asignado para continuar.");
        return;
      }
      try {
        await ensureDemandPhone();
        setStep("propiedad");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error validando demanda");
      }
      return;
    }
    if (step === "propiedad") {
      if (!isPropertyStepValid) {
        setError("Completa la propiedad para continuar.");
        return;
      }
      setStep("horario");
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === "propiedad") setStep("demanda");
    else if (step === "horario") setStep("propiedad");
  };

  const handleSubmit = async () => {
    if (!isDemandStepValid || !isPropertyStepValid || !isScheduleStepValid) {
      setError("Revisa los datos de los tres pasos antes de crear la visita.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await ensureDemandPhone();
      const isExistingDemand = demandMode === "existing";
      const isExistingProperty = propertyMode === "existing";

      const createResponse = await fetch("/api/visitas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandMode,
          propertyMode,
          comercialId,
          demandId: isExistingDemand ? demandId : undefined,
          propertyId: isExistingProperty ? propertyId : undefined,
          buyerName: isExistingDemand ? undefined : draftBuyerName,
          buyerPhone: isExistingDemand ? undefined : draftBuyerPhone,
          demandPropertyType: isExistingDemand ? undefined : draftDemandPropertyType,
          demandBudgetMax: isExistingDemand ? undefined : Number(draftDemandBudgetMax || "0"),
          ownerPhone: isExistingProperty ? undefined : draftOwnerPhone,
          cadastralRef: isExistingProperty ? undefined : draftCadastralRef,
          draftPropertyKeyTipo: isExistingProperty ? undefined : Number(draftPropertyKeyTipo),
          draftPropertyKeyLoca: isExistingProperty ? undefined : Number(draftPropertyKeyLoca),
          draftPropertyOperationType: isExistingProperty ? undefined : draftPropertyOperationType,
          draftPropertyAddress: isExistingProperty ? undefined : draftPropertyAddress.trim(),
          draftPropertyPrice: isExistingProperty ? undefined : Number(draftPropertyPrice),
          nluSummary: notas || "Visita inicial creada manualmente sin contexto previo del comprador.",
        }),
      });
      const createData = (await createResponse.json()) as {
        ok?: boolean;
        error?: string;
        workItem?: VisitWorkItemDto;
      };
      if (!createResponse.ok || !createData.ok || !createData.workItem) {
        throw new Error(createData.error ?? "No se pudo crear la visita manual");
      }

      const scheduleResponse = await fetch("/api/visitas/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: createData.workItem.id,
          demandId: createData.workItem.demandId || undefined,
          propertyId: createData.workItem.propertyId || undefined,
          fecha,
          horaInicio,
          horaFin,
          notas,
        }),
      });
      const scheduleData = (await scheduleResponse.json()) as { ok?: boolean; error?: string };
      if (!scheduleResponse.ok || !scheduleData.ok) {
        throw new Error(scheduleData.error ?? "Visita creada, pero no se pudo agendar");
      }

      onOpenChange(false);
      onSuccess(createData.workItem.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando visita manual");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-4 border-b pb-4">
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            Nueva visita
          </DialogTitle>
          <DialogDescription>{stepDescription[step]}</DialogDescription>
          <CreateVisitStepper currentStep={step} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando opciones…
            </div>
          ) : null}

          {!loading && step === "demanda" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Label
                  htmlFor="createVisitComercial"
                  className="shrink-0 text-sm font-medium"
                >
                  Comercial asignado
                </Label>
                <div className="min-w-0 flex-1 sm:max-w-md">
                  <Select value={comercialId} onValueChange={setComercialId}>
                    <SelectTrigger id="createVisitComercial" className="w-full min-w-[14rem]">
                      <SelectValue placeholder="Selecciona comercial" />
                    </SelectTrigger>
                    <SelectContent>
                      {comerciales.map((comercial) => (
                        <SelectItem key={comercial.id} value={comercial.id}>
                          {comercial.nombre} ({comercial.ciudad})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  <span className="font-medium">Demanda / Comprador</span>
                  <InlineHelp text="Existente: usa una demanda ya creada en Inmovilla. Provisional: arranca la visita solo con teléfono y completa la demanda al enviar firma del Parte de Visita." />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={demandMode === "existing" ? "default" : "outline"}
                    onClick={() => {
                      setDemandMode("existing");
                      setDemandAdvancedOpen(false);
                    }}
                  >
                    Existente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={demandMode === "draft" ? "default" : "outline"}
                    onClick={() => {
                      setDemandMode("draft");
                      setDemandAdvancedOpen(true);
                    }}
                  >
                    Provisional
                  </Button>
                </div>
                {demandMode === "existing" ? (
                  <GlobalDemandListPicker
                    key={open ? "demand-list" : "demand-list-closed"}
                    demands={demands}
                    value={demandId}
                    onChange={(id) => {
                      const demand = demands.find((item) => item.codigo === id);
                      setDemandId(id);
                      setBuyerPhone(demand?.telefono ?? "");
                    }}
                    disabled={loading}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Teléfono comprador *</Label>
                      <Input
                        value={draftBuyerPhone}
                        onChange={(e) => setDraftBuyerPhone(e.target.value)}
                        placeholder="Ej: 600111222"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre (opcional)</Label>
                      <Input
                        value={draftBuyerName}
                        onChange={(e) => setDraftBuyerName(e.target.value)}
                        placeholder="Nombre del comprador"
                      />
                    </div>
                    <Collapsible open={demandAdvancedOpen} onOpenChange={setDemandAdvancedOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          Configuración avanzada
                          <ChevronDown
                            className={cn("size-4 transition-transform", demandAdvancedOpen && "rotate-180")}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-3">
                        <div className="space-y-2">
                          <Label>Tipo de inmueble</Label>
                          <Select value={draftDemandPropertyType} onValueChange={setDraftDemandPropertyType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {demandPropertyTypes.map((tipo) => (
                                <SelectItem key={tipo.valor} value={String(tipo.valor)}>
                                  {tipo.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Presupuesto máximo (€)</Label>
                          <Input
                            type="number"
                            value={draftDemandBudgetMax}
                            onChange={(e) => setDraftDemandBudgetMax(e.target.value)}
                            placeholder="250000"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
                {selectedDemandNeedsPhone ? (
                  <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <Label className="text-amber-600 dark:text-amber-400">Teléfono comprador requerido</Label>
                    <Input
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Ej: 600111222"
                    />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Esta demanda no tiene teléfono. Se actualizará antes de crear la visita.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loading && step === "propiedad" ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Home className="size-4 text-primary" />
                <span className="font-medium">Propiedad</span>
                <InlineHelp text="Existente: selecciona una propiedad ya cargada. Provisional: crea un prospecto con referencia catastral, dirección y precio (aparecen en el Parte de Visita por WhatsApp)." />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={propertyMode === "existing" ? "default" : "outline"}
                  onClick={() => {
                    setPropertyMode("existing");
                    setPropertyAdvancedOpen(false);
                  }}
                >
                  Existente
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={propertyMode === "draft" ? "default" : "outline"}
                  onClick={() => {
                    setPropertyMode("draft");
                    setPropertyAdvancedOpen(true);
                  }}
                >
                  Provisional
                </Button>
              </div>
              {propertyMode === "existing" ? (
                <GlobalPropertyListPicker
                  key={open ? "property-list" : "property-list-closed"}
                  properties={properties}
                  value={propertyId}
                  onChange={setPropertyId}
                  disabled={loading}
                />
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Teléfono propietario *</Label>
                    <Input
                      value={draftOwnerPhone}
                      onChange={(e) => setDraftOwnerPhone(e.target.value)}
                      placeholder="Ej: 600111222"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Referencia catastral *</Label>
                    <Input
                      value={draftCadastralRef}
                      onChange={(e) => setDraftCadastralRef(e.target.value)}
                      placeholder="Ej: 1234567UG4913S"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dirección del inmueble *</Label>
                    <Input
                      value={draftPropertyAddress}
                      onChange={(e) => setDraftPropertyAddress(e.target.value)}
                      placeholder="Ej: Calle Flamencos 8, La Carlota, Córdoba"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {draftPropertyOperationType === "ALQUILER" ? "Renta mensual (€) *" : "Precio de venta (€) *"}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={draftPropertyPrice}
                      onChange={(e) => setDraftPropertyPrice(e.target.value)}
                      placeholder={draftPropertyOperationType === "ALQUILER" ? "850" : "275000"}
                    />
                  </div>
                  <Collapsible open={propertyAdvancedOpen} onOpenChange={setPropertyAdvancedOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between">
                        Configuración avanzada
                        <ChevronDown
                          className={cn("size-4 transition-transform", propertyAdvancedOpen && "rotate-180")}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                      <div className="space-y-2">
                        <Label>Operación</Label>
                        <Select
                          value={draftPropertyOperationType}
                          onValueChange={(v) => setDraftPropertyOperationType(v as "VENTA" | "ALQUILER")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VENTA">Venta</SelectItem>
                            <SelectItem value="ALQUILER">Alquiler</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo de inmueble</Label>
                        <Select value={draftPropertyKeyTipo} onValueChange={setDraftPropertyKeyTipo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {demandPropertyTypes.map((tipo) => (
                              <SelectItem key={tipo.valor} value={String(tipo.valor)}>
                                {tipo.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Localidad</Label>
                        <Select value={draftPropertyKeyLoca} onValueChange={setDraftPropertyKeyLoca}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona localidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {localidades.map((loc) => (
                              <SelectItem key={loc.key_loca} value={String(loc.key_loca)}>
                                {loc.ciudad} ({loc.provincia})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          ) : null}

          {!loading && step === "horario" ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="createVisitFecha">Fecha</Label>
                  <DatePicker
                    id="createVisitFecha"
                    value={fecha}
                    onChange={setFecha}
                    placeholder="Elegir fecha"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="createVisitInicio">Hora inicio</Label>
                  <Input
                    id="createVisitInicio"
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="createVisitFin">Hora fin</Label>
                  <Input
                    id="createVisitFin"
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="createVisitNotas">Notas internas</Label>
                <Textarea
                  id="createVisitNotas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: propietario confirma llaves, agencia externa abre portal..."
                  rows={3}
                />
              </div>
              {horaInicio >= horaFin ? (
                <p className="text-sm text-destructive">La hora de fin debe ser posterior a la de inicio.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t pt-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {step !== "demanda" ? (
              <Button type="button" variant="outline" onClick={handleBack} disabled={submitting || loading}>
                Atrás
              </Button>
            ) : null}
            {step !== "horario" ? (
              <Button
                type="button"
                onClick={() => void handleNext()}
                disabled={loading || submitting || (step === "demanda" && !isDemandStepValid) || (step === "propiedad" && !isPropertyStepValid)}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={loading || submitting || !isScheduleStepValid}
              >
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Crear y agendar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
