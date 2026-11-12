import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The Sonnet edition is the primary game engine: the root build serves it.
const ENGINE_ROOT = path.resolve(__dirname, "detailed-3d-sinking-freighter-game_sonnet");

// https://vite.dev/config/
export default defineConfig({
  root: ENGINE_ROOT,
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(ENGINE_ROOT, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
