import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";

export const runtime = "nodejs";

const RequestSchema = z.object({
  propertyCode: z.string().min(1),
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { propertyCode } = parsed.data;

  const activeJob = await prisma.jobQueue.findFirst({
    where: {
      type: "RUN_PRICING_ANALYSIS",
      status: { in: ["PENDING", "IN_PROGRESS"] },
      payload: {
        path: ["propertyCode"],
        equals: propertyCode,
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, createdAt: true },
  });

  if (activeJob) {
    return NextResponse.json({
      ok: true,
      accepted: true,
      alreadyQueued: true,
      propertyCode,
      status: "processing",
    });
  }

  await enqueueJob({
    type: "RUN_PRICING_ANALYSIS",
    payload: {
      propertyCode,
      trigger: "api_manual_async",
      requestedByUserId: session.userId,
    },
    idempotencyKey: `run-pricing:manual:${propertyCode}:${Date.now()}`,
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    propertyCode,
    status: "processing",
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/pricing/analyze/async" },
  postHandler,
);
