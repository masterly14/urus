import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "urus-vitest-locks");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireE2ELock(lockName: string, timeoutMs = 180_000): Promise<() => Promise<void>> {
  await mkdir(LOCK_DIR, { recursive: true });
  const lockPath = join(LOCK_DIR, `${lockName}.lock`);
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timeout adquiriendo lock E2E: ${lockPath}`);
      }
      await sleep(250);
    }
  }
}
