import { NextResponse } from "next/server";
import { getDashboardColaboradores } from "@/lib/operacion/colaboradores/dashboard-queries";
import { prisma } from "@/lib/prisma";
import type { ColaboradoresRecommendation } from "@/lib/operacion/colaboradores/recommendation-types";

/**
 * GET /api/colaboradores/dashboard — Payload completo del dashboard de colaboradores.
 * Incluye resumen global, ranking por facturación vinculada, métricas por tipo,
 * y la última recomendación IA generada (si existe).
 */
export async function GET() {
  try {
    const [payload, lastRecoEvent] = await Promise.all([
      getDashboardColaboradores(),
      prisma.event.findFirst({
        where: { type: "COLABORADOR_RECOMENDACION_GENERADA" },
        orderBy: { occurredAt: "desc" },
        select: { payload: true, occurredAt: true },
      }),
    ]);

    let ultimaRecomendacion: ColaboradoresRecommendation | null = null;
    let recomendacionGeneradaAt: string | null = null;

    if (lastRecoEvent) {
      const p = lastRecoEvent.payload as Record<string, unknown>;
      ultimaRecomendacion = {
        diagnostico: p.diagnostico as string,
        recomendaciones: p.recomendaciones as ColaboradoresRecommendation["recomendaciones"],
        resumen_ejecutivo: p.resumen_ejecutivo as string,
        confidence: p.confidence as number,
        reasoning: p.reasoning as string,
      };
      recomendacionGeneradaAt = lastRecoEvent.occurredAt.toISOString();
    }

    return NextResponse.json({
      ...payload,
      ultimaRecomendacion,
      recomendacionGeneradaAt,
    });
  } catch (error) {
    console.error("[colaboradores/dashboard] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener dashboard de colaboradores" },
      { status: 500 },
    );
  }
}
