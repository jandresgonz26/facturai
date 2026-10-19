import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Fuentes y logo que leen el PDF y la imagen para compartir de las propuestas (fs en tiempo de ejecución).
  outputFileTracingIncludes: {
    '/api/propuesta/**': ['./src/lib/propuestas/fuentes/**', './public/brand/**'],
    '/api/propuestas/**': ['./src/lib/propuestas/fuentes/**', './public/brand/**'],
    '/propuesta/**': ['./src/lib/propuestas/fuentes/**', './public/brand/**'],
  },
};

export default nextConfig;
