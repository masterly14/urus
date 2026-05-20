import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  ManualSyncTaskStatus,
  ManualSyncTaskType,
  Prisma,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SessionRole = "ceo" | "admin" | "comercial";

const STATUS_VALUES = new Set(Object.values(ManualSyncTaskStatus));
const TYPE_VALUES = new Set(Object.values(ManualSyncTaskType));

function normalizeRole(role: string | null | undefined): SessionRole | null {
  if (role === "ceo" || role === "admin" || role === "comercial") return role;
  return null;
}

async function resolveActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { error: "No autenticado", status: 401 as const };

  const role = normalizeRole(session.user.role);
  if (!role) return { error: "Rol inválido", status: 403 as const };

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, comercialId: true },
  });

  if (!actor) return { error: "Usuario no encontrado", status: 404 as const };

  return { actor, role } as const;
}

function parseStatus(param: string | null) {
  if (!param) return null;
  return STATUS_VALUES.has(param as ManualSyncTaskStatus)
    ? (param as ManualSyncTaskStatus)
    : "invalid";
}

function parseType(param: string | null) {
  if (!param) return null;
  return TYPE_VALUES.has(param as ManualSyncTaskType) ? (param as ManualSyncTaskType) : "invalid";
}

export async function GET(request: NextRequest) {
  const actorResult = await resolveActor();
  if ("error" in actorResult) {
    return NextResponse.json({ ok: false, error: actorResult.error }, { status: actorResult.status });
  }

  const { role, actor } = actorResult;
  const { searchParams } = new URL(request.url);

  const status = parseStatus(searchParams.get("status"));
  if (status === "invalid") {
    return NextResponse.json({ ok: false, error: "Filtro status inválido" }, { status: 400 });
  }

  const type = parseType(searchParams.get("type"));
  if (type === "invalid") {
    return NextResponse.json({ ok: false, error: "Filtro type inválido" }, { status: 400 });
  }

  const targetComercialId = searchParams.get("targetComercialId")?.trim() || null;
  const search = searchParams.get("search")?.trim() || "";
  const parsedLimit = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 300) : 100;

  if (role === "comercial" && !actor.comercialId) {
    return NextResponse.json({
      ok: true,
      tasks: [],
      counts: { pending: 0, inProgress: 0, blocked: 0, doneToday: 0, total: 0 },
    });
  }

  const where: Prisma.ManualSyncTaskWhereInput = {};
  if (status) where.status = status;
  if (type) where.type = type;

  if (role === "comercial") {
    where.targetComercialId = actor.comercialId!;
  } else if (targetComercialId) {
    where.targetComercialId = targetComercialId;
  }

  if (search) {
    where.OR = [
      { recordCode: { contains: search, mode: "insensitive" } },
      { recordRef: { contains: search, mode: "insensitive" } },
      { targetComercialName: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  const [tasks, grouped, doneToday] = await Promise.all([
    prisma.manualSyncTask.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: limit,
    }),
    prisma.manualSyncTask.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.manualSyncTask.count({
      where: {
        ...where,
        status: ManualSyncTaskStatus.DONE,
        doneAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  const countsByStatus = grouped.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});
  const totalCount = Object.values(countsByStatus).reduce((sum, value) => sum + value, 0);

  return NextResponse.json({
    ok: true,
    tasks,
    counts: {
      pending: countsByStatus.PENDING ?? 0,
      inProgress: countsByStatus.IN_PROGRESS ?? 0,
      blocked: countsByStatus.BLOCKED ?? 0,
      doneToday,
      total: totalCount,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const actorResult = await resolveActor();
  if ("error" in actorResult) {
    return NextResponse.json({ ok: false, error: actorResult.error }, { status: actorResult.status });
  }

  const { role, actor } = actorResult;
  const body = (await request.json().catch(() => null)) as
    | { id?: string; status?: string; note?: string }
    | null;

  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id es obligatorio" }, { status: 400 });
  }

  const status = body?.status?.trim() as ManualSyncTaskStatus | undefined;
  if (!status || !STATUS_VALUES.has(status)) {
    return NextResponse.json({ ok: false, error: "status inválido" }, { status: 400 });
  }

  if (status === ManualSyncTaskStatus.DONE) {
    return NextResponse.json(
      { ok: false, error: "Para cerrar usa /api/sync-tasks/[id]/complete" },
      { status: 400 },
    );
  }

  if (role === "comercial" && status === ManualSyncTaskStatus.PENDING) {
    return NextResponse.json(
      { ok: false, error: "Solo CEO/Admin pueden reabrir tareas" },
      { status: 403 },
    );
  }

  const task = await prisma.manualSyncTask.findUnique({
    where: { id },
    select: { id: true, targetComercialId: true },
  });
  if (!task) {
    return NextResponse.json({ ok: false, error: "Tarea no encontrada" }, { status: 404 });
  }

  if (role === "comercial" && actor.comercialId !== task.targetComercialId) {
    return NextResponse.json({ ok: false, error: "Sin permisos para esta tarea" }, { status: 403 });
  }

  const note = body?.note?.trim() ?? "";
  const updated = await prisma.manualSyncTask.update({
    where: { id },
    data: {
      status,
      note,
      doneAt: null,
      doneByUserId: null,
    },
  });

  return NextResponse.json({ ok: true, task: updated });
}
