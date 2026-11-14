import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "extension-manifest",
      generateBundle() {
        // Keep the root manifest as the only source of truth.
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
        });
      },
    },
  ],
  build: {
    target: "chrome116",
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: fileURLToPath(new URL("./extension/sidepanel/index.html", import.meta.url)),
        background: fileURLToPath(new URL("./extension/background/index.ts", import.meta.url)),
      },
      output: {
        // The manifest needs a stable service worker filename.
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
