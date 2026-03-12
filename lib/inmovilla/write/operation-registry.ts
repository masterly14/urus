import { parseGuardarResponse } from "./parsers";
import { verifyDemandEmail, verifyDemandPriority } from "./verify";
import type {
  WriteOperation,
  WriteOperationSpec,
  WriteRequestContext,
} from "./types";

function buildCacheToken(numAgencia: string): string {
  return `${numAgencia}.${Date.now()}.2`;
}

function toQueryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function buildFichaClientePath(ctx: WriteRequestContext, demandId: string): string {
  const query = toQueryString({
    eS: "0",
    cache: buildCacheToken(ctx.session.numAgencia),
  });
  return `/new/app/cargas/fichacliente/fichacliente.php?${query}`;
}

const createDemandSpec: WriteOperationSpec<"createDemand"> = {
  operation: "createDemand",
  preSteps: () => [
    {
      path: "/new/app/api/v1/fichas/demandas/index.php",
      body: { accion: "ver", tipo: "camposlistado" },
      responseMode: "text",
    },
  ],
  mainStep: ({ payload, session }) => {
    const query = toQueryString({
      eS: payload.query.eS ?? "0",
      cruce: payload.query.cruce ?? "2",
      tipocruce: payload.query.tipocruce ?? "1",
      porarea: payload.query.porarea ?? "1",
      ref: payload.query.ref ?? ".auto_3.",
      idi: payload.query.idi ?? "1",
      envConf: payload.query.envConf ?? "true",
      SoyNuevo: "1",
      cache: buildCacheToken(session.numAgencia),
    });

    return {
      path: `/new/app/guardar/guardar.php?${query}`,
      body: payload.body,
      responseMode: "text",
    };
  },
  parseMainResponse: parseGuardarResponse,
  verify: (ctx, demandId) => ({
    path: buildFichaClientePath(ctx, demandId),
    body: {
      crwhere: `demandas.cod_dem;=;${demandId};`,
      otraagencia: "",
    },
    responseMode: "text",
  }),
  parseVerify: () => ({ ok: true }),
};

const updateDemandEmailSpec: WriteOperationSpec<"updateDemandEmail"> = {
  operation: "updateDemandEmail",
  preSteps: ({ payload, session }) => {
    const query = toQueryString({
      eS: "0",
      cache: buildCacheToken(session.numAgencia),
    });

    return [
      {
        path: `/new/app/cargas/compruebacontacto.php?${query}`,
        body: {
          email: payload.email,
          tipo: payload.checkContact?.tipo ?? "nox",
          elcod: payload.checkContact?.elcod ?? "",
          elcodcli: payload.checkContact?.elcodcli ?? "",
          fuerza: payload.checkContact?.fuerza ?? "1",
        },
        responseMode: "text",
      },
    ];
  },
  mainStep: ({ payload, session }) => {
    const query = toQueryString({
      eS: "0",
      tipocruce: "1",
      porarea: "1",
      ref: payload.demandRef,
      idi: "1",
      envConf: payload.envConf ?? "true",
      cache: buildCacheToken(session.numAgencia),
    });

    return {
      path: `/new/app/guardar/guardar.php?${query}`,
      body: {
        tipopropiedad: payload.propertyTypes,
        "demandas-cod_dempriclave": payload.demandId,
        "clientes-cod_clipriclave": payload.clientId,
        "demandas-keycliclaveext": payload.clientId,
        "clientes-email": payload.email,
        envConfCorreo: "1",
        nbclave: "demandas.cod_dem",
        antagente: payload.agentId,
      },
      responseMode: "text",
    };
  },
  parseMainResponse: parseGuardarResponse,
  verify: (ctx, demandId) => ({
    path: buildFichaClientePath(ctx, demandId),
    body: {
      crwhere: `demandas.cod_dem;=;${demandId};`,
      otraagencia: "",
    },
    responseMode: "text",
  }),
  parseVerify: (responseText, ctx) =>
    verifyDemandEmail(responseText, ctx.payload.email),
};

const updateDemandPrioritySpec: WriteOperationSpec<"updateDemandPriority"> = {
  operation: "updateDemandPriority",
  mainStep: ({ payload, session }) => {
    const query = toQueryString({
      eS: "0",
      tipocruce: "1",
      porarea: "1",
      ref: payload.demandRef,
      idi: "1",
      envConf: payload.envConf ?? "false",
      cache: buildCacheToken(session.numAgencia),
    });

    return {
      path: `/new/app/guardar/guardar.php?${query}`,
      body: {
        "demandas-prioridad": payload.priority,
        tipopropiedad: payload.propertyTypes,
        "demandas-cod_dempriclave": payload.demandId,
        "clientes-cod_clipriclave": payload.clientId,
        "demandas-keycliclaveext": payload.clientId,
        nbclave: "demandas.cod_dem",
        antagente: payload.agentId,
      },
      responseMode: "text",
    };
  },
  parseMainResponse: parseGuardarResponse,
  verify: (ctx, demandId) => ({
    path: buildFichaClientePath(ctx, demandId),
    body: {
      crwhere: `demandas.cod_dem;=;${demandId};`,
      otraagencia: "",
    },
    responseMode: "text",
  }),
  parseVerify: (responseText, ctx) =>
    verifyDemandPriority(responseText, ctx.payload.priority),
};

export const writeOperationRegistry: {
  [K in WriteOperation]: WriteOperationSpec<K>;
} = {
  createDemand: createDemandSpec,
  updateDemandEmail: updateDemandEmailSpec,
  updateDemandPriority: updateDemandPrioritySpec,
};
