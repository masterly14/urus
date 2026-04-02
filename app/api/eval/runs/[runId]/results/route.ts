import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category");
  const persona = searchParams.get("persona");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const where: Record<string, unknown> = { runId };
  if (category) where.category = category;
  if (persona) where.personaId = persona;
  if (minScore || maxScore) {
    const scoreFilter: Record<string, number> = {};
    if (minScore) scoreFilter.gte = parseFloat(minScore);
    if (maxScore) scoreFilter.lte = parseFloat(maxScore);
    where.overallScore = scoreFilter;
  }

  const [results, total] = await Promise.all([
    prisma.evalResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        scenarioId: true,
        scenarioName: true,
        category: true,
        personaId: true,
        buyerMessage: true,
        nluOutput: true,
        propertyResolutionScore: true,
        sentimentAccuracyScore: true,
        variableExtractionScore: true,
        intentionScore: true,
        wantsMoreScore: true,
        hallucinationPenalty: true,
        overallScore: true,
        judgeReasoning: true,
        failures: true,
        latencyMs: true,
        createdAt: true,
      },
    }),
    prisma.evalResult.count({ where }),
  ]);

  return NextResponse.json({ results, total, limit, offset });
}
