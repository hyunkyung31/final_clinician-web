import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep the loader's module worker URL available to Vite's worker transform.
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
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
