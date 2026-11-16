import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dvnxzqyfsgnakbcweoql.supabase.co",
      },
    ],
  },
  async rewrites() {
    return [
      { source: '/consulta', destination: '/consultorio' },
      { source: '/consulta/:path*', destination: '/consultorio' },
      { source: '/esenciales', destination: '/configuracion/esenciales' },
      { source: '/alertas', destination: '/configuracion/alertas' },
      { source: '/historial', destination: '/configuracion/familia' },
    ];
  },
};

export default nextConfig;
