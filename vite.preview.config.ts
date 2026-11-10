import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'convex/react': resolve(process.cwd(), 'preview/mock-convex-react.ts'),
    },
  },
})
