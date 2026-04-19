"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/use-session";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

/**
 * Routes:
 *   /rendimiento/comercial/me  → redirects to Prisma-backed detail for current user
 *   /rendimiento/comercial/:id → redirects to Prisma-backed detail
 *
 * When auth is not configured (no comercialId in session), shows a message.
 */
export default function ComercialRedirectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { comercialId, isCeo, isCeoOrAdmin } = useSession();

    useEffect(() => {
        if (id === "me") {
            if (comercialId) {
                router.replace(`/platform/rendimiento/comerciales/${comercialId}`);
            } else if (isCeoOrAdmin) {
                router.replace("/platform/rendimiento/comerciales");
            }
        } else {
            router.replace(`/platform/rendimiento/comerciales/${id}`);
        }
    }, [id, comercialId, isCeoOrAdmin, router]);

    if (id === "me" && !comercialId && !isCeoOrAdmin) {
        return (
            <div className="flex items-center justify-center h-64">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center space-y-3">
                        <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
                        <p className="text-base font-semibold">Sesión no configurada</p>
                        <p className="text-sm text-muted-foreground">
                            Tu cuenta no está vinculada a un comercial. Contacta a tu administrador.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return null;
}
