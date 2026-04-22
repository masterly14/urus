import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.inmovilla.com" },
      { protocol: "https", hostname: "**.apinmo.com" },
      { protocol: "https", hostname: "img3.idealista.com" },
      { protocol: "https", hostname: "img4.idealista.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async redirects() {
    const postventaToOperaciones = [
      {
        source: "/platform/post-venta/:path*",
        destination: "/platform/operaciones",
        permanent: false,
      },
      {
        source: "/platform/post-venta",
        destination: "/platform/operaciones",
        permanent: false,
      },
      {
        source: "/platform/postventa/:path*",
        destination: "/platform/operaciones",
        permanent: false,
      },
      {
        source: "/platform/postventa",
        destination: "/platform/operaciones",
        permanent: false,
      },
    ];
    const postventaGuia = [
      {
        source: "/platform/postventa/guia",
        destination: "/platform/operaciones",
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
    return [...postventaToOperaciones, ...postventaGuia, ...exact, ...withPath];
  },
};

export default nextConfig;
