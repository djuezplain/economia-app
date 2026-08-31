/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
