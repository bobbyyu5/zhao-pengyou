import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the built dist/ works on Vercel, a subpath, or a
// dragged-and-dropped static host. The engine is plain ESM imported straight into the bundle.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: false },
});
