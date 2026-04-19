import { describe, expect, it } from "vitest";
import {
  parseNotaEncargoDescrip,
  decodeHtmlEntities,
  extractPropertyDataFromRaw,
  isCaptacionTask,
  isValidCaptacionDetail,
  parseTaskRow,
  type RawTask,
  type TaskDetail,
} from "../tasks-parser";

// ---------------------------------------------------------------------------
// parseNotaEncargoDescrip
// ---------------------------------------------------------------------------

describe("parseNotaEncargoDescrip", () => {
  it("parses exact HAR format: URUS36VMA<br />~666 777 888", () => {
    const result = parseNotaEncargoDescrip("URUS36VMA<br />~666 777 888");
    expect(result).toEqual({ ref: "URUS36VMA", phone: "666777888" });
  });

  it("parses without tilde or spaces", () => {
    const result = parseNotaEncargoDescrip("URUS09VFEDE<br />600123456");
    expect(result).toEqual({ ref: "URUS09VFEDE", phone: "600123456" });
  });

  it("parses with simple <br>", () => {
    const result = parseNotaEncargoDescrip("URUS36VMA<br>666777888");
    expect(result).toEqual({ ref: "URUS36VMA", phone: "666777888" });
  });

  it("parses with <br/> no space", () => {
    const result = parseNotaEncargoDescrip("URUS10VJG<br/>~612345678");
    expect(result).toEqual({ ref: "URUS10VJG", phone: "612345678" });
  });

  it("parses international phone with country code", () => {
    const result = parseNotaEncargoDescrip(
      "URUS50ARC<br />~34 666 777 888",
    );
    expect(result).toEqual({ ref: "URUS50ARC", phone: "34666777888" });
  });

  it("returns null for free text observations", () => {
    expect(
      parseNotaEncargoDescrip("Llamar al cliente para confirmar"),
    ).toBeNull();
  });

  it("returns null for single line with ref only", () => {
    expect(parseNotaEncargoDescrip("URUS36VMA")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseNotaEncargoDescrip("")).toBeNull();
  });

  it("returns null for invalid ref pattern", () => {
    expect(
      parseNotaEncargoDescrip("NOTURUS<br />666777888"),
    ).toBeNull();
  });

  it("returns null for non-numeric phone", () => {
    expect(
      parseNotaEncargoDescrip("URUS36VMA<br />no-phone-here"),
    ).toBeNull();
  });

  it("strips HTML tags wrapping the content", () => {
    const result = parseNotaEncargoDescrip(
      "<p>URUS22VMA</p><br /><p>~600 111 222</p>",
    );
    expect(result).toEqual({ ref: "URUS22VMA", phone: "600111222" });
  });

  it("handles &amp; and other entities in surrounding text", () => {
    const result = parseNotaEncargoDescrip(
      "URUS36VMA<br />~666777888",
    );
    expect(result).toEqual({ ref: "URUS36VMA", phone: "666777888" });
  });
});

// ---------------------------------------------------------------------------
// decodeHtmlEntities
// ---------------------------------------------------------------------------

describe("decodeHtmlEntities", () => {
  it("decodes &rarr; to →", () => {
    expect(decodeHtmlEntities("Visita &rarr; Reportaje Fotográfico")).toBe(
      "Visita → Reportaje Fotográfico",
    );
  });

  it("decodes &amp; to &", () => {
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
  });

  it("leaves plain text unchanged", () => {
    expect(decodeHtmlEntities("Captación")).toBe("Captación");
  });
});

// ---------------------------------------------------------------------------
// extractPropertyDataFromRaw
// ---------------------------------------------------------------------------

describe("extractPropertyDataFromRaw", () => {
  it("extracts full address, VENTA type and price", () => {
    const result = extractPropertyDataFromRaw(
      {
        calle: "DE LOS FLAMENCOS",
        numero: "8",
        cp: "14111",
        precioinmo: 275000,
        precioalq: 0,
      },
      { ciudad: "Córdoba", zona: "La Carlota" },
    );

    expect(result).toEqual({
      direccion: "Calle DE LOS FLAMENCOS, 8, La Carlota, Córdoba, 14111",
      tipoOperacion: "VENTA",
      precio: 275000,
    });
  });

  it("detects ALQUILER when precioalq > 0 and precioinmo = 0", () => {
    const result = extractPropertyDataFromRaw(
      { calle: "MAYOR", numero: "1", cp: "14000", precioinmo: 0, precioalq: 800 },
      { ciudad: "Córdoba", zona: "Centro" },
    );

    expect(result.tipoOperacion).toBe("ALQUILER");
    expect(result.precio).toBe(800);
  });

  it("defaults to VENTA when both prices exist", () => {
    const result = extractPropertyDataFromRaw(
      { calle: "REAL", numero: "5", cp: "14111", precioinmo: 200000, precioalq: 500 },
      { ciudad: "Córdoba", zona: "Sur" },
    );

    expect(result.tipoOperacion).toBe("VENTA");
    expect(result.precio).toBe(200000);
  });

  it("handles missing fields gracefully", () => {
    const result = extractPropertyDataFromRaw(
      {},
      { ciudad: "Córdoba", zona: "" },
    );

    expect(result.direccion).toBe("Córdoba");
    expect(result.tipoOperacion).toBe("VENTA");
    expect(result.precio).toBe(0);
  });

  it("builds address without numero", () => {
    const result = extractPropertyDataFromRaw(
      { calle: "PRINCIPAL", cp: "14111" },
      { ciudad: "Madrid", zona: "Centro" },
    );

    expect(result.direccion).toBe("Calle PRINCIPAL, Centro, Madrid, 14111");
  });
});

// ---------------------------------------------------------------------------
// isCaptacionTask
// ---------------------------------------------------------------------------

describe("isCaptacionTask", () => {
  it("returns true for 'Visita → Reportaje Fotográfico'", () => {
    const task: RawTask = {
      codigo: "1",
      fecha: "2026-04-16",
      hora: "16:00",
      nombreSeguimiento: "Visita → Reportaje Fotográfico",
      asunto: "Captación",
      nombreAgente: "Miguel",
      referenciaPropiedad: "",
      codigoPropiedad: "0",
      codigoDemanda: "0",
      duracion: "1",
      keypadre: "5143",
    };
    expect(isCaptacionTask(task)).toBe(true);
  });

  it("returns false for 'General → Apunte'", () => {
    const task: RawTask = {
      codigo: "2",
      fecha: "2026-04-16",
      hora: "10:00",
      nombreSeguimiento: "General → Apunte",
      asunto: "",
      nombreAgente: "Agent",
      referenciaPropiedad: "",
      codigoPropiedad: "0",
      codigoDemanda: "0",
      duracion: "1",
      keypadre: "100",
    };
    expect(isCaptacionTask(task)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidCaptacionDetail
// ---------------------------------------------------------------------------

describe("isValidCaptacionDetail", () => {
  const validDetail: TaskDetail = {
    codseg: 4470,
    asunto: "Captación",
    descrip: "URUS36VMA<br />~666 777 888",
    keyagente: 177892,
    keytiposeg: 53,
    fechaaviso: "2026-04-16 16:00:00",
    fechaalta: "2026-04-15 15:41:49",
    tareacerrada: 0,
    keyofe: 0,
    duracion: 1,
    confirmado: 0,
    altaagente: 212632,
    keyagente_nombre: "Miguel",
    keyagente_apellidos: "Angel Carrillo Ramos",
  };

  it("returns true for valid captación detail", () => {
    expect(isValidCaptacionDetail(validDetail)).toBe(true);
  });

  it("returns true when asunto is empty (accepted)", () => {
    expect(isValidCaptacionDetail({ ...validDetail, asunto: "" })).toBe(true);
  });

  it("returns false when tarea is closed", () => {
    expect(
      isValidCaptacionDetail({ ...validDetail, tareacerrada: 1 }),
    ).toBe(false);
  });

  it("returns false when descrip is not parseable", () => {
    expect(
      isValidCaptacionDetail({ ...validDetail, descrip: "nota simple" }),
    ).toBe(false);
  });

  it("returns true for 'captacion' without accent", () => {
    expect(
      isValidCaptacionDetail({ ...validDetail, asunto: "captacion" }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTaskRow
// ---------------------------------------------------------------------------

describe("parseTaskRow", () => {
  it("parses fields array into RawTask", () => {
    const fields = [
      { campo: "codigo", value: "4470" },
      { campo: "fecha", value: "2026-04-16" },
      { campo: "hora", value: "16:00" },
      { campo: "nombreSeguimiento", value: "Visita &rarr; Reportaje Fotográfico" },
      { campo: "asunto", value: "Captación" },
      { campo: "nombreAgente", value: "Miguel Angel Carrillo Ramos" },
      { campo: "referenciaPropiedad", value: "" },
      { campo: "codigoPropiedad", value: "0" },
      { campo: "codigoDemanda", value: "0" },
      { campo: "duracion", value: "1" },
      { campo: "keypadre", value: "5143" },
    ];

    const result = parseTaskRow(fields);

    expect(result.codigo).toBe("4470");
    expect(result.nombreSeguimiento).toBe("Visita → Reportaje Fotográfico");
    expect(result.asunto).toBe("Captación");
    expect(result.nombreAgente).toBe("Miguel Angel Carrillo Ramos");
  });

  it("handles missing fields with defaults", () => {
    const result = parseTaskRow([
      { campo: "codigo", value: "1000" },
    ]);

    expect(result.codigo).toBe("1000");
    expect(result.fecha).toBe("");
    expect(result.hora).toBe("");
    expect(result.codigoPropiedad).toBe("0");
    expect(result.duracion).toBe("1");
  });
});
