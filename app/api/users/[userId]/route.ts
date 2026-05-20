import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createManualSyncTasks } from "@/lib/comercial/create-manual-sync-tasks";

type TransferTarget = {
  id: string;
  nombre: string;
  inmovillaAgentId: number | null;
};

type Params = { params: Promise<{ userId: string }> };

/**
 * DELETE /api/users/:userId — Solo CEO/Admin. Solo permite eliminar usuarios comerciales.
 *
 * Body JSON opcional: { transferTo?: string }
 *   - transferTo: id interno del Comercial destino. Si se proporciona, las
 *     propiedades y demandas del comercial eliminado se reasignan a ese comercial
 *     en BD y se crean tareas manuales obligatorias para sincronizar el cambio
 *     en Inmovilla. Si no se proporciona, los comercialId se ponen a null.
 *
 * Limpieza completa al eliminar:
 *  1. (Opcional) Reasigna PropertyCurrent.comercialId → transferTo ?? null.
 *  2. (Opcional) Reasigna DemandCurrent.comercialId → transferTo ?? null.
 *  3. Desvincula Referral.comercialId → null (siempre; los referrals no se transfieren).
 *  4. Elimina el Comercial vinculado (Invitation y MarketListing usan onDelete:SetNull).
 *  5. Elimina el User.
 *  6. Invalida la caché "users-list".
 *  7. Si transferTo: crea tareas manuales de sincronización en Inmovilla para
 *     propiedades y demandas.
 *
 * Respuesta:
 *  {
 *    ok: true,
 *    transferred: { properties: number; demands: number },
 *    manualTasks: { total: number; properties: number; demands: number }
 *  }
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  if (session.user.role !== "ceo" && session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  const { userId } = await params;

  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: "Usuario inválido" }, { status: 400 });
  }

  if (session.user.id === userId) {
    return NextResponse.json(
      { ok: false, error: "No puedes eliminar tu propia cuenta" },
      { status: 400 },
    );
  }

  // --- Leer body para transferTo (opcional) ---
  let transferToId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.transferTo === "string" && body.transferTo.trim()) {
      transferToId = body.transferTo.trim();
    }
  } catch {
    // Body vacío o no JSON — sin transferTo
  }

  // --- Validar usuario a eliminar ---
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, comercialId: true },
  });

  if (!target) {
    return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
  }

  if (target.role !== "comercial") {
    return NextResponse.json(
      { ok: false, error: "Solo se pueden eliminar usuarios con rol comercial" },
      { status: 400 },
    );
  }

  // --- Validar comercial destino si se indicó transferTo ---
  let transferTarget: TransferTarget | null = null;
  if (transferToId) {
    if (transferToId === target.comercialId) {
      return NextResponse.json(
        { ok: false, error: "El comercial destino no puede ser el mismo que el comercial eliminado" },
        { status: 400 },
      );
    }

    const destinoComercial = await prisma.comercial.findUnique({
      where: { id: transferToId },
      select: { id: true, nombre: true, inmovillaAgentId: true, activo: true },
    });

    if (!destinoComercial) {
      return NextResponse.json(
        { ok: false, error: "Comercial destino no encontrado" },
        { status: 400 },
      );
    }

    if (!destinoComercial.activo) {
      return NextResponse.json(
        { ok: false, error: "El comercial destino no está activo" },
        { status: 400 },
      );
    }

    transferTarget = {
      id: destinoComercial.id,
      nombre: destinoComercial.nombre,
      inmovillaAgentId: destinoComercial.inmovillaAgentId,
    };
  }

  // --- Leer propiedades y demandas ANTES de la transacción ---
  // Necesario porque la TX actualizará los comercialId y ya no podríamos filtrar
  // por el id del comercial que se va a eliminar.
  const comercialId = target.comercialId;

  const properties = comercialId
    ? await prisma.propertyCurrent.findMany({
        where: { comercialId },
        select: { codigo: true, ref: true },
      })
    : [];

  const demands = comercialId
    ? await prisma.demandCurrent.findMany({
        where: { comercialId },
        select: { codigo: true, ref: true, tipos: true },
      })
    : [];

  // --- Transacción: reasignar + eliminar ---
  await prisma.$transaction(async (tx) => {
    if (comercialId) {
      const nuevoCId = transferTarget?.id ?? null;

      await tx.propertyCurrent.updateMany({
        where: { comercialId },
        data: { comercialId: nuevoCId },
      });
      await tx.demandCurrent.updateMany({
        where: { comercialId },
        data: { comercialId: nuevoCId },
      });
      // Los Referrals siempre se desvinculan; no tiene sentido transferirlos
      // porque son relaciones de captación del comercial eliminado.
      await tx.referral.updateMany({
        where: { comercialId },
        data: { comercialId: null, assignedAt: null },
      });

      // Eliminar el Comercial (Invitation y MarketListing usan onDelete:SetNull).
      await tx.comercial.delete({ where: { id: comercialId } });
    }

    // Eliminar el User al final (sus sesiones y cuentas tienen onDelete:Cascade).
    await tx.user.delete({ where: { id: userId } });
  });

  // Invalidar caché para que /api/comerciales y /api/users devuelvan datos frescos.
  revalidateTag("users-list", { expire: 0 });

  let manualTasks = { total: 0, properties: 0, demands: 0 };
  if (transferTarget) {
    manualTasks = await createManualSyncTasks({
      properties,
      demands,
      target: transferTarget,
      createdByUserId: session.user.id,
      sourceUserId: userId,
    });
  }

  return NextResponse.json({
    ok: true,
    transferred: {
      properties: properties.length,
      demands: demands.length,
    },
    manualTasks,
  });
}
