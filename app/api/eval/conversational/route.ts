import { NextResponse } from "next/server";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { runConversationalEval } from "@/lib/eval/conversational-orchestrator";
import type { ConversationalEvalCategory, ConversationalRunSummary } from "@/lib/eval/conversational-types";

// In-memory store for completed runs (lightweight; no Prisma table for now)
const completedRuns: ConversationalRunSummary[] = [];

// ── GET: List previous conversational eval runs ─────────────────────────────

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const sliced = completedRuns.slice(offset, offset + limit);

  return NextResponse.json({
    runs: sliced.map((r) => ({
      runId: r.runId,
      name: r.name,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      scenarioCount: r.scenarioCount,
      trialCount: r.trialCount,
      avgOverallScore: r.avgOverallScore,
      passAtKRate: r.passAtKRate,
      passAllKRate: r.passAllKRate,
      avgLatencyMs: r.avgLatencyMs,
    })),
    total: completedRuns.length,
    limit,
    offset,
  });
};

// ── POST: Execute a conversational eval batch ───────────────────────────────

interface PostBody {
  name?: string;
  trialsPerScenario?: number;
  passThreshold?: number;
  maxLatencyMs?: number;
  regressionOnly?: boolean;
  categories?: ConversationalEvalCategory[];
  concurrency?: number;
}

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  const body = (await request.json()) as PostBody;

  const summary = await runConversationalEval({
    name: body.name ?? `Conversational Eval ${new Date().toISOString().slice(0, 16)}`,
    config: {
      trialsPerScenario: body.trialsPerScenario ?? 3,
      passThreshold: body.passThreshold ?? 0.7,
      maxLatencyMs: body.maxLatencyMs ?? 15_000,
      regressionOnly: body.regressionOnly ?? false,
      categories: body.categories,
    },
    concurrency: body.concurrency ?? 2,
  });

  completedRuns.unshift(summary);
  if (completedRuns.length > 50) completedRuns.pop();

  return NextResponse.json(summary, { status: 201 });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/eval/conversational" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/eval/conversational" },
  postHandler,
);
