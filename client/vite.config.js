import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/fetch':        'http://localhost:3000',
      '/build':        'http://localhost:3000',
      '/generate-docs':'http://localhost:3000',
      '/generate':     'http://localhost:3000',
      '/validate-key': 'http://localhost:3000',
      '/audit':        'http://localhost:3000',
      '/rules':        'http://localhost:3000',
      '/health':       'http://localhost:3000',
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  }
})