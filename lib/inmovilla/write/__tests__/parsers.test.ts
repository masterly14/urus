import { describe, expect, it } from "vitest";
import {
  assertParsedSuccess,
  parseFichaFieldValue,
  parseGuardarResponse,
} from "../parsers";

describe("parseGuardarResponse", () => {
  it("debe parsear respuesta exitosa con //exito y tmprecibido", () => {
    const raw =
      "\n//exito;3\npopup('ok');\ntmprecibido='39059502'; var hayerrores=0;var hayerrorestxt='';";
    const parsed = parseGuardarResponse(raw);

    expect(parsed.success).toBe(true);
    expect(parsed.demandId).toBe("39059502");
    expect(parsed.successCode).toBe("3");
    expect(parsed.errorText).toBeUndefined();
  });

  it("debe parsear error cuando hayerrores=1", () => {
    const raw = "tmprecibido='39059502'; var hayerrores=1;var hayerrorestxt='Error+de+validacion';";
    const parsed = parseGuardarResponse(raw);

    expect(parsed.success).toBe(false);
    expect(parsed.errorText).toContain("Error");
  });

  it("assertParsedSuccess debe lanzar si la respuesta no es valida", () => {
    const parsed = parseGuardarResponse("var hayerrores=1;var hayerrorestxt='x';");

    expect(() => assertParsedSuccess(parsed, "raw response")).toThrowError(
      /Inmovilla respondió error/i,
    );
  });
});

describe("parseFichaFieldValue", () => {
  it("debe extraer un campo de clientes desde arrficha", () => {
    const raw =
      "arrficha[\"fichacliente\"][\"39059502\"]= new Array ('-.TABLA.-','demandas.','cod_dem','39059502','-.TABLA.-','clientes.','email','test@example.com');";

    const email = parseFichaFieldValue(raw, "clientes", "email");
    expect(email).toBe("test@example.com");
  });
});
