import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendNoStockAvailableToBuyer, setTestSendInterceptor } from "../send";

type CapturedMessage = {
  to: string;
  type: string;
  payload: unknown;
};

describe("sendNoStockAvailableToBuyer", () => {
  let captured: CapturedMessage[] = [];

  beforeEach(() => {
    captured = [];
    setTestSendInterceptor((msg) => {
      captured.push({ to: msg.to, type: msg.type, payload: msg.payload });
    });
  });

  afterEach(() => {
    setTestSendInterceptor(null);
  });

  it("incluye el enlace a la selección previa cuando existe y saluda por el primer nombre", async () => {
    await sendNoStockAvailableToBuyer("34600111222", {
      demandNombre: "María Pérez López",
      currentSelectionUrl: "https://app.example.com/seleccion/tok123",
    });

    expect(captured).toHaveLength(1);
    const msg = captured[0];
    expect(msg.to).toBe("34600111222");
    expect(msg.type).toBe("text");
    const body = (msg.payload as { body: string }).body;
    expect(body).toContain("Hola María,");
    expect(body).toContain("no he encontrado opciones nuevas");
    expect(body).toContain("https://app.example.com/seleccion/tok123");
    expect(body).toMatch(/presupuesto|zona|metros|habitaciones/i);
  });

  it("cuando no hay selección previa, invita a ajustar criterios sin pegar enlaces rotos", async () => {
    await sendNoStockAvailableToBuyer("34600111222", {
      demandNombre: "Carlos",
      currentSelectionUrl: null,
    });

    expect(captured).toHaveLength(1);
    const body = (captured[0].payload as { body: string }).body;
    expect(body).toContain("Hola Carlos,");
    expect(body).not.toContain("http");
    expect(body).toContain("no he encontrado propiedades");
    expect(body).toMatch(/presupuesto|zona|metros|habitaciones/i);
  });

  it("omite el nombre si demandNombre está vacío", async () => {
    await sendNoStockAvailableToBuyer("34600111222", {
      demandNombre: "",
      currentSelectionUrl: null,
    });

    const body = (captured[0].payload as { body: string }).body;
    expect(body.startsWith("Hola,")).toBe(true);
  });
});
