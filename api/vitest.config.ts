import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/env.d.ts', 'src/index.ts'],
      thresholds: {
        // Pure libs are easy to cover ; handlers harder due to KV mocking.
        // Keep modest thresholds, raise as we add tests.
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
