import { describe, expect, it } from "vitest";
import { extractImageCandidatesFromText } from "../extract";

describe("extractImageCandidatesFromText", () => {
  it("captura URLs de imágenes en JSON embebido y deduplica", () => {
    const html = `
      window.__NEXT_DATA__ = {"props":{"img":"https:\\/\\/img4.idealista.com\\/blur\\/WEB_LISTING\\/0\\/id.pro.es.image.master\\/0c\\/49\\/12345.webp"}};
      <img src="https://img4.idealista.com/foto.jpg" />
      var bg = "https://img4.idealista.com/foto.jpg";
      var avatar = "https://example.com/icons/avatar.png";
    `;
    const result = extractImageCandidatesFromText(html);
    const urls = result.map((c) => c.url);

    expect(urls).toContain("https://img4.idealista.com/foto.jpg");
    expect(urls).toContain("https://example.com/icons/avatar.png");
    expect(urls).toContain(
      "https://img4.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/0c/49/12345.webp",
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("ignora rutas no http(s)", () => {
    const html = `var src = "data:image/png;base64,abc"; var s = "/relativa/foto.jpg";`;
    expect(extractImageCandidatesFromText(html)).toHaveLength(0);
  });
});
