import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["gradewise.svg"],
      manifest: {
        name: "GradeWise AI",
        short_name: "GradeWise",
        description: "A local-first assessment workspace for teachers.",
        theme_color: "#f7f7fc",
        background_color: "#f7f7fc",
        display: "standalone",
        icons: [
          { src: "/gradewise.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,woff2,svg}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
});
