import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt" deja el service worker nuevo esperando a que alguien pulse un
      // aviso de "hay una actualización"... que no existe en ninguna pantalla.
      // El resultado era que un deploy no llegaba nunca: el navegador seguía
      // sirviendo la copia cacheada de la versión anterior.
      registerType: "autoUpdate",
      // Reuse the existing public/manifest.json — don't generate a new one
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/supabase/],
        // Tomar el control sin esperar a que se cierren todas las pestañas.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep mapbox in its own chunk — it's huge (1.7 MB) and rarely changes
          mapbox: ["mapbox-gl"],
          // Core React stack
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
