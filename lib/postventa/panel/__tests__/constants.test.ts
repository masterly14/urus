import { describe, it, expect } from "vitest";
import {
  ADJUNTO_ALLOWED_EXTENSIONS,
  ADJUNTO_MAX_FILE_BYTES,
  ADJUNTO_MAX_TOTAL_BYTES,
  extractExtension,
  isAllowedExtension,
  mimeTypeForExtension,
  resourceTypeForExtension,
} from "@/lib/postventa/panel/constants";

describe("panel/constants", () => {
  describe("extractExtension", () => {
    it("devuelve la extensión en minúsculas", () => {
      expect(extractExtension("Contrato.PDF")).toBe("pdf");
      expect(extractExtension("foto.JPG")).toBe("jpg");
      expect(extractExtension("doc.tar.gz")).toBe("gz");
    });

    it("devuelve null si no hay extensión", () => {
      expect(extractExtension("archivo_sin_ext")).toBeNull();
      expect(extractExtension("")).toBeNull();
    });
  });

  describe("isAllowedExtension", () => {
    it("acepta todas las extensiones declaradas", () => {
      for (const ext of ADJUNTO_ALLOWED_EXTENSIONS) {
        expect(isAllowedExtension(ext)).toBe(true);
      }
    });

    it("rechaza extensiones peligrosas", () => {
      expect(isAllowedExtension("exe")).toBe(false);
      expect(isAllowedExtension("js")).toBe(false);
      expect(isAllowedExtension("sh")).toBe(false);
      expect(isAllowedExtension(null)).toBe(false);
    });
  });

  describe("resourceTypeForExtension", () => {
    it("imágenes -> image", () => {
      expect(resourceTypeForExtension("jpg")).toBe("image");
      expect(resourceTypeForExtension("jpeg")).toBe("image");
      expect(resourceTypeForExtension("png")).toBe("image");
      expect(resourceTypeForExtension("webp")).toBe("image");
    });

    it("documentos -> raw", () => {
      expect(resourceTypeForExtension("pdf")).toBe("raw");
      expect(resourceTypeForExtension("docx")).toBe("raw");
      expect(resourceTypeForExtension("xlsx")).toBe("raw");
    });
  });

  describe("mimeTypeForExtension", () => {
    it("asigna mime types conocidos", () => {
      expect(mimeTypeForExtension("pdf")).toBe("application/pdf");
      expect(mimeTypeForExtension("png")).toBe("image/png");
      expect(mimeTypeForExtension("docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });
  });

  describe("cuotas", () => {
    it("límites definidos y consistentes", () => {
      expect(ADJUNTO_MAX_FILE_BYTES).toBe(15 * 1024 * 1024);
      expect(ADJUNTO_MAX_TOTAL_BYTES).toBe(100 * 1024 * 1024);
      expect(ADJUNTO_MAX_TOTAL_BYTES).toBeGreaterThan(ADJUNTO_MAX_FILE_BYTES);
    });
  });
});
