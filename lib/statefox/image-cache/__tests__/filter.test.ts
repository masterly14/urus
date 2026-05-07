import { describe, expect, it } from "vitest";
import { filterPortalCandidates } from "../filter";
import type { PortalImageCandidate } from "../types";

function c(url: string, source: PortalImageCandidate["source"] = "script"): PortalImageCandidate {
  return { url, source };
}

describe("filterPortalCandidates - idealista", () => {
  it("descarta favicons / touch icons / sprites del header", () => {
    const candidates = [
      c("https://st3.idealista.com/static/common/icons/32x32.png?20260505171328"),
      c("https://st3.idealista.com/static/common/icons/180x180.png"),
      c("https://www.idealista.com/static/common/sprite-arrows.png"),
      c("https://www.idealista.com/apple-touch-icon.png"),
      c("https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/abc.webp"),
    ];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toContain("img4.idealista.com");
  });

  it("rankea primero las URLs de fotos reales del listing", () => {
    const candidates = [
      c("https://img2.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/foto-2.webp"),
      c("https://img1.idealista.com/blur/WEB_DETAIL/0/id.pro.es.image.master/aa/bb/cc/foto-1.webp"),
      c("https://img3.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/foto-3.webp"),
    ];
    const ranked = filterPortalCandidates("idealista", candidates);
    expect(ranked[0]?.url).toContain("WEB_DETAIL");
  });

  it("acepta URLs DOM/network del CDN aunque vengan en otro orden", () => {
    const candidates = [
      c("https://img2.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/foto-2.webp", "network"),
      c("https://img2.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/foto-3.webp", "script"),
      c("https://img2.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/foto-1.webp", "dom"),
    ];
    const ranked = filterPortalCandidates("idealista", candidates);
    expect(ranked.map((x) => x.source)).toEqual(["network", "dom", "script"]);
  });

  it("deduplica variantes/extensiones de la misma foto master eligiendo la mejor calidad", () => {
    const candidates = [
      c("https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/0c/4b/78/1429933037.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL/0/id.pro.es.image.master/0c/4b/78/1429933037.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/0c/4b/78/1429933037.webp"),
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/0c/4b/78/1429933037.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL-M-L/0/id.pro.es.image.master/0c/4b/78/1429933037.jpg"),
      // Otra foto distinta
      c("https://img4.idealista.com/blur/WEB_DETAIL/0/id.pro.es.image.master/0c/4b/78/1429933038.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/0c/4b/78/1429933038.webp"),
    ];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(2);
    const paths = filtered.map((x) => x.url);
    expect(paths.every((p) => p.includes("WEB_DETAIL_TOP-L-L"))).toBe(true);
    const masters = paths.map((p) => p.split("/").slice(-1)[0]?.split(".")[0]);
    expect(new Set(masters)).toEqual(new Set(["1429933037", "1429933038"]));
  });

  it("dedup respeta el orden de calidad incluso si la mejor variante llega al final", () => {
    const candidates = [
      c("https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/cc/123.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL/0/id.pro.es.image.master/aa/bb/cc/123.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL-M-L/0/id.pro.es.image.master/aa/bb/cc/123.jpg"),
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/aa/bb/cc/123.jpg"),
    ];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toContain("WEB_DETAIL_TOP-L-L");
  });

  it("desempata variantes idénticas prefiriendo .jpg sobre .webp", () => {
    const candidates = [
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/aa/bb/cc/777.webp"),
      c("https://img4.idealista.com/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/aa/bb/cc/777.jpg"),
    ];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toMatch(/\.jpg$/);
  });

  it("descarta URLs de hosts no idealista", () => {
    const candidates = [
      c("https://otrocdn.example.com/photo.jpg"),
      c("https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/foto.webp"),
    ];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toContain("idealista.com");
  });

  it("ignora URLs malformadas sin lanzar", () => {
    const candidates = [c("not a url"), c("https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/foto.webp")];
    const filtered = filterPortalCandidates("idealista", candidates);
    expect(filtered).toHaveLength(1);
  });
});

describe("filterPortalCandidates - genérico", () => {
  it("source desconocido solo descarta el ruido obvio", () => {
    const candidates = [
      c("https://example.com/static/icons/32x32.png"),
      c("https://example.com/photo.jpg"),
    ];
    const filtered = filterPortalCandidates("unknown", candidates);
    expect(filtered.map((x) => x.url)).toEqual(["https://example.com/photo.jpg"]);
  });
});
