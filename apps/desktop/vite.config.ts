import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Port 1421, not Tauri's default 1420: the predecessor app
// (mirror-mind-ai/mirror-desktop) uses 1420, and both may run side by side
// while it is still maintained.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: ["es2023", "safari16"],
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
