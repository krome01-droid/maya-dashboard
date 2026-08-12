import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servi derrière le reverse-proxy de agent.moto-ecole-inris.fr, comme les
  // autres agents : /admin-lou, /admin-stan, /admin-angele… donc /admin-maya.
  basePath: "/admin-maya",
  output: "standalone",
  async redirects() {
    return [{ source: "/signin", destination: "/login", permanent: false }]
  },
};

export default nextConfig;
