import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.HOME_API ?? 'http://127.0.0.1:8000'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5190, proxy: { '/api': backend } },
  preview: { port: 5191, proxy: { '/api': backend } },
  plugins: [react()],
})
