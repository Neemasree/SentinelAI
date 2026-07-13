import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/auth": "http://127.0.0.1:4000",
      "/api-keys": "http://127.0.0.1:4000",
      "/gateway": "http://127.0.0.1:4000",
      "/chaos": "http://127.0.0.1:4000",
      "/metrics": "http://127.0.0.1:4000",
      "/ws": { target: "ws://127.0.0.1:4000", ws: true }
    }
  }
});
