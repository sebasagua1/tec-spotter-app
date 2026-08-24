import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
// Ruta relativa, no el alias "@": este archivo lo ejecuta Node, donde el
// alias de `resolve` todavía no existe.
import { APP_NAME, APP_SHORT_NAME } from "./src/lib/brand";

/**
 * Sustituye {{APP_NAME}} y {{APP_SHORT_NAME}} en index.html.
 *
 * Se usan llaves dobles y no el %VAR% de Vite a propósito: ese mecanismo está
 * reservado a variables de entorno, y si la variable no existe deja el texto
 * crudo en la página.
 */
function brandHtml() {
  return {
    name: "brand-html",
    transformIndexHtml(html: string) {
      return html
        .replaceAll("{{APP_NAME}}", APP_NAME)
        .replaceAll("{{APP_SHORT_NAME}}", APP_SHORT_NAME);
    },
  };
}

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
    brandHtml(),
    VitePWA({
      // "prompt" deja el service worker nuevo esperando a que alguien pulse un
      // aviso de "hay una actualización"... que no existe en ninguna pantalla.
      // El resultado era que un deploy no llegaba nunca: el navegador seguía
      // sirviendo la copia cacheada de la versión anterior.
      registerType: "autoUpdate",
      // El manifest se genera aquí, a partir de src/lib/brand.ts, en vez de
      // vivir como archivo suelto en public/: así el nombre de la app no se
      // repite fuera de esa única fuente.
      manifestFilename: "manifest.json",
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: "Descubre, crea y únete a actividades en tu campus",
        // Explícito: si no, VitePWA pone "en" y contradice al <html lang="es">.
        lang: "es",
        start_url: "/",
        display: "standalone",
        background_color: "#F5F7FA",
        theme_color: "#003DA5",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      // Sin esto el manifest solo existe en el build de producción y en
      // desarrollo da 404, que es justo donde se comprueban estas cosas.
      devOptions: { enabled: true },
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
