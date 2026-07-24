import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react({ include: /\.(js|jsx|mjs|ts|tsx)$/ }), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    proxy: {
      '/__catalyst': {
        target: 'https://datathon2026-60073929329.development.catalystserverless.in',
        changeOrigin: true
      },
      '/baas': {
        target: 'https://datathon2026-60073929329.development.catalystserverless.in',
        changeOrigin: true
      },
      '/api': {
        target: 'https://datathon2026-60073929329.development.catalystserverless.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
