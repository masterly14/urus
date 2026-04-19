import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici", "@prisma/client", ".prisma/client"],
  outputFileTracingIncludes: {
    "/**/*": [
      "./app/generated/prisma/**/*",
      "./app/generated/prisma/*.node",
      "./app/generated/prisma/libquery_engine-*",
    ],
  },
  async redirects() {
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
    return [...exact, ...withPath];
  },
};

export default nextConfig;
