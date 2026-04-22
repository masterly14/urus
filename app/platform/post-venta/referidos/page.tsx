"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Filter,
  UserPlus,
  Loader2,
  Phone,
  Mail,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Comercial {
  id: string;
  nombre: string;
}

interface Referral {
  id: string;
  propertyCode: string;
  referrerName: string;
  referrerPhone: string;
  referredName: string;
  referredPhone: string;
  referredEmail: string;
  notes: string;
  status: string;
  comercialId: string | null;
  comercial: Comercial | null;
  assignedAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDIENTE_ASIGNACION: { label: "Pendiente", variant: "outline" },
  ASIGNADO: { label: "Asignado", variant: "default" },
  CONTACTADO: { label: "Contactado", variant: "secondary" },
  DESCARTADO: { label: "Descartado", variant: "destructive" },
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "PENDIENTE_ASIGNACION", label: "Pendientes" },
  { value: "ASIGNADO", label: "Asignados" },
  { value: "CONTACTADO", label: "Contactados" },
  { value: "DESCARTADO", label: "Descartados" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReferidosAdminPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [selectedComercialId, setSelectedComercialId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token") ?? ""
    : "";

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ token });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/referidos?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setReferrals(data.referrals ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, token]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  useEffect(() => {
    async function loadComerciales() {
      try {
        const q = new URLSearchParams();
        q.set("token", token);
        const res = await fetch(`/api/comerciales?${q}`);
        if (!res.ok) return;
        const data = await res.json();
        setComerciales(data.comerciales ?? []);
      } catch { /* ignore */ }
    }
    loadComerciales();
  }, [token]);

  function openAssignDialog(referral: Referral) {
    setSelectedReferral(referral);
    setSelectedComercialId("");
    setAssignDialogOpen(true);
  }

  async function handleAssign() {
    if (!selectedReferral || !selectedComercialId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/referidos/${selectedReferral.id}/asignar`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comercialId: selectedComercialId }),
      });
      if (res.ok) {
        setAssignDialogOpen(false);
        await fetchReferrals();
      }
    } finally {
      setAssigning(false);
    }
  }

  const pendingCount = referrals.filter((r) => r.status === "PENDIENTE_ASIGNACION").length;

  const uniqueComercials = referrals
    .filter((r) => r.comercial)
    .reduce((acc, r) => {
      if (r.comercial && !acc.find((c) => c.id === r.comercial!.id)) {
        acc.push(r.comercial);
      }
      return acc;
    }, [] as Comercial[]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
            <Users className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Referidos</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de referidos capturados desde post-venta
            </p>
          </div>
        </div>
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""} de asignación
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Estado:</span>
            </div>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                    statusFilter === f.value
                      ? "bg-card border-secondary/30 text-foreground font-medium"
                      : "border-border/30 text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {total} referido{total !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No hay referidos{statusFilter !== "all" ? " con este filtro" : ""}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referido</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Referente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r) => {
                  const st = STATUS_LABELS[r.status] ?? { label: r.status, variant: "outline" as const };
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{r.referredName}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {r.referredPhone}
                            </span>
                            {r.referredEmail && (
                              <span className="flex items-center gap-0.5">
                                <Mail className="h-2.5 w-2.5" />
                                {r.referredEmail}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">{r.propertyCode}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{r.referrerName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(r.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {r.comercial?.nombre ?? (
                            <span className="text-muted-foreground italic">Sin asignar</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "PENDIENTE_ASIGNACION" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAssignDialog(r)}
                            className="text-xs h-7"
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Asignar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar comercial</DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="space-y-4">
              <div className="text-sm">
                <p>
                  Referido: <span className="font-medium">{selectedReferral.referredName}</span>
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Tel: {selectedReferral.referredPhone} | Operación: {selectedReferral.propertyCode}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Comercial</label>
                <Select value={selectedComercialId} onValueChange={setSelectedComercialId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar comercial..." />
                  </SelectTrigger>
                  <SelectContent>
                    {comerciales.length > 0
                      ? comerciales.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre}
                          </SelectItem>
                        ))
                      : uniqueComercials.length > 0
                        ? uniqueComercials.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))
                        : (
                            <SelectItem value="__none" disabled>
                              No hay comerciales disponibles
                            </SelectItem>
                          )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedComercialId || assigning}
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Asignando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
