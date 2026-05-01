import { describe, expect, it } from "vitest";
import { buildIdealistaAccessBlockMessage } from "../browser";

describe("idealista access block diagnostics", () => {
  it("detecta pantalla de uso indebido y extrae ID/IP", () => {
    const message = buildIdealistaAccessBlockMessage(
      "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/",
      `idealista
Se ha detectado un uso indebido El acceso se ha bloqueado
ID: 74d8b3d6-e051-ed94-8379-67c851c7b00d
IP: 186.29.10.212`,
    );

    expect(message).toContain("Idealista ha bloqueado el acceso");
    expect(message).toContain("74d8b3d6-e051-ed94-8379-67c851c7b00d");
    expect(message).toContain("186.29.10.212");
  });

  it("no clasifica una pagina normal como bloqueo", () => {
    expect(
      buildIdealistaAccessBlockMessage(
        "https://www.idealista.com/inmueble/123/",
        "Piso en Centro 280.000€ 4 hab. 146 m²",
      ),
    ).toBeUndefined();
  });
});
