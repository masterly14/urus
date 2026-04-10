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

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
}

interface ComercialOption {
  id: string;
  nombre: string;
  ciudad: string;
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [comerciales, setComerciales] = useState<ComercialOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("comercial");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [linkComercialId, setLinkComercialId] = useState("");

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

      if (usersData.ok) setUsers(usersData.users);
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
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      setInviteError(data.error ?? "Error al enviar invitación");
    } else {
      setInviteSuccess(true);
      setInviteEmail("");
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

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const linkedComercialIds = new Set(
    users
      .filter((u) => (u as Record<string, unknown>).comercialId)
      .map((u) => (u as Record<string, unknown>).comercialId as string)
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
          <CardDescription>
            Envía una invitación por correo electrónico. El invitado recibirá un enlace para crear su cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
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
            <div className="w-48 space-y-2">
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
            <Button type="submit" disabled={inviting} className="gap-2">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invitar
            </Button>
          </form>
          {inviteError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Invitación enviada correctamente
            </div>
          )}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Comercial vinculado</TableHead>
                <TableHead>Registro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const comercialId = (user as Record<string, unknown>).comercialId as string | null;
                  const linked = comerciales.find((c) => c.id === comercialId);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge className={ROLE_COLORS[user.role] ?? ""}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Enviada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No hay invitaciones.
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date();
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
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
