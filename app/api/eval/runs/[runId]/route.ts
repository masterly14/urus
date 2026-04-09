import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { withObservedRoute } from "@/lib/observability";


const getHandler = async (_request: Request, context: { params: Promise<{ runId: string }> }) => {
  const { runId } = await context.params;

  const run = await prisma.evalRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      name: true,
      agentVersion: true,
      model: true,
      temperature: true,
      scenarioCount: true,
      avgScore: true,
      status: true,
      startedAt: true,
      completedAt: true,
      metadata: true,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const results = await prisma.evalResult.findMany({
    where: { runId },
    select: {
      category: true,
      personaId: true,
      overallScore: true,
      propertyResolutionScore: true,
      sentimentAccuracyScore: true,
      variableExtractionScore: true,
      intentionScore: true,
      wantsMoreScore: true,
      hallucinationPenalty: true,
      latencyMs: true,
      failures: true,
    },
  });

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const categoryMap = new Map<string, typeof results>();
  const personaMap = new Map<string, typeof results>();
  const failureCounts = new Map<string, number>();

  for (const r of results) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r);

    if (!personaMap.has(r.personaId)) personaMap.set(r.personaId, []);
    personaMap.get(r.personaId)!.push(r);

    for (const f of r.failures) {
      failureCounts.set(f, (failureCounts.get(f) ?? 0) + 1);
    }
  }

  const byCategory = [...categoryMap.entries()].map(([cat, items]) => ({
    category: cat,
    count: items.length,
    avgScore: avg(items.map((i) => i.overallScore)),
    avgPropertyResolution: avg(items.map((i) => i.propertyResolutionScore)),
    avgSentimentAccuracy: avg(items.map((i) => i.sentimentAccuracyScore)),
    avgVariableExtraction: avg(items.map((i) => i.variableExtractionScore)),
  }));

  const byPersona = [...personaMap.entries()].map(([pid, items]) => ({
    personaId: pid,
    count: items.length,
    avgScore: avg(items.map((i) => i.overallScore)),
  }));

  const topFailures = [...failureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([failure, count]) => ({ failure, count }));

  const aggregated = {
    avgOverallScore: avg(results.map((r) => r.overallScore)),
    avgPropertyResolution: avg(results.map((r) => r.propertyResolutionScore)),
    avgSentimentAccuracy: avg(results.map((r) => r.sentimentAccuracyScore)),
    avgVariableExtraction: avg(results.map((r) => r.variableExtractionScore)),
    avgIntention: avg(results.map((r) => r.intentionScore)),
    avgWantsMore: avg(results.map((r) => r.wantsMoreScore)),
    avgHallucination: avg(results.map((r) => r.hallucinationPenalty)),
    avgLatencyMs: avg(results.map((r) => r.latencyMs)),
  };

  return NextResponse.json({
    run,
    aggregated,
    byCategory,
    byPersona,
    topFailures,
    resultCount: results.length,
  });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/eval/runs/[runId]" }, getHandler);
