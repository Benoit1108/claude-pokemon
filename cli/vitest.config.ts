import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // The two esbuild bundle roots are exercised end-to-end by the root
      // tests/cli/*.bats (out-of-process), not by vitest — exclude them from
      // the unit-coverage bar rather than mock-spawning Node + the filesystem.
      exclude: ['src/pokemon-entry.ts', 'src/statusline-entry.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
