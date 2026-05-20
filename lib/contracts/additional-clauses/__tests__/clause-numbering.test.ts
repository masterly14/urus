import { describe, expect, it } from "vitest";
import {
  listAdditionalClauseSegments,
  removeAdditionalClauseByNumber,
} from "../clause-numbering";
import type { AdditionalClausesDoc } from "../types";

const SAMPLE_DOC: AdditionalClausesDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "CLAUSULA 8.- PRUEBA UNO", marks: [{ type: "bold" }] }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Texto de la primera cláusula." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "CLAUSULA 9.- PRUEBA DOS", marks: [{ type: "bold" }] }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Texto de la segunda cláusula." }],
    },
  ],
};

describe("clause-numbering helpers", () => {
  it("lista segmentos de cláusulas con su rango de bloques", () => {
    const clauses = listAdditionalClauseSegments(SAMPLE_DOC);
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toMatchObject({
      number: 8,
      headingText: "CLAUSULA 8.- PRUEBA UNO",
      startBlockIndex: 0,
      endBlockIndex: 1,
    });
    expect(clauses[1]).toMatchObject({
      number: 9,
      headingText: "CLAUSULA 9.- PRUEBA DOS",
      startBlockIndex: 2,
      endBlockIndex: 3,
    });
  });

  it("elimina una cláusula completa por número", () => {
    const nextDoc = removeAdditionalClauseByNumber(SAMPLE_DOC, 8);
    expect(nextDoc).not.toBeNull();
    expect(listAdditionalClauseSegments(nextDoc)).toHaveLength(1);
    expect(listAdditionalClauseSegments(nextDoc)[0]?.number).toBe(9);
  });

  it("retorna null cuando se elimina la única cláusula", () => {
    const oneClauseDoc: AdditionalClausesDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "CLAUSULA 8.- UNICA", marks: [{ type: "bold" }] }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Contenido" }],
        },
      ],
    };
    expect(removeAdditionalClauseByNumber(oneClauseDoc, 8)).toBeNull();
  });
});
