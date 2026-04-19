import { createInmovillaClient } from "../api/client";
import { loginToInmovilla } from "../auth/login";
import type { InmovillaSession } from "../auth/types";
import { assertParsedSuccess } from "./parsers";
import { writeOperationRegistry } from "./operation-registry";
import {
  InmovillaWriteError,
  type WriteOperation,
  type WriteOperationPayloadMap,
  type WriteResult,
} from "./types";

type WriteOptions = {
  session?: InmovillaSession;
  headless?: boolean;
  verify?: boolean;
  retryOnSessionExpired?: boolean;
};

function isSessionExpiredSignal(responseText: string): boolean {
  const normalized = responseText.toLowerCase();
  return (
    normalized.includes("login/es") ||
    normalized.includes("session expired") ||
    normalized.includes("inicia sesión") ||
    normalized.includes("iniciar sesión")
  );
}

async function resolveSession(options?: WriteOptions): Promise<InmovillaSession> {
  if (options?.session) return options.session;
  return loginToInmovilla({ headless: options?.headless ?? true });
}

export async function writeToInmovilla<T extends WriteOperation>(
  operation: T,
  payload: WriteOperationPayloadMap[T],
  options: WriteOptions = {},
): Promise<WriteResult> {
  const spec = writeOperationRegistry[operation];
  if (!spec) {
    throw new InmovillaWriteError(
      "VALIDATION_ERROR",
      `Operación no soportada: ${operation}`,
    );
  }

  let session = await resolveSession(options);
  let hasRetriedBySession = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const client = createInmovillaClient(session);
    const ctx = { operation, payload, session } as const;

    try {
      const preSteps = spec.preSteps ? await spec.preSteps(ctx) : [];
      for (const step of preSteps) {
        const responseText =
          step.responseMode === "json"
            ? JSON.stringify(await client.post(step.path, step.body ?? {}))
            : await client.postText(step.path, step.body ?? {});

        if (isSessionExpiredSignal(responseText)) {
          throw new InmovillaWriteError(
            "SESSION_EXPIRED",
            "La sesión de Inmovilla expiró durante un paso previo",
            { operation, path: step.path },
          );
        }
      }

      const mainStep = await spec.mainStep(ctx);
      const mainResponseText =
        mainStep.responseMode === "json"
          ? JSON.stringify(await client.post(mainStep.path, mainStep.body ?? {}))
          : await client.postText(mainStep.path, mainStep.body ?? {});

      if (isSessionExpiredSignal(mainResponseText)) {
        throw new InmovillaWriteError(
          "SESSION_EXPIRED",
          "La sesión de Inmovilla expiró durante el guardado",
          { operation, path: mainStep.path },
        );
      }

      const parsed = spec.parseMainResponse(mainResponseText);
      const { demandId } = assertParsedSuccess(parsed, mainResponseText);

      let verification: WriteResult["verification"];
      if (options.verify !== false && spec.verify && spec.parseVerify) {
        const verifyStep = await spec.verify(ctx, demandId);
        const verifyResponseText = await client.postText(
          verifyStep.path,
          verifyStep.body ?? {},
        );

        const verifyResult = spec.parseVerify(verifyResponseText, ctx);
        verification = {
          checked: true,
          field: verifyResult.field,
          expected: verifyResult.expected,
          actual: verifyResult.actual,
        };

        if (!verifyResult.ok) {
          throw new InmovillaWriteError(
            "VERIFY_MISMATCH",
            `Verificación post-escritura fallida para ${operation}`,
            { operation, demandId, verification },
          );
        }
      }

      return {
        operation,
        success: true,
        demandId,
        rawResponse: mainResponseText,
        verification,
      };
    } catch (error: unknown) {
      if (
        error instanceof InmovillaWriteError &&
        error.code === "SESSION_EXPIRED" &&
        options.retryOnSessionExpired !== false &&
        !hasRetriedBySession
      ) {
        hasRetriedBySession = true;
        session = await loginToInmovilla({ headless: options.headless ?? true });
        continue;
      }

      if (error instanceof InmovillaWriteError) {
        throw error;
      }

      throw new InmovillaWriteError(
        "NETWORK_ERROR",
        "Fallo inesperado durante writeToInmovilla",
        {
          operation,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
