import type { NextConfig } from "next";

// O app é empacotado pelo Capacitor: o Next gera só arquivos estáticos em out/.
// Sem servidor: nada de server actions, proxy, cookies ou rotas de API.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
