import "dotenv/config";
import { enqueueJob } from "@/lib/job-queue";

async function main(): Promise<void> {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `market:normalize-batch:source_d:${minuteBucket}`;
  const job = await enqueueJob({
    type: "MARKET_NORMALIZE_BATCH",
    payload: { batchSize: 200, source: "source_d" },
    idempotencyKey,
    priority: 300,
  });
  console.log(
    "[enqueue-market-normalize-source-d]",
    JSON.stringify(
      { jobId: job.id, status: job.status, idempotencyKey, type: job.type },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[enqueue-market-normalize-source-d] fatal:", err);
  process.exit(1);
});
