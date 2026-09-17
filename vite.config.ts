import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      events: 'events/',
    },
  },
  server: {
    port: 4173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'https://api.34-50-57-207.sslip.io',
        changeOrigin: true,
        secure: true,
      },
      '/ws': {
        target: 'wss://api.34-50-57-207.sslip.io',
        ws: true,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
