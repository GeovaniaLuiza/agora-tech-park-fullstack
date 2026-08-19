import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: {
        statements: 45,
        branches: 40,
        functions: 30,
        lines: 50,
      },
    },
  },
});
