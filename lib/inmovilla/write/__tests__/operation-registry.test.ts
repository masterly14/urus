import { describe, expect, it } from "vitest";
import { writeOperationRegistry } from "../operation-registry";

const session = {
  l: "token-l",
  idPestanya: "210504_123",
  miid: "11636.210504.x.y_11636",
  idUsuario: "210504",
  numAgencia: "11636",
  cookies: [],
};

describe("writeOperationRegistry", () => {
  it("debe construir createDemand con SoyNuevo=1", async () => {
    const spec = writeOperationRegistry.createDemand;
    const step = await spec.mainStep({
      operation: "createDemand",
      session,
      payload: {
        query: {},
        body: { "demandas-keyagente": "210504" },
      },
    });

    expect(step.path).toContain("/new/app/guardar/guardar.php?");
    expect(step.path).toContain("SoyNuevo=1");
    expect(step.responseMode).toBe("text");
  });

  it("debe construir updateDemandEmail sin SoyNuevo", async () => {
    const spec = writeOperationRegistry.updateDemandEmail;
    const step = await spec.mainStep({
      operation: "updateDemandEmail",
      session,
      payload: {
        demandId: "39059502",
        demandRef: "1082",
        clientId: "58253348",
        agentId: "210504",
        propertyTypes: "2799,3399",
        email: "test@example.com",
      },
    });

    expect(step.path).toContain("/new/app/guardar/guardar.php?");
    expect(step.path).not.toContain("SoyNuevo=1");
    expect(step.body?.["clientes-email"]).toBe("test@example.com");
  });

  it("debe construir updateDemandPriority con demandas-prioridad", async () => {
    const spec = writeOperationRegistry.updateDemandPriority;
    const step = await spec.mainStep({
      operation: "updateDemandPriority",
      session,
      payload: {
        demandId: "39059502",
        demandRef: "1082",
        clientId: "58253348",
        agentId: "210504",
        propertyTypes: "2799,3399",
        priority: "5",
      },
    });

    expect(step.body?.["demandas-prioridad"]).toBe("5");
    expect(step.path).toContain("envConf=false");
  });
});
