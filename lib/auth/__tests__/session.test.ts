import { describe, it, expect } from "vitest";
import {
  getSession,
  HEADER_ROLE,
  HEADER_COMERCIAL_ID,
  HEADER_NOMBRE,
  type AppSession,
} from "@/lib/auth/session";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test", { headers });
}

describe("getSession", () => {
  it("returns CEO session when no headers are present", () => {
    const session = getSession(makeRequest());
    expect(session).toEqual<AppSession>({
      role: "ceo",
      comercialId: null,
      nombre: "CEO",
    });
  });

  it("returns CEO session for explicit ceo role", () => {
    const session = getSession(makeRequest({ [HEADER_ROLE]: "ceo" }));
    expect(session.role).toBe("ceo");
    expect(session.comercialId).toBeNull();
  });

  it("returns comercial session with comercialId", () => {
    const session = getSession(
      makeRequest({
        [HEADER_ROLE]: "comercial",
        [HEADER_COMERCIAL_ID]: "c123",
        [HEADER_NOMBRE]: "Ana García",
      }),
    );
    expect(session).toEqual<AppSession>({
      role: "comercial",
      comercialId: "c123",
      nombre: "Ana García",
    });
  });

  it("falls back to CEO when role=comercial but no comercialId", () => {
    const session = getSession(makeRequest({ [HEADER_ROLE]: "comercial" }));
    expect(session.role).toBe("ceo");
    expect(session.comercialId).toBeNull();
  });

  it("falls back to CEO for invalid role values", () => {
    const session = getSession(makeRequest({ [HEADER_ROLE]: "admin" }));
    expect(session.role).toBe("ceo");
  });

  it("trims whitespace from header values", () => {
    const session = getSession(
      makeRequest({
        [HEADER_ROLE]: "  comercial  ",
        [HEADER_COMERCIAL_ID]: "  c456  ",
        [HEADER_NOMBRE]: "  Pedro López  ",
      }),
    );
    expect(session.role).toBe("comercial");
    expect(session.comercialId).toBe("c456");
    expect(session.nombre).toBe("Pedro López");
  });

  it("ignores comercialId when role is ceo", () => {
    const session = getSession(
      makeRequest({
        [HEADER_ROLE]: "ceo",
        [HEADER_COMERCIAL_ID]: "c789",
      }),
    );
    expect(session.role).toBe("ceo");
    expect(session.comercialId).toBeNull();
  });

  it("uses default nombre for comercial when header is missing", () => {
    const session = getSession(
      makeRequest({
        [HEADER_ROLE]: "comercial",
        [HEADER_COMERCIAL_ID]: "c999",
      }),
    );
    expect(session.nombre).toBe("Comercial");
  });

  it("is case-insensitive for role header", () => {
    const session = getSession(
      makeRequest({
        [HEADER_ROLE]: "COMERCIAL",
        [HEADER_COMERCIAL_ID]: "c111",
      }),
    );
    expect(session.role).toBe("comercial");
    expect(session.comercialId).toBe("c111");
  });
});
