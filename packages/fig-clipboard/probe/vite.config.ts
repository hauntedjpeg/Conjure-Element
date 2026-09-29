import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { port: 5179, strictPort: true, host: "localhost" },
  build: { outDir: "dist", emptyOutDir: true },
});
