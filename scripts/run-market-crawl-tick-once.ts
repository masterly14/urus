import "dotenv/config";
import { runCrawlTick } from "@/lib/market/scheduler";

async function main(): Promise<void> {
  const result = await runCrawlTick({ batchSize: 10 });
  console.log("[run-market-crawl-tick-once]", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[run-market-crawl-tick-once] fatal:", err);
  process.exit(1);
});
