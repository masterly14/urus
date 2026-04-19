"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Users,
  Mail,
  Shield,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Phone,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppSession } from "@/lib/hooks/use-session";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  comercialId?: string | null;
  createdAt: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
  invitedName?: string;
  invitedPhone?: string;
}

function formatInvitedPhoneDisplay(digits?: string): string {
  const d = digits?.trim() ?? "";
  if (d.length === 11 && d.startsWith("34")) {
    return `+34 ${d.slice(2)}`;
  }
  return d || "—";
}

interface ComercialOption {
  id: string;
  nombre: string;
  ciudad: string;
  email: string;
}

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  admin: "Administrador",
  comercial: "Comercial",
};

const ROLE_COLORS: Record<string, string> = {
  ceo: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  comercial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function UserManagement() {
  const { user: sessionUser, isCeo } = useAppSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteInvitedName, setInviteInvitedName] = useState("");
  const [invitePhoneLocal, setInvitePhoneLocal] = useState("");
  const [inviteRole, setInviteRole] = useState("comercial");
  const [inviteRefCode, setInviteRefCode] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [linkComercialId, setLinkComercialId] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const userTableColSpan = isCeo ? 6 : 5;

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, invitationsRes, comercialesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/invitations"),
        fetch("/api/comerciales/activos"),
      ]);

      const usersData = await usersRes.json();
      const invitationsData = await invitationsRes.json();
      const comercialesData = await comercialesRes.json();

      if (usersData.ok) {
        const apiUsers = usersData.users as UserRow[];
        setUsers(apiUsers);
        setRoleDrafts(Object.fromEntries(apiUsers.map((user) => [user.id, user.role])));
      }
      if (invitationsData.ok) setInvitations(invitationsData.invitations);
      if (comercialesData.ok) setComerciales(comercialesData.comerciales);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        invitedName: inviteInvitedName.trim(),
        invitedPhoneLocal: invitePhoneLocal,
        role: inviteRole,
        ...(inviteRole === "comercial" && inviteRefCode.trim()
          ? { refCode: inviteRefCode.trim() }
          : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      setInviteError(data.error ?? "Error al enviar invitación");
    } else {
      setInviteSuccess(true);
      setInviteEmail("");
      setInviteInvitedName("");
      setInvitePhoneLocal("");
      setInviteRefCode("");
      void fetchData();
      setTimeout(() => setInviteSuccess(false), 3000);
    }

    setInviting(false);
  }

  async function handleLinkComercial(userId: string) {
    if (!linkComercialId) return;
    const res = await fetch("/api/users/link-comercial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, comercialId: linkComercialId }),
    });
    if (res.ok) {
      setLinkingUserId(null);
      setLinkComercialId("");
      void fetchData();
    }
  }

  async function handleChangeRole(userId: string, currentRole: string) {
    const nextRole = roleDrafts[userId];
    if (!nextRole || nextRole === currentRole) return;

    setUpdatingRoleUserId(userId);
    setRoleError(null);

    const res = await fetch("/api/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: nextRole }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setRoleError(data.error ?? "No se pudo actualizar el rol");
      setRoleDrafts((prev) => ({ ...prev, [userId]: currentRole }));
    } else {
      void fetchData();
    }

    setUpdatingRoleUserId(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletingUserId(deleteTarget.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDeleteError(data.error ?? "No se pudo eliminar el usuario");
        return;
      }
      setDeleteTarget(null);
      void fetchData();
    } catch {
      setDeleteError("Error de red al eliminar el usuario");
    } finally {
      setDeletingUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const linkedComercialIds = new Set(
    users
      .map((u) => u.comercialId)
      .filter((id): id is string => Boolean(id))
  );
  const availableComerciales = comerciales.filter((c) => !linkedComercialIds.has(c.id));

  return (
    <div className="space-y-6">
      {/* Invite Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invitar usuario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            {/* Fila 1: Nombre + Email */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inviteInvitedName">Nombre del invitado</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="inviteInvitedName"
                    type="text"
                    placeholder="Nombre completo"
                    className="pl-9"
                    required
                    value={inviteInvitedName}
                    onChange={(e) => setInviteInvitedName(e.target.value)}
                    disabled={inviting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Debe coincidir <strong>exactamente</strong> con el nombre en Inmovilla (tildes, mayúsculas y espacios).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inviteEmail">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="nombre@ejemplo.com"
                    className="pl-9"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={inviting}
                  />
                </div>
              </div>
            </div>

            {/* Fila 2: Teléfono + Rol + Iniciales (si comercial) */}
            <div className={`grid gap-4 ${inviteRole === "comercial" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="space-y-1.5">
                <Label htmlFor="invitePhone">
                  Teléfono
                  {inviteRole !== "comercial" && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <div
                    className="flex h-10 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                    aria-hidden
                  >
                    +34
                  </div>
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invitePhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="612 345 678"
                      className="pl-9"
                      required={inviteRole === "comercial"}
                      value={invitePhoneLocal}
                      onChange={(e) => setInvitePhoneLocal(e.target.value)}
                      disabled={inviting}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select value={inviteRole} onValueChange={setInviteRole} disabled={inviting}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inviteRole === "comercial" && (
                <div className="space-y-1.5">
                  <Label htmlFor="inviteRefCode">Iniciales Inmovilla</Label>
                  <Input
                    id="inviteRefCode"
                    type="text"
                    placeholder="MA"
                    maxLength={10}
                    required
                    value={inviteRefCode}
                    onChange={(e) => setInviteRefCode(e.target.value.toUpperCase())}
                    disabled={inviting}
                  />
                </div>
              )}
            </div>

            {/* Botón + feedback inline */}
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={inviting} className="gap-2">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Invitar
              </Button>
              {inviteError && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {inviteError}
                </span>
              )}
              {inviteSuccess && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Invitación enviada correctamente
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuarios ({users.length})
          </CardTitle>
          <CardDescription>
            Usuarios registrados en el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roleError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              {roleError}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Comercial vinculado</TableHead>
                <TableHead>Registro</TableHead>
                {isCeo && (
                  <TableHead className="w-[72px] text-right text-muted-foreground">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={userTableColSpan}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const userComercialId = user.comercialId ?? null;
                  const linked = comerciales.find((c) => c.id === userComercialId);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={roleDrafts[user.id] ?? user.role}
                            onValueChange={(value) =>
                              setRoleDrafts((prev) => ({ ...prev, [user.id]: value }))
                            }
                            disabled={updatingRoleUserId === user.id}
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ceo">CEO</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="comercial">Comercial</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={
                              updatingRoleUserId === user.id ||
                              (roleDrafts[user.id] ?? user.role) === user.role
                            }
                            onClick={() => handleChangeRole(user.id, user.role)}
                          >
                            {updatingRoleUserId === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Guardar"
                            )}
                          </Button>
                          <Badge className={ROLE_COLORS[user.role] ?? ""}>
                            {ROLE_LABELS[user.role] ?? user.role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.role === "comercial" ? (
                          linked ? (
                            <span className="text-sm">{linked.nombre} ({linked.ciudad})</span>
                          ) : linkingUserId === user.id ? (
                            <div className="flex items-center gap-2">
                              <Select value={linkComercialId} onValueChange={setLinkComercialId}>
                                <SelectTrigger className="w-48 h-8 text-xs">
                                  <SelectValue placeholder="Seleccionar..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableComerciales.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.nombre} ({c.ciudad})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => handleLinkComercial(user.id)}
                              >
                                OK
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => setLinkingUserId(null)}
                              >
                                X
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setLinkingUserId(user.id)}
                            >
                              <Shield className="h-3 w-3" />
                              Vincular
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString("es-ES")}
                      </TableCell>
                      {isCeo && (
                        <TableCell className="text-right">
                          {sessionUser && user.id !== sessionUser.id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Eliminar usuario"
                              aria-label={`Eliminar usuario ${user.name}`}
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(user);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cuenta de {deleteTarget?.name} ({deleteTarget?.email}). Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUserId !== null}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletingUserId !== null}
              onClick={() => void handleConfirmDelete()}
            >
              {deletingUserId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Eliminar"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Invitaciones ({invitations.length})
          </CardTitle>
          <CardDescription>
            Invitaciones enviadas. Las no utilizadas expirarán automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Enviada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No hay invitaciones.
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date();
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        {inv.invitedName?.trim() || "—"}
                      </TableCell>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInvitedPhoneDisplay(inv.invitedPhone)}
                      </TableCell>
                      <TableCell>
                        <Badge className={ROLE_COLORS[inv.role] ?? ""}>
                          {ROLE_LABELS[inv.role] ?? inv.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inv.used ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Utilizada
                          </Badge>
                        ) : expired ? (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> Expirada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" /> Pendiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.expiresAt).toLocaleDateString("es-ES")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString("es-ES")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
