import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @/ maps to src/ — used throughout the codebase for absolute imports
      // e.g. import { api } from '@/api/client'
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // In development, proxy /api/* to FastAPI at localhost:8000.
    // The frontend API client uses a relative base URL by default, so browser
    // requests stay same-origin and avoid CORS during local development.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Do not strip /api: FastAPI routes are namespaced under /api.
      },
    },
  },
})
