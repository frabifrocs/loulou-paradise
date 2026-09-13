import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.GITHUB_PAGES === "1" ? "/loulou-paradise/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg"],
      manifest: {
        name: "Loulou Paradise",
        short_name: "Loulou",
        description: "Registre des prestations de toilettage",
        lang: "fr",
        theme_color: "#3f7d5c",
        background_color: "#f6f4ef",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [{ src: "logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: true,
    fs: { allow: [".."] },
  },
  preview: { host: true },
  build: { outDir: "dist" },
});
