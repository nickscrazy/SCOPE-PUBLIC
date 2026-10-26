import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    // Every asset is emitted as a file rather than inlined. The production CSP allows
    // font-src 'self' only, so a font inlined as a data: URI is refused by the browser and
    // silently never loads.
    assetsInlineLimit: 0,
  },
  server: { host: "127.0.0.1" },
});
