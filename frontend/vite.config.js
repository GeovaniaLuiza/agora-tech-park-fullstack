import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { routerUrlBase } from './build/router-url-base.js'

export default defineConfig({
  plugins: [react(), routerUrlBase(), {
    name: 'require-production-api-url',
    apply: 'build',
    configResolved(config) {
      if (!config.env.VITE_API_URL?.trim()) {
        throw new Error('VITE_API_URL é obrigatória no build. Configure a URL da API ou /api quando houver proxy na mesma origem.');
      }
    },
  }],
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx'],
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 40,
        lines: 65,
      },
    },
  },
  server: {
    port: 5174,
  }
})
