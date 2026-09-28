import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/orion": {
        target: "http://127.0.0.1:1026",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orion/, ""),
      },
    },
  },
});
