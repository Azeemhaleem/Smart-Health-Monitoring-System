import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApi } from "./server/api.js";

function authApiPlugin() {
  return {
    name: "smartwatch-auth-api",
    configureServer(server) {
      server.middlewares.use(createApi());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApi());
    },
  };
}

export default defineConfig({
  plugins: [react(), authApiPlugin()],
  server: {
    port: 5173,
  },
});
