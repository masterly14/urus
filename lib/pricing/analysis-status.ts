import { prisma } from "@/lib/prisma";

export type PricingAnalysisStatus = "idle" | "processing" | "completed" | "failed";

interface StatusSummary {
  status: PricingAnalysisStatus;
  message?: string;
}

interface TimedStatusSummary extends StatusSummary {
  updatedAt?: Date;
}

function parsePropertyCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const code = (payload as Record<string, unknown>).propertyCode;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

export async function getPricingAnalysisStatusMap(
  propertyCodes: string[],
): Promise<Record<string, StatusSummary>> {
  const uniqueCodes = Array.from(new Set(propertyCodes.filter(Boolean)));
  if (uniqueCodes.length === 0) return {};
  const uniqueCodeSet = new Set(uniqueCodes);

  const [reports, activeJobs, failedJobs] = await Promise.all([
    prisma.pricingReport.findMany({
      where: { propertyCode: { in: uniqueCodes } },
      select: { propertyCode: true, analyzedAt: true },
    }),
    prisma.jobQueue.findMany({
      where: {
        type: "RUN_PRICING_ANALYSIS",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      select: { payload: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    prisma.jobQueue.findMany({
      where: {
        type: "RUN_PRICING_ANALYSIS",
        status: { in: ["FAILED", "DEAD_LETTER"] },
      },
      select: { payload: true, lastError: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1200,
    }),
  ]);

  const reportByCode = new Map<string, Date>();
  const processingByCode = new Map<string, Date>();
  const failedByCode = new Map<string, { message?: string; updatedAt: Date }>();

  for (const report of reports) {
    const existing = reportByCode.get(report.propertyCode);
    if (!existing || report.analyzedAt > existing) {
      reportByCode.set(report.propertyCode, report.analyzedAt);
    }
  }

  for (const job of activeJobs) {
    const code = parsePropertyCode(job.payload);
    if (!code || !uniqueCodeSet.has(code)) continue;
    const existing = processingByCode.get(code);
    if (!existing || job.updatedAt > existing) {
      processingByCode.set(code, job.updatedAt);
    }
  }

  for (const job of failedJobs) {
    const code = parsePropertyCode(job.payload);
    if (!code || !uniqueCodeSet.has(code)) continue;
    const existing = failedByCode.get(code);
    if (!existing || job.updatedAt > existing.updatedAt) {
      failedByCode.set(code, { message: job.lastError ?? undefined, updatedAt: job.updatedAt });
    }
  }

  const out: Record<string, TimedStatusSummary> = {};
  for (const code of uniqueCodes) {
    const reportAt = reportByCode.get(code);
    const processingAt = processingByCode.get(code);
    const failed = failedByCode.get(code);

    if (processingAt && (!reportAt || processingAt > reportAt)) {
      out[code] = { status: "processing", updatedAt: processingAt };
      continue;
    }

    if (reportAt) {
      out[code] = { status: "completed", updatedAt: reportAt };
      continue;
    }

    if (failed) {
      out[code] = { status: "failed", message: failed.message, updatedAt: failed.updatedAt };
      continue;
    }

    out[code] = { status: "idle" };
  }

  return out;
}

export async function getPricingAnalysisStatusForProperty(
  propertyCode: string,
): Promise<StatusSummary> {
  const statusMap = await getPricingAnalysisStatusMap([propertyCode]);
  return statusMap[propertyCode] ?? { status: "idle" };
}
