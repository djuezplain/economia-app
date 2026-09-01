/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Spec 011 (modo offline), plan.md §1: precache del shell de la app
    // (HTML/JS/CSS) para que cargue sin conexión — no cachea peticiones a
    // la API (`navigateFallbackDenylist`/sin `runtimeCaching`), esa parte
    // la resuelve la capa de IndexedDB (`offline/db.ts`), no el Service
    // Worker. `registerType: 'autoUpdate'`: una recarga normal recoge la
    // versión nueva sin pedirle nada al usuario (sin prompt de "hay una
    // versión nueva, recarga").
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mi Economía',
        short_name: 'Mi Economía',
        description: 'Gestión de economía personal — funciona sin conexión.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3f2f2',
        theme_color: '#0088b0',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  // Sin esto, `npm run dev` solo escucha en localhost: se puede abrir
  // http://localhost:5173 pero no http://<IP de la máquina>:5173 desde
  // otro dispositivo de la misma red (conexión rechazada). `host: true`
  // hace que escuche en todas las interfaces de red.
  server: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
})
