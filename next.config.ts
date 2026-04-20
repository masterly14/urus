import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici"],
  async redirects() {
    const postventaGuia = [
      {
        source: "/platform/postventa/guia",
        destination: "/platform/post-venta",
        permanent: false,
      },
    ];
    const legacyPrefixes = [
      "bi",
      "coach",
      "colaboradores",
      "configuracion",
      "eval",
      "legal",
      "matching",
      "post-venta",
      "postventa",
      "pricing",
      "rendimiento",
      "agenda",
      "post-visita",
    ] as const;
    const withPath = legacyPrefixes.map((prefix) => ({
      source: `/${prefix}/:path*`,
      destination: `/platform/${prefix}/:path*`,
      permanent: false,
    }));
    const exact = legacyPrefixes.map((prefix) => ({
      source: `/${prefix}`,
      destination: `/platform/${prefix}`,
      permanent: false,
    }));
    return [...postventaGuia, ...exact, ...withPath];
  },
};

export default nextConfig;
