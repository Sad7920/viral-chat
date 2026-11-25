import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    watch: { usePolling: true },
    proxy: {
      "/auth": proxyTarget,
      "/chat": proxyTarget,
      "/persona": proxyTarget,
      "/models": proxyTarget,
    },
  },
});
