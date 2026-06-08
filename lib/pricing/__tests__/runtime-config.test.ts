import { afterEach, describe, expect, it } from "vitest";
import {
  getPricingMinRawComparablesBeforeStop,
  getPricingStatefoxMaxPages,
  shouldSkipComparableImageHydrate,
} from "../runtime-config";

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe("runtime-config", () => {
  it("limita páginas para análisis manual async", () => {
    process.env.PRICING_STATEFOX_MAX_PAGES = "12";
    process.env.PRICING_MANUAL_MAX_PAGES = "10";
    expect(getPricingStatefoxMaxPages("api_manual_async")).toBe(10);
  });

  it("usa buffer de candidatos en bruto antes de parar snapshot", () => {
    expect(getPricingMinRawComparablesBeforeStop(5)).toBeGreaterThanOrEqual(15);
  });

  it("omite hidratación de imágenes por defecto", () => {
    delete process.env.PRICING_SKIP_COMPARABLE_IMAGE_HYDRATE;
    expect(shouldSkipComparableImageHydrate()).toBe(true);
  });
});
