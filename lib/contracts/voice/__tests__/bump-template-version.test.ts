/**
 * Tests de: `bumpVoiceRevisionTemplateVersion` (lib/contracts/voice/bump-template-version.ts)
 *
 * Qué se testea: la función pura que calcula el siguiente `templateVersion` del borrador
 * tras una revisión por voz, según si hubo cambios estructurales (`hadAppliedChanges`)
 * y el formato del string actual (sufijo `_vN`, sufijo `-vN`, o ninguno).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTRACT_TEMPLATE_VERSION } from "@/types/contracts";
import { bumpVoiceRevisionTemplateVersion } from "../bump-template-version";

describe("bumpVoiceRevisionTemplateVersion — cálculo de templateVersion post-revisión por voz", () => {
  describe("cuando hadAppliedChanges es false (el intérprete no aplicó deltas al payload)", () => {
    it("conserva la versión explícita si ya existía", () => {
      expect(bumpVoiceRevisionTemplateVersion("OP-2026-001_Arras_v3", false)).toBe("OP-2026-001_Arras_v3");
    });

    it("usa DEFAULT_CONTRACT_TEMPLATE_VERSION si no había versión en el input", () => {
      expect(bumpVoiceRevisionTemplateVersion(undefined, false)).toBe(DEFAULT_CONTRACT_TEMPLATE_VERSION);
    });

    it("no incrementa el contador aunque el string lleve _vN (no hubo cambios que justifiquen v+1)", () => {
      expect(bumpVoiceRevisionTemplateVersion("OP-2026-001_Arras_v2", false)).toBe("OP-2026-001_Arras_v2");
    });
  });

  describe("cuando hadAppliedChanges es true (sí hubo parches aplicados al ContractTemplateInput)", () => {
    it("incrementa el número final -vN (caso versión de plantilla tipo 2025.03.m8-v1)", () => {
      expect(bumpVoiceRevisionTemplateVersion("2025.03.m8-v1", true)).toBe("2025.03.m8-v2");
    });

    it("si no hay patrón -vN ni _vN, añade el sufijo _v2", () => {
      expect(bumpVoiceRevisionTemplateVersion("borrador-base", true)).toBe("borrador-base_v2");
    });

    it("incrementa _vN cuando la versión usa guion bajo antes de v (p. ej. naming OP-…_Arras_v2)", () => {
      expect(bumpVoiceRevisionTemplateVersion("OP-2026-001_Arras_v2", true)).toBe("OP-2026-001_Arras_v3");
    });

    it("incrementa _vN genérico (doc_v10 → doc_v11)", () => {
      expect(bumpVoiceRevisionTemplateVersion("doc_v10", true)).toBe("doc_v11");
    });
  });
});
