/**
 * Image Worker — entrypoint para Railway.
 *
 * Levanta un servidor HTTP minimalista (sin Next.js) que expone el contrato
 * documentado en `lib/workers/contracts/image-worker.ts`:
 *
 *  - POST /internal/image-import/run   → ejecuta el import de un comparable.
 *  - GET  /internal/health             → métricas básicas.
 *
 * Variables de entorno relevantes:
 *  - PORT                        (default 8080)
 *  - IMAGE_WORKER_SECRET         (REQUIRED — debe coincidir con el cliente)
 *  - IMAGE_WORKER_CONCURRENCY    (default 2)
 *  - IMAGE_WORKER_DEADLINE_MS    (default 4500)
 */

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import {
  IMAGE_WORKER_HEALTH_PATH,
  IMAGE_WORKER_RUN_PATH,
  IMAGE_WORKER_TRACE_HEADER,
} from "../lib/workers/contracts";
import { ImageWorkerRuntime } from "../lib/workers/image-worker";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.IMAGE_WORKER_SECRET?.trim();
const CONCURRENCY = Number(process.env.IMAGE_WORKER_CONCURRENCY ?? "2");
const DEADLINE_MS = Number(process.env.IMAGE_WORKER_DEADLINE_MS ?? "4500");

if (!SECRET) {
  console.error("[image-worker] IMAGE_WORKER_SECRET es obligatorio. Abortando.");
  process.exit(1);
}

const runtime = new ImageWorkerRuntime({
  secret: SECRET,
  concurrency: Number.isFinite(CONCURRENCY) ? CONCURRENCY : 2,
  defaultDeadlineMs: Number.isFinite(DEADLINE_MS) ? DEADLINE_MS : 4500,
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(payload).toString());
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const traceId = (req.headers[IMAGE_WORKER_TRACE_HEADER.toLowerCase()] as string | undefined) ?? null;

  if (req.method === "GET" && url.pathname === IMAGE_WORKER_HEALTH_PATH) {
    jsonResponse(res, 200, runtime.health());
    return;
  }

  if (req.method === "POST" && url.pathname === IMAGE_WORKER_RUN_PATH) {
    const headerName = runtime.authHeaderName().toLowerCase();
    const secretHeader = req.headers[headerName] as string | undefined;
    if (!runtime.isAuthorized(secretHeader)) {
      jsonResponse(res, 401, { errorReason: "Unauthorized" });
      return;
    }

    let body: unknown;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      jsonResponse(res, 400, {
        errorReason: `Body inválido: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const validation = runtime.validatePayload(body);
    if (!validation.ok) {
      jsonResponse(res, validation.status, { errorReason: validation.error });
      return;
    }

    try {
      const startedAt = Date.now();
      const result = await runtime.runImageImport({ ...validation.data, traceId: validation.data.traceId ?? traceId ?? undefined });
      console.log(
        `[image-worker] ${result.status} statefoxId=${validation.data.statefoxId} elapsedMs=${Date.now() - startedAt} trace=${traceId ?? "-"}`,
      );
      jsonResponse(res, 200, result);
    } catch (err) {
      console.error("[image-worker] Error fatal:", err);
      jsonResponse(res, 500, {
        errorReason: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  jsonResponse(res, 404, { errorReason: "Not Found" });
});

server.listen(PORT, () => {
  console.log(
    `[image-worker] escuchando en :${PORT} concurrency=${CONCURRENCY} deadlineMs=${DEADLINE_MS}`,
  );
});

function shutdown(signal: string): void {
  console.log(`[image-worker] recibida ${signal}, cerrando servidor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
