import { describe, expect, it } from "vitest";
import { resolveDensityBucket } from "@/lib/market/demographics";

describe("resolveDensityBucket", () => {
  it("clasifica densidad baja", () => {
    expect(resolveDensityBucket(1500)).toBe("baja");
  });

  it("clasifica densidad media", () => {
    expect(resolveDensityBucket(3200)).toBe("media");
  });

  it("clasifica densidad alta", () => {
    expect(resolveDensityBucket(7500)).toBe("alta");
  });

  it("clasifica densidad muy alta", () => {
    expect(resolveDensityBucket(12000)).toBe("muy_alta");
  });

  it("maneja valor nulo", () => {
    expect(resolveDensityBucket(null)).toBe("sin_datos");
  });
});
