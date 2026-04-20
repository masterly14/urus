import { describe, it, expect } from "vitest";
import {
  canDeleteAdjunto,
  canDeleteChecklistItem,
  canMutateNota,
  canViewNota,
  isPrivileged,
} from "@/lib/postventa/panel/access";

describe("panel/access", () => {
  const ceo = { role: "ceo" as const, userId: "user-ceo" };
  const admin = { role: "admin" as const, userId: "user-admin" };
  const comercial = { role: "comercial" as const, userId: "user-com-1" };
  const otherComercial = { role: "comercial" as const, userId: "user-com-2" };

  describe("isPrivileged", () => {
    it("CEO y admin son privilegiados", () => {
      expect(isPrivileged("ceo")).toBe(true);
      expect(isPrivileged("admin")).toBe(true);
    });

    it("comercial NO es privilegiado", () => {
      expect(isPrivileged("comercial")).toBe(false);
    });
  });

  describe("canViewNota", () => {
    it("CEO ve cualquier nota", () => {
      expect(canViewNota(ceo, { authorUserId: "user-com-1" })).toBe(true);
      expect(canViewNota(ceo, { authorUserId: "user-com-2" })).toBe(true);
    });

    it("admin ve cualquier nota", () => {
      expect(canViewNota(admin, { authorUserId: "user-com-1" })).toBe(true);
    });

    it("comercial solo ve las suyas", () => {
      expect(canViewNota(comercial, { authorUserId: comercial.userId })).toBe(true);
      expect(canViewNota(comercial, { authorUserId: otherComercial.userId })).toBe(
        false,
      );
    });
  });

  describe("canMutateNota", () => {
    it("CEO puede editar/eliminar cualquier nota", () => {
      expect(canMutateNota(ceo, { authorUserId: "user-com-1" })).toBe(true);
    });

    it("autor puede mutar la suya", () => {
      expect(canMutateNota(comercial, { authorUserId: comercial.userId })).toBe(
        true,
      );
    });

    it("comercial no autor no puede mutar", () => {
      expect(
        canMutateNota(comercial, { authorUserId: otherComercial.userId }),
      ).toBe(false);
    });
  });

  describe("canDeleteChecklistItem", () => {
    it("CEO puede eliminar cualquier ítem", () => {
      expect(
        canDeleteChecklistItem(ceo, { createdByUserId: "user-com-1" }),
      ).toBe(true);
    });

    it("solo el creador o un privilegiado puede eliminar", () => {
      expect(
        canDeleteChecklistItem(comercial, { createdByUserId: comercial.userId }),
      ).toBe(true);
      expect(
        canDeleteChecklistItem(comercial, {
          createdByUserId: otherComercial.userId,
        }),
      ).toBe(false);
    });
  });

  describe("canDeleteAdjunto", () => {
    it("CEO puede eliminar cualquier adjunto", () => {
      expect(
        canDeleteAdjunto(ceo, { uploadedByUserId: "user-com-1" }),
      ).toBe(true);
    });

    it("autor puede eliminar el suyo", () => {
      expect(
        canDeleteAdjunto(comercial, { uploadedByUserId: comercial.userId }),
      ).toBe(true);
    });

    it("comercial no autor no puede eliminar", () => {
      expect(
        canDeleteAdjunto(comercial, {
          uploadedByUserId: otherComercial.userId,
        }),
      ).toBe(false);
    });
  });
});
