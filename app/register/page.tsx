"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { signUp } from "@/lib/auth/client";

interface InvitationInfo {
    email: string;
    role: string;
}

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
    const [validating, setValidating] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setTokenError("Enlace de invitación inválido. Contacta a tu administrador.");
            setValidating(false);
            return;
        }

        fetch(`/api/invitations/validate?token=${encodeURIComponent(token)}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.ok) {
                    setInvitation({ email: data.email, role: data.role });
                } else {
                    setTokenError(data.error ?? "Invitación inválida o expirada.");
                }
            })
            .catch(() => setTokenError("Error al verificar la invitación."))
            .finally(() => setValidating(false));
    }, [token]);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }

        setIsLoading(true);
        setError(null);

        const res = await fetch("/api/invitations/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, name, password }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            setError(data.error ?? "Error al crear la cuenta.");
            setIsLoading(false);
            return;
        }

        setSuccess(true);

        setTimeout(() => router.push("/login"), 2000);
    }

    if (validating) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (tokenError) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-xl">
                    <CardHeader className="text-center">
                        <XCircle className="mx-auto h-12 w-12 text-destructive" />
                        <CardTitle className="mt-4 text-xl">Invitación inválida</CardTitle>
                        <CardDescription>{tokenError}</CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button variant="outline" onClick={() => router.push("/login")}>
                            Ir al login
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-xl">
                    <CardHeader className="text-center">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
                        <CardTitle className="mt-4 text-xl">Cuenta creada</CardTitle>
                        <CardDescription>Redirigiendo al login...</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const roleLabel = invitation?.role === "admin" ? "Administrador" : "Comercial";

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight text-primary">
                        URUS Capital
                    </CardTitle>
                    <CardDescription>
                        Crea tu cuenta como <strong>{roleLabel}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        {error && (
                            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    disabled
                                    className="pl-9"
                                    value={invitation?.email ?? ""}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre completo</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Tu nombre"
                                    disabled={isLoading}
                                    className="pl-9"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Mínimo 8 caracteres"
                                    disabled={isLoading}
                                    className="pl-9"
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    disabled={isLoading}
                                    className="pl-9"
                                    required
                                    minLength={8}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <Button className="w-full" type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creando cuenta...
                                </>
                            ) : (
                                "Crear cuenta"
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground">
                    <p>
                        Al crear tu cuenta aceptas las políticas internas de URUS Capital.
                    </p>
                </CardFooter>
            </Card>

            <div className="fixed inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
            <div className="fixed left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>
        </div>
    );
}
