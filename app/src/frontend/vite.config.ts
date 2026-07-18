import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      // Every byte of user data lives in localStorage, and the app gates
      // rendering on client hydration — so a server render can never know
      // anything about the visitor and only ever emits the loading shell.
      // SPA mode ships that shell as static HTML instead: no serverless
      // function, no cold start, and it deploys to any static host.
      spa: {
        enabled: true,
        // Emit the shell as index.html rather than the default _shell.html —
        // that's what every static host expects as its fallback document, so
        // this deploys anywhere without host-specific rewrite config.
        prerender: { outputPath: "/index" },
      },
    }),
    tailwindcss(),
    react(),
    tsconfigPaths(),
  ],
  server: {
    host: "::",
    port: 5174,
  },
});
