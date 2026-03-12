import type { InmovillaSession } from "../auth/types";

export type WriteOperation =
  | "createDemand"
  | "updateDemandEmail"
  | "updateDemandPriority";

export type CreateDemandPayload = {
  query: {
    eS?: string;
    cruce?: string;
    tipocruce?: string;
    porarea?: string;
    ref?: string;
    idi?: string;
    envConf?: "true" | "false";
  };
  body: Record<string, string>;
};

export type UpdateDemandEmailPayload = {
  demandId: string;
  demandRef: string;
  clientId: string;
  agentId: string;
  propertyTypes: string;
  email: string;
  checkContact?: {
    tipo?: string;
    elcod?: string;
    elcodcli?: string;
    fuerza?: string;
  };
  envConf?: "true" | "false";
};

export type UpdateDemandPriorityPayload = {
  demandId: string;
  demandRef: string;
  clientId: string;
  agentId: string;
  propertyTypes: string;
  priority: string;
  envConf?: "true" | "false";
};

export type WriteOperationPayloadMap = {
  createDemand: CreateDemandPayload;
  updateDemandEmail: UpdateDemandEmailPayload;
  updateDemandPriority: UpdateDemandPriorityPayload;
};

export type WriteRequestContext<T extends WriteOperation = WriteOperation> = {
  operation: T;
  payload: WriteOperationPayloadMap[T];
  session: InmovillaSession;
};

export type WriteStepRequest = {
  path: string;
  body?: Record<string, string>;
  responseMode?: "json" | "text";
};

export type WriteStepResult = {
  path: string;
  text: string;
};

export type ParsedWriteResponse = {
  success: boolean;
  demandId?: string;
  errorText?: string;
  successCode?: string;
};

export type WriteResult = {
  operation: WriteOperation;
  success: true;
  demandId: string;
  rawResponse: string;
  verification?: {
    checked: boolean;
    field?: string;
    expected?: string;
    actual?: string;
  };
};

export type WriteErrorCode =
  | "SESSION_EXPIRED"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "INMOVILLA_WRITE_ERROR"
  | "VERIFY_MISMATCH";

export class InmovillaWriteError extends Error {
  readonly code: WriteErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: WriteErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InmovillaWriteError";
    this.code = code;
    this.details = details;
  }
}

export type WriteOperationSpec<T extends WriteOperation = WriteOperation> = {
  operation: T;
  preSteps?: (
    ctx: WriteRequestContext<T>,
  ) => Array<WriteStepRequest> | Promise<Array<WriteStepRequest>>;
  mainStep: (
    ctx: WriteRequestContext<T>,
  ) => WriteStepRequest | Promise<WriteStepRequest>;
  parseMainResponse: (responseText: string) => ParsedWriteResponse;
  verify?: (
    ctx: WriteRequestContext<T>,
    demandId: string,
  ) => WriteStepRequest | Promise<WriteStepRequest>;
  parseVerify?: (
    responseText: string,
    ctx: WriteRequestContext<T>,
  ) => {
    ok: boolean;
    field?: string;
    expected?: string;
    actual?: string;
  };
};
